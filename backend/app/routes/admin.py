"""Administrative endpoints for managing users."""
from __future__ import annotations
from http import HTTPStatus
import re
import uuid

from flask import Blueprint, abort, jsonify, request
from flask_jwt_extended import get_jwt_identity, jwt_required
from sqlalchemy import func
from werkzeug.security import generate_password_hash

from ..extensions import db
from ..models import AuditLog, User, UserRole, UserStatus
from .utils import role_required


admin_bp = Blueprint("admin", __name__)


@admin_bp.get("/users")
@jwt_required()
@role_required(UserRole.ADMIN)
def list_users():
    users = User.query.order_by(User.created_at.desc()).all()
    return (
        jsonify(
            [
                {
                    "id": str(user.id),
                    "email": user.email,
                    "username": user.username,
                    "role": user.role.value,
                    "status": user.status.value,
                    "created_at": user.created_at.isoformat(),
                }
                for user in users
            ]
        ),
        HTTPStatus.OK,
    )


@admin_bp.post("/users")
@jwt_required()
@role_required(UserRole.ADMIN)
def create_user():
    data = request.get_json(force=True)
    email = data.get("email")
    username = data.get("username")
    role_value = data.get("role")
    password = data.get("password")

    if not isinstance(email, str) or not isinstance(username, str) or not isinstance(role_value, str) or not isinstance(password, str):
        abort(HTTPStatus.BAD_REQUEST, description="Invalid field types")

    email = email.strip().lower()
    username = username.strip()
    role_value = role_value.strip().lower()
    password = password.strip()

    if not email or not username or not role_value or not password:
        abort(HTTPStatus.BAD_REQUEST, description="Missing fields")

    if not re.fullmatch(r"[A-Za-z0-9_.-]{3,32}", username):
        abort(
            HTTPStatus.BAD_REQUEST,
            description="Username must be 3-32 characters and contain only letters, numbers, dots, underscores or hyphens",
        )

    if role_value not in {item.value for item in UserRole}:
        abort(HTTPStatus.BAD_REQUEST, description="Invalid role")

    if len(password) < 12:
        abort(HTTPStatus.BAD_REQUEST, description="Password must be at least 12 characters")

    if User.query.filter((func.lower(User.email) == email) | (User.username == username)).first():
        abort(HTTPStatus.CONFLICT, description="User already exists")

    user = User(
        email=email,
        username=username,
        role=UserRole(role_value),
        password_hash=generate_password_hash(password),
    )
    db.session.add(user)

    actor_id = uuid.UUID(str(get_jwt_identity()))
    audit = AuditLog(
        actor_id=actor_id,
        action="create_user",
        target_type="user",
        target_id=str(user.id),
        meta={"role": role_value},
    )
    db.session.add(audit)
    db.session.commit()

    return jsonify({"id": str(user.id), "role": user.role.value}), 201


@admin_bp.patch("/users/<uuid:user_id>")
@jwt_required()
@role_required(UserRole.ADMIN)
def update_user(user_id: uuid.UUID):
    data = request.get_json(force=True)

    if not data:
        abort(HTTPStatus.BAD_REQUEST, description="No updates provided")

    user = User.query.filter_by(id=user_id).first()
    if user is None:
        abort(HTTPStatus.NOT_FOUND, description="User not found")

    updates: dict[str, str] = {}
    audit_entries: list[AuditLog] = []
    actor_id = uuid.UUID(str(get_jwt_identity()))

    if "status" in data:
        status_raw = data.get("status")
        if not isinstance(status_raw, str):
            abort(HTTPStatus.BAD_REQUEST, description="Invalid status")
        status_value = status_raw.strip().lower()
        if status_value not in {item.value for item in UserStatus}:
            abort(HTTPStatus.BAD_REQUEST, description="Invalid status")
        user.status = UserStatus(status_value)
        updates["status"] = user.status.value
        audit_entries.append(
            AuditLog(
                actor_id=actor_id,
                action="update_user_status",
                target_type="user",
                target_id=str(user.id),
                meta={"status": status_value},
            )
        )

    if "role" in data:
        role_raw = data.get("role")
        if not isinstance(role_raw, str):
            abort(HTTPStatus.BAD_REQUEST, description="Invalid role")
        role_value = role_raw.strip().lower()
        if role_value not in {UserRole.BUYER.value, UserRole.SELLER.value, UserRole.ADMIN.value}:
            abort(HTTPStatus.BAD_REQUEST, description="Invalid role")
        user.role = UserRole(role_value)
        updates["role"] = user.role.value
        audit_entries.append(
            AuditLog(
                actor_id=actor_id,
                action="update_user_role",
                target_type="user",
                target_id=str(user.id),
                meta={"role": role_value},
            )
        )

    if not updates:
        abort(HTTPStatus.BAD_REQUEST, description="No valid updates provided")

    for audit in audit_entries:
        db.session.add(audit)
    db.session.commit()

    response = {"id": str(user.id), **updates}
    return jsonify(response)
