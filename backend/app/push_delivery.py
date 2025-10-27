"""Utilities for delivering Expo push notifications."""
from __future__ import annotations

import logging
import threading
import uuid
from typing import Iterable, Sequence

import requests
from sqlalchemy import event
from sqlalchemy.orm import object_session

from .extensions import db
from .models import Auction, Device, Notification, NotificationType


EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send"
_LISTENER_KEY = "push_delivery_listener_registered"
_PENDING_KEY = "_push_delivery_pending_ids"
logger = logging.getLogger(__name__)


def init_app(app) -> None:
    """Attach SQLAlchemy event listeners used for push delivery."""

    if app.extensions.get(_LISTENER_KEY):
        return

    def _collect_notification(mapper, connection, target):  # pragma: no cover - signature required
        session = object_session(target)
        if session is None:
            return
        pending = session.info.setdefault(_PENDING_KEY, [])
        tokens = [
            device.expo_push_token
            for device in session.query(Device).filter_by(user_id=target.user_id).all()
        ]
        data = _extract_notification_data(target)
        data["tokens"] = tokens
        pending.append(data)

    def _after_commit(session):  # pragma: no cover - signature required
        pending = session.info.pop(_PENDING_KEY, [])
        if not pending or app.config.get("DISABLE_PUSH_DELIVERY", False):
            return
        for notification_data in pending:
            _dispatch_delivery(app, notification_data)

    def _after_rollback(session):  # pragma: no cover - signature required
        session.info.pop(_PENDING_KEY, None)

    event.listen(Notification, "after_insert", _collect_notification)
    event.listen(db.session, "after_commit", _after_commit)
    event.listen(db.session, "after_rollback", _after_rollback)
    app.extensions[_LISTENER_KEY] = True


def _dispatch_delivery(app, notification_data) -> None:
    """Schedule delivery for a notification payload in a background worker."""

    if not app.config.get("PUSH_DELIVERY_USE_THREAD", True):
        with app.app_context():
            deliver_notification(notification_data)
        return

    def _worker() -> None:
        with app.app_context():
            deliver_notification(notification_data)

    notification_id = notification_data.get("id") if isinstance(notification_data, dict) else notification_data
    thread = threading.Thread(target=_worker, daemon=True, name=f"push-delivery-{notification_id}")
    thread.start()


def deliver_notification(notification) -> None:
    """Deliver the given notification via Expo push."""

    if isinstance(notification, (str, uuid.UUID)):
        db_notification = db.session.get(Notification, notification)
        if db_notification is None:
            logger.debug("Notification %s no longer exists; skipping push delivery", notification)
            return
        data = _extract_notification_data(db_notification)
    elif isinstance(notification, Notification):
        data = _extract_notification_data(notification)
    else:
        data = notification

    user_id = data.get("user_id")
    if user_id is None:
        logger.debug("Notification %s missing user_id; skipping", data.get("id"))
        return

    tokens = data.get("tokens")
    if tokens is None:
        devices = Device.query.filter_by(user_id=user_id).all()
        tokens = [device.expo_push_token for device in devices]
    if not tokens:
        logger.debug(
            "No registered Expo push tokens for user %s; skipping notification %s",
            user_id,
            data.get("id"),
        )
        return

    title, body, payload = _render_message(data)
    messages = [
        {
            "to": token,
            "title": title,
            "body": body,
            "sound": "default",
            "data": payload,
        }
        for token in tokens
    ]

    try:
        _send_to_expo(messages)
    except Exception as exc:  # pragma: no cover - defensive logging
        logger.exception("Failed to deliver notification %s: %s", data.get("id"), exc)


def _extract_notification_data(notification: Notification) -> dict:
    return {
        "id": notification.id,
        "user_id": notification.user_id,
        "type": notification.type,
        "payload": dict(notification.payload or {}),
        "created_at": notification.created_at,
    }


def _render_message(notification_data: dict) -> tuple[str, str, dict]:
    """Return the title, body, and payload for a notification dict."""

    notif_type = notification_data.get("type")
    if notif_type is None:
        notif_type = NotificationType.NEW_AUCTION
    elif not isinstance(notif_type, NotificationType):
        notif_type = NotificationType(notif_type)

    payload = dict(notification_data.get("payload") or {})
    payload.update(
        {
            "notification_id": str(notification_data.get("id")) if notification_data.get("id") else None,
            "type": notif_type.value,
            "created_at": notification_data.get("created_at").isoformat()
            if notification_data.get("created_at")
            else None,
        }
    )

    title = "AutoBizz"
    body = "You have a new notification."

    if notif_type == NotificationType.NEW_AUCTION:
        title = "New auction available"
        auction_title = _lookup_auction_title(payload.get("auction_id"))
        if auction_title:
            body = auction_title
        else:
            body = "A new vehicle auction just went live."
    elif notif_type == NotificationType.RESULT:
        title = "Auction update"
        latest_bid = payload.get("latest_bid") or {}
        amount = latest_bid.get("amount")
        currency = _lookup_auction_currency(payload.get("auction_id"))
        if amount is not None:
            try:
                amount = float(amount)
            except (TypeError, ValueError):  # pragma: no cover - defensive conversion
                amount = None
        if amount is not None and currency:
            body = f"Latest bid: {currency} {amount:,.2f}"
        elif amount is not None:
            body = f"Latest bid: {amount:,.2f}"
        else:
            body = "There is an update on your auction."

    return title, body, payload


def _lookup_auction_title(auction_id: str | None) -> str | None:
    if not auction_id:
        return None
    try:
        auction_uuid = uuid.UUID(str(auction_id))
    except ValueError:
        return None
    auction = db.session.get(Auction, auction_uuid)
    return auction.title if auction else None


def _lookup_auction_currency(auction_id: str | None) -> str | None:
    if not auction_id:
        return None
    try:
        auction_uuid = uuid.UUID(str(auction_id))
    except ValueError:
        return None
    auction = db.session.get(Auction, auction_uuid)
    return auction.currency if auction else None


def _send_to_expo(messages: Sequence[dict]) -> None:
    if not messages:
        return
    response = requests.post(EXPO_PUSH_URL, json=list(messages), timeout=10)
    response.raise_for_status()

    # Expo responses include both top-level errors and per-ticket data. We log the
    # errors so operators can monitor invalid tokens without raising exceptions.
    try:
        payload = response.json()
    except ValueError:  # pragma: no cover - Expo should always return JSON
        logger.debug("Expo push response was not JSON")
        return

    errors: Iterable = payload.get("errors", []) or []
    for error in errors:
        logger.error("Expo push error: %s", error)

    data = payload.get("data")
    if isinstance(data, list):
        for item in data:
            if isinstance(item, dict) and item.get("status") == "error":
                logger.error("Expo push ticket error: %s", item)
