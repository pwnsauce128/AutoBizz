"""Integration tests covering core auction workflows."""
from __future__ import annotations

from werkzeug.security import generate_password_hash

from app.extensions import db
from app.models import Notification, NotificationType, User, UserRole


ADMIN_PASSWORD = "AdminPassw0rd!"
SELLER_PASSWORD = "SellerPassw0rd!"
BUYER_PASSWORD = "BuyerPassw0rd!"


def ensure_admin_user(client) -> None:
    app = client.application
    with app.app_context():
        if User.query.filter_by(username="admin").first() is None:
            admin = User(
                username="admin",
                email="admin@example.com",
                role=UserRole.ADMIN,
                password_hash=generate_password_hash(ADMIN_PASSWORD),
            )
            db.session.add(admin)
            db.session.commit()


def register_buyer(client, username: str, email: str, password: str):
    response = client.post(
        "/auth/register",
        json={"username": username, "email": email, "password": password},
    )
    assert response.status_code == 201
    return response.get_json()


def login_user(client, identifier: str, password: str) -> str:
    response = client.post(
        "/auth/login",
        json={"usernameOrEmail": identifier, "password": password},
    )
    assert response.status_code == 200
    return response.get_json()["access"]


def auth_headers(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


def test_seller_can_create_and_buyer_can_bid(client):
    ensure_admin_user(client)
    admin_token = login_user(client, "admin", ADMIN_PASSWORD)

    register_buyer(client, "buyer1", "buyer1@example.com", BUYER_PASSWORD)
    create_seller_response = client.post(
        "/admin/users",
        headers=auth_headers(admin_token),
        json={
            "email": "seller1@example.com",
            "username": "seller1",
            "role": UserRole.SELLER.value,
            "password": SELLER_PASSWORD,
        },
    )
    assert create_seller_response.status_code == 201

    seller_token = login_user(client, "seller1", SELLER_PASSWORD)

    create_response = client.post(
        "/auctions",
        headers=auth_headers(seller_token),
        json={
            "title": "Tesla Model S",
            "description": "Performance trim",
            "min_price": 50000,
            "currency": "EUR",
            "images": ["https://example.com/car.jpg"],
        },
    )
    assert create_response.status_code == 201
    auction_data = create_response.get_json()
    auction_id = auction_data["id"]

    buyer_token = login_user(client, "buyer1", BUYER_PASSWORD)

    bid_response = client.post(
        f"/auctions/{auction_id}/bids",
        headers=auth_headers(buyer_token),
        json={"amount": 51000},
    )
    assert bid_response.status_code == 201
    bid_data = bid_response.get_json()["bid"]
    assert bid_data["amount"] == 51000.0

    list_response = client.get("/auctions")
    assert list_response.status_code == 200
    listings = list_response.get_json()
    assert listings[0]["best_bid"]["amount"] == 51000.0

    notifications = Notification.query.all()
    assert any(n.type == NotificationType.NEW_AUCTION for n in notifications)
    assert any(n.type == NotificationType.RESULT for n in notifications)


def test_buyer_cannot_exceed_bid_limit(client):
    ensure_admin_user(client)
    admin_token = login_user(client, "admin", ADMIN_PASSWORD)

    create_seller_response = client.post(
        "/admin/users",
        headers=auth_headers(admin_token),
        json={
            "email": "seller2@example.com",
            "username": "seller2",
            "role": UserRole.SELLER.value,
            "password": SELLER_PASSWORD,
        },
    )
    assert create_seller_response.status_code == 201

    seller_token = login_user(client, "seller2", SELLER_PASSWORD)

    auction_resp = client.post(
        "/auctions",
        headers=auth_headers(seller_token),
        json={"title": "Renault 5", "description": "Classic", "min_price": 1000},
    )
    auction_id = auction_resp.get_json()["id"]

    register_buyer(client, "buyer2", "buyer2@example.com", BUYER_PASSWORD)
    buyer_token = login_user(client, "buyer2", BUYER_PASSWORD)

    for amount in (1200, 1500):
        response = client.post(
            f"/auctions/{auction_id}/bids",
            headers=auth_headers(buyer_token),
            json={"amount": amount},
        )
        assert response.status_code == 201

    third_bid = client.post(
        f"/auctions/{auction_id}/bids",
        headers=auth_headers(buyer_token),
        json={"amount": 2000},
    )
    assert third_bid.status_code == 400
    assert "limit" in third_bid.get_json()["message"].lower()


def test_cors_headers_allow_frontend_origin(client):
    origin = "http://localhost:19006"
    response = client.options(
        "/auth/login",
        headers={
            "Origin": origin,
            "Access-Control-Request-Method": "POST",
        },
    )
    assert response.status_code == 200
    assert response.headers.get("Access-Control-Allow-Origin") in {"*", origin}
