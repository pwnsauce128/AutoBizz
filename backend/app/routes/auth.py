"""Authentication and authorization endpoints."""
from __future__ import annotations

from http import HTTPStatus
import re
import uuid

from flask import Blueprint, abort, jsonify, request
from flask_jwt_extended import (
    create_access_token,
    create_refresh_token,
    get_jwt,
    get_jwt_identity,
    jwt_required,
)
from sqlalchemy import func
from werkzeug.security import check_password_hash, generate_password_hash

from ..extensions import db
from ..models import AuditLog, User, UserRole, UserStatus
from .utils import role_required


auth_bp = Blueprint("auth", __name__)


@auth_bp.post("/register")
def register_user():
    data = request.get_json(force=True)
    username = data.get("username")
    email = data.get("email")
    password = data.get("password")
    requested_role = data.get("role")

    if not isinstance(username, str) or not isinstance(email, str) or not isinstance(password, str):
        abort(HTTPStatus.BAD_REQUEST, description="Invalid field types")

    username = username.strip()
    email = email.strip().lower()
    password = password.strip()

    if not username or not password or not email:
        abort(HTTPStatus.BAD_REQUEST, description="Missing required fields")

    if not re.fullmatch(r"[A-Za-z0-9_.-]{3,32}", username):
        abort(
            HTTPStatus.BAD_REQUEST,
            description="Username must be 3-32 characters and contain only letters, numbers, dots, underscores or hyphens",
        )

    if len(password) < 12:
        abort(HTTPStatus.BAD_REQUEST, description="Password must be at least 12 characters")

    if requested_role and requested_role != UserRole.BUYER.value:
        abort(HTTPStatus.FORBIDDEN, description="Role selection is restricted")

    if User.query.filter((func.lower(User.email) == email) | (User.username == username)).first():
        abort(HTTPStatus.CONFLICT, description="User already exists")

    user = User(
        username=username,
        email=email,
        password_hash=generate_password_hash(password),
        role=UserRole.BUYER,
    )
    db.session.add(user)
    db.session.commit()

    return jsonify({"id": str(user.id), "username": user.username, "role": user.role.value}), 201


@auth_bp.post("/login")
def login():
    data = request.get_json(force=True)
    identifier = data.get("usernameOrEmail")
    password = data.get("password")
    if not isinstance(identifier, str) or not isinstance(password, str):
        abort(HTTPStatus.BAD_REQUEST, description="Invalid credentials")

    identifier = identifier.strip()
    if not identifier or not password:
        abort(HTTPStatus.BAD_REQUEST, description="Missing credentials")

    user = User.query.filter(
        (User.username == identifier) | (User.email == identifier)
    ).first()
    if user is None or not check_password_hash(user.password_hash, password):
        abort(HTTPStatus.UNAUTHORIZED, description="Invalid credentials")

    if not user.is_active():
        abort(HTTPStatus.FORBIDDEN, description="User suspended")

    additional_claims = {"role": user.role.value, "status": user.status.value}
    return jsonify(
        {
            "access": create_access_token(identity=str(user.id), additional_claims=additional_claims),
            "refresh": create_refresh_token(identity=str(user.id), additional_claims=additional_claims),
            "user": {
                "id": str(user.id),
                "username": user.username,
                "role": user.role.value,
                "status": user.status.value,
            },
        }
    )


@auth_bp.post("/refresh")
@jwt_required(refresh=True)
def refresh_token():
    identity = get_jwt_identity()
    claims = get_jwt()
    role = claims.get("role", UserRole.BUYER.value)
    status = claims.get("status", UserStatus.ACTIVE.value)
    return jsonify(
        {
            "access": create_access_token(
                identity=identity, additional_claims={"role": role, "status": status}
            )
        }
    )


@auth_bp.post("/invite")
@jwt_required()
@role_required(UserRole.ADMIN)
def invite_user():
    data = request.get_json(force=True)
    email = data.get("email")
    role_value = data.get("role", UserRole.BUYER.value)

    if role_value not in {item.value for item in UserRole}:
        abort(HTTPStatus.BAD_REQUEST, description="Invalid role")

    actor_id = uuid.UUID(str(get_jwt_identity()))
    audit = AuditLog(
        actor_id=actor_id,
        action="invite_user",
        target_type="user",
        target_id=email or "unknown",
        meta={"role": role_value},
    )
    db.session.add(audit)
    db.session.commit()
    return jsonify({"message": "Invitation recorded"}), 201


@auth_bp.post("/reset")
@jwt_required()
@role_required(UserRole.ADMIN)
def reset_password():
    data = request.get_json(force=True)
    user_id = data.get("user_id")
    user = User.query.filter_by(id=user_id).first()
    if user is None:
        abort(HTTPStatus.NOT_FOUND, description="User not found")

    actor_id = uuid.UUID(str(get_jwt_identity()))
    audit = AuditLog(
        actor_id=actor_id,
        action="reset_password",
        target_type="user",
        target_id=str(user.id),
    )
    db.session.add(audit)
    db.session.commit()
    return jsonify({"message": "Password reset dispatched"})
