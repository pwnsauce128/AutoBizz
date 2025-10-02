"""Administrative endpoints for managing users."""
from __future__ import annotations

from http import HTTPStatus
import uuid

from flask import Blueprint, abort, jsonify, request
from flask_jwt_extended import get_jwt_identity, jwt_required
from werkzeug.security import generate_password_hash

from ..extensions import db
from ..models import AuditLog, User, UserRole, UserStatus
from .utils import role_required


admin_bp = Blueprint("admin", __name__)


@admin_bp.post("/users")
@jwt_required()
@role_required(UserRole.ADMIN)
def create_user():
    data = request.get_json(force=True)
    email = data.get("email")
    username = data.get("username")
    role_value = data.get("role")
    password = data.get("password")

    if not email or not username or not role_value or not password:
        abort(HTTPStatus.BAD_REQUEST, description="Missing fields")

    if role_value not in {item.value for item in UserRole}:
        abort(HTTPStatus.BAD_REQUEST, description="Invalid role")

    if len(password) < 12:
        abort(HTTPStatus.BAD_REQUEST, description="Password must be at least 12 characters")

    if User.query.filter((User.email == email) | (User.username == username)).first():
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
def update_user_status(user_id: uuid.UUID):
    data = request.get_json(force=True)
    status_value = data.get("status")

    if status_value not in {item.value for item in UserStatus}:
        abort(HTTPStatus.BAD_REQUEST, description="Invalid status")

    user = User.query.filter_by(id=user_id).first()
    if user is None:
        abort(HTTPStatus.NOT_FOUND, description="User not found")

    user.status = UserStatus(status_value)
    actor_id = uuid.UUID(str(get_jwt_identity()))
    audit = AuditLog(
        actor_id=actor_id,
        action="update_user_status",
        target_type="user",
        target_id=str(user.id),
        meta={"status": status_value},
    )
    db.session.add(audit)
    db.session.commit()
    return jsonify({"id": str(user.id), "status": user.status.value})
