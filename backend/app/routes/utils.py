"""Utility helpers for route modules."""
from __future__ import annotations

from functools import wraps
import uuid
from typing import Callable, TypeVar

from flask import abort
from flask_jwt_extended import get_jwt, get_jwt_identity

from ..models import User
from ..models import UserRole

F = TypeVar("F", bound=Callable[..., object])


def role_required(*allowed_roles: UserRole) -> Callable[[F], F]:
    """Ensure the current JWT contains one of the *allowed_roles*."""

    def decorator(func: F) -> F:
        @wraps(func)
        def wrapper(*args, **kwargs):
            claims = get_jwt()
            role = claims.get("role")
            if role not in {value.value for value in allowed_roles}:
                abort(403, description="Insufficient permissions")
            return func(*args, **kwargs)

        return wrapper  # type: ignore[return-value]

    return decorator


def get_current_user() -> User:
    """Return the authenticated user from the JWT identity."""

    identity = get_jwt_identity()
    try:
        user_uuid = uuid.UUID(str(identity))
    except (TypeError, ValueError):
        abort(401, description="Unknown user")

    user = User.query.filter_by(id=user_uuid).first()
    if user is None:
        abort(401, description="Unknown user")
    if not user.is_active():
        abort(403, description="User account is suspended")
    return user
