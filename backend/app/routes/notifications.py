"""Notification endpoints."""
from __future__ import annotations

from http import HTTPStatus

from flask import Blueprint, abort, jsonify, request
from flask_jwt_extended import jwt_required

from ..extensions import db
from ..models import Device
from .utils import get_current_user


notifications_bp = Blueprint("notifications", __name__)


@notifications_bp.post("/devices")
@jwt_required()
def register_device():
    user = get_current_user()
    data = request.get_json(force=True)
    token = data.get("expo_push_token")

    if not token:
        abort(HTTPStatus.BAD_REQUEST, description="Missing expo_push_token")

    device = Device.query.filter_by(expo_push_token=token).first()
    if device is None:
        device = Device(user_id=user.id, expo_push_token=token)
        db.session.add(device)
    else:
        device.user_id = user.id

    db.session.commit()
    return jsonify({"device_id": str(device.id)}), HTTPStatus.CREATED
