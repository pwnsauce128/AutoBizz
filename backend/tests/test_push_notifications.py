from __future__ import annotations

from app import push_delivery
from app.extensions import db
from app.models import (
    Auction,
    Notification,
    NotificationType,
    User,
    UserRole,
    Device,
)


def _create_user(username: str, role: UserRole) -> User:
    user = User(
        username=username,
        email=f"{username}@example.com",
        password_hash="hashed",
        role=role,
    )
    db.session.add(user)
    db.session.flush()
    return user


def test_deliver_notification_sends_to_registered_devices(app, monkeypatch):
    seller = _create_user("seller", UserRole.SELLER)
    buyer = _create_user("buyer", UserRole.BUYER)

    auction = Auction(
        seller_id=seller.id,
        title="Vintage Porsche",
        description="1967 Porsche 911 in mint condition",
        currency="EUR",
    )
    db.session.add(auction)
    db.session.flush()

    device = Device(user_id=buyer.id, expo_push_token="ExponentPushToken[abc123]")
    db.session.add(device)
    db.session.flush()

    app.config["DISABLE_PUSH_DELIVERY"] = True

    notification = Notification(
        user_id=buyer.id,
        type=NotificationType.NEW_AUCTION,
        payload={"auction_id": str(auction.id)},
    )
    db.session.add(notification)
    db.session.flush()
    app.config["DISABLE_PUSH_DELIVERY"] = False

    sent_messages = []

    def fake_send(messages):
        sent_messages.extend(messages)

    monkeypatch.setattr("app.push_delivery._send_to_expo", fake_send)

    push_delivery.deliver_notification(notification.id)

    assert len(sent_messages) == 1
    message = sent_messages[0]
    assert message["to"] == device.expo_push_token
    assert message["title"] == "New auction available"
    assert message["body"] == auction.title
    assert message["data"]["notification_id"] == str(notification.id)
    assert message["data"]["type"] == NotificationType.NEW_AUCTION.value


def test_notification_insert_triggers_dispatch(app, monkeypatch):
    push_delivery.init_app(app)

    triggered = []

    def fake_dispatch(app_obj, notification_data):
        triggered.append(notification_data)

    monkeypatch.setattr(push_delivery, "_dispatch_delivery", fake_dispatch)

    seller = _create_user("seller2", UserRole.SELLER)
    buyer = _create_user("buyer2", UserRole.BUYER)

    auction = Auction(
        seller_id=seller.id,
        title="Tesla Model S",
        description="2022 Performance",
        currency="USD",
    )
    db.session.add(auction)
    db.session.flush()

    notification = Notification(
        user_id=buyer.id,
        type=NotificationType.RESULT,
        payload={
            "auction_id": str(auction.id),
            "latest_bid": {"amount": "75000"},
        },
    )
    db.session.add(notification)
    db.session.commit()

    assert any(entry.get("id") == notification.id for entry in triggered)
