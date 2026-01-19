"""Notification endpoints."""
from __future__ import annotations

from http import HTTPStatus

from flask import Blueprint, abort, current_app, jsonify, request
from flask_jwt_extended import jwt_required

from ..extensions import db
from ..models import Device, WebPushSubscription
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


@notifications_bp.get("/web-push/public-key")
def web_push_public_key():
    public_key = current_app.config.get("WEB_PUSH_VAPID_PUBLIC_KEY")
    if not public_key:
        abort(HTTPStatus.SERVICE_UNAVAILABLE, description="Web push is not configured")
    return jsonify({"public_key": public_key}), HTTPStatus.OK


@notifications_bp.post("/web-push/subscriptions")
@jwt_required()
def register_web_push_subscription():
    user = get_current_user()
    data = request.get_json(force=True) or {}
    endpoint = data.get("endpoint")
    keys = data.get("keys") or {}
    p256dh = keys.get("p256dh")
    auth = keys.get("auth")

    if not endpoint or not p256dh or not auth:
        abort(HTTPStatus.BAD_REQUEST, description="Missing web push subscription details")

    subscription = WebPushSubscription.query.filter_by(endpoint=endpoint).first()
    if subscription is None:
        subscription = WebPushSubscription(
            user_id=user.id,
            endpoint=endpoint,
            p256dh=p256dh,
            auth=auth,
        )
        db.session.add(subscription)
    else:
        subscription.user_id = user.id
        subscription.p256dh = p256dh
        subscription.auth = auth

    db.session.commit()
    return jsonify({"subscription_id": str(subscription.id)}), HTTPStatus.CREATED
