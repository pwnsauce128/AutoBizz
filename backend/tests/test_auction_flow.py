"""Integration tests covering core auction workflows."""
from __future__ import annotations

import csv
from datetime import datetime, timedelta, timezone
import uuid

from werkzeug.security import generate_password_hash

from app.extensions import db

from app.models import Auction, Bid, Notification, NotificationType, User, UserRole


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
            "currency": "EUR",
            "images": ["https://example.com/car.jpg"],
            "carte_grise_image": "https://example.com/carte-grise.jpg",
        },
    )
    assert create_response.status_code == 201
    auction_data = create_response.get_json()
    auction_id = auction_data["id"]
    assert auction_data["carte_grise_image_url"] == "https://example.com/carte-grise.jpg"

    buyer_token = login_user(client, "buyer1", BUYER_PASSWORD)

    bid_response = client.post(
        f"/auctions/{auction_id}/bids",
        headers=auth_headers(buyer_token),
        json={"amount": 51000},
    )
    assert bid_response.status_code == 201
    bid_data = bid_response.get_json()["bid"]
    assert bid_data["amount"] == 51000.0
    assert bid_data["buyer_username"] == "buyer1"

    list_response = client.get("/auctions")
    assert list_response.status_code == 200
    listings = list_response.get_json()
    assert listings[0]["best_bid"]["amount"] == 51000.0
    assert listings[0]["best_bid"]["buyer_username"] == "buyer1"

    notifications = Notification.query.all()
    assert any(n.type == NotificationType.NEW_AUCTION for n in notifications)
    assert any(n.type == NotificationType.RESULT for n in notifications)


def test_second_buyer_can_bid_below_best(client):
    ensure_admin_user(client)
    admin_token = login_user(client, "admin", ADMIN_PASSWORD)

    create_seller_response = client.post(
        "/admin/users",
        headers=auth_headers(admin_token),
        json={
            "email": "seller-multi-bid@example.com",
            "username": "seller-multi-bid",
            "role": UserRole.SELLER.value,
            "password": SELLER_PASSWORD,
        },
    )
    assert create_seller_response.status_code == 201

    seller_token = login_user(client, "seller-multi-bid", SELLER_PASSWORD)

    create_response = client.post(
        "/auctions",
        headers=auth_headers(seller_token),
        json={
            "title": "Peugeot 208",
            "description": "GT Line",
            "currency": "EUR",
            "images": ["https://example.com/peugeot-front.jpg"],
            "carte_grise_image": "https://example.com/peugeot-carte.jpg",
        },
    )
    assert create_response.status_code == 201
    auction_id = create_response.get_json()["id"]

    register_buyer(client, "buyer-top", "buyer-top@example.com", BUYER_PASSWORD)
    top_buyer_token = login_user(client, "buyer-top", BUYER_PASSWORD)

    first_bid = client.post(
        f"/auctions/{auction_id}/bids",
        headers=auth_headers(top_buyer_token),
        json={"amount": 25000},
    )
    assert first_bid.status_code == 201

    register_buyer(client, "buyer-second", "buyer-second@example.com", BUYER_PASSWORD)
    second_buyer_token = login_user(client, "buyer-second", BUYER_PASSWORD)

    second_bid = client.post(
        f"/auctions/{auction_id}/bids",
        headers=auth_headers(second_buyer_token),
        json={"amount": 22000},
    )
    assert second_bid.status_code == 201
    second_payload = second_bid.get_json()["bid"]
    assert second_payload["amount"] == 22000.0

    list_response = client.get("/auctions")
    assert list_response.status_code == 200
    listings = list_response.get_json()
    assert listings[0]["best_bid"]["amount"] == 25000.0
    assert listings[0]["best_bid"]["buyer_username"] == "buyer-top"


def test_seller_can_edit_and_delete_after_bid(client):
    ensure_admin_user(client)
    admin_token = login_user(client, "admin", ADMIN_PASSWORD)

    create_seller_response = client.post(
        "/admin/users",
        headers=auth_headers(admin_token),
        json={
            "email": "seller-edit-delete@example.com",
            "username": "seller-edit-delete",
            "role": UserRole.SELLER.value,
            "password": SELLER_PASSWORD,
        },
    )
    assert create_seller_response.status_code == 201

    seller_token = login_user(client, "seller-edit-delete", SELLER_PASSWORD)

    create_response = client.post(
        "/auctions",
        headers=auth_headers(seller_token),
        json={
            "title": "Citroen DS",
            "description": "Showroom condition",
            "currency": "EUR",
            "images": ["https://example.com/ds-front.jpg"],
            "carte_grise_image": "https://example.com/ds-carte.jpg",
        },
    )
    assert create_response.status_code == 201
    auction_id = create_response.get_json()["id"]

    register_buyer(client, "buyer-edit-delete", "buyer-edit-delete@example.com", BUYER_PASSWORD)
    buyer_token = login_user(client, "buyer-edit-delete", BUYER_PASSWORD)

    bid_response = client.post(
        f"/auctions/{auction_id}/bids",
        headers=auth_headers(buyer_token),
        json={"amount": 43000},
    )
    assert bid_response.status_code == 201

    update_response = client.patch(
        f"/auctions/{auction_id}",
        headers=auth_headers(seller_token),
        json={"title": "Citroen DS Updated"},
    )
    assert update_response.status_code == 200
    updated_payload = update_response.get_json()
    assert updated_payload["title"] == "Citroen DS Updated"

    delete_response = client.delete(
        f"/auctions/{auction_id}",
        headers=auth_headers(seller_token),
    )
    assert delete_response.status_code == 204

    app = client.application
    auction_uuid = uuid.UUID(auction_id)
    with app.app_context():
        assert Auction.query.filter_by(id=auction_uuid).first() is None
        assert Bid.query.filter_by(auction_id=auction_uuid).count() == 0


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
        json={
            "title": "Renault 5",
            "description": "Classic",
            "carte_grise_image": "https://example.com/carte-grise-renault.jpg",
        },
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


def test_create_auction_requires_carte_grise_image(client):
    ensure_admin_user(client)
    admin_token = login_user(client, "admin", ADMIN_PASSWORD)

    create_seller_response = client.post(
        "/admin/users",
        headers=auth_headers(admin_token),
        json={
            "email": "seller-no-carte@example.com",
            "username": "seller-no-carte",
            "role": UserRole.SELLER.value,
            "password": SELLER_PASSWORD,
        },
    )
    assert create_seller_response.status_code == 201

    seller_token = login_user(client, "seller-no-carte", SELLER_PASSWORD)

    create_response = client.post(
        "/auctions",
        headers=auth_headers(seller_token),
        json={
            "title": "Missing Carte Grise",
            "description": "Should fail",
        },
    )
    assert create_response.status_code == 400
    message = create_response.get_json()["message"].lower()
    assert "carte" in message


def test_seller_can_update_images_with_descriptor_payload(client):
    ensure_admin_user(client)
    admin_token = login_user(client, "admin", ADMIN_PASSWORD)

    create_seller_response = client.post(
        "/admin/users",
        headers=auth_headers(admin_token),
        json={
            "email": "seller-edit@example.com",
            "username": "seller-edit",
            "role": UserRole.SELLER.value,
            "password": SELLER_PASSWORD,
        },
    )
    assert create_seller_response.status_code == 201

    seller_token = login_user(client, "seller-edit", SELLER_PASSWORD)

    create_response = client.post(
        "/auctions",
        headers=auth_headers(seller_token),
        json={
            "title": "Land Rover Defender",
            "description": "Classic 110",
            "carte_grise_image": "https://example.com/carte-grise-defender.jpg",
        },
    )
    assert create_response.status_code == 201
    auction_id = create_response.get_json()["id"]

    update_response = client.patch(
        f"/auctions/{auction_id}",
        headers=auth_headers(seller_token),
        json={
            "images": [
                {"dataUrl": "data:image/jpeg;base64,AAAAB"},
                {"uri": "https://example.com/defender-front.jpg"},
                {"url": "  https://example.com/defender-rear.jpg  "},
                "https://example.com/defender-side.jpg",
            ]
        },
    )
    assert update_response.status_code == 200
    payload = update_response.get_json()
    assert payload["image_urls"] == [
        "data:image/jpeg;base64,AAAAB",
        "https://example.com/defender-front.jpg",
        "https://example.com/defender-rear.jpg",
        "https://example.com/defender-side.jpg",
    ]

    single_image = client.patch(
        f"/auctions/{auction_id}",
        headers=auth_headers(seller_token),
        json={"images": "https://example.com/defender-updated.jpg"},
    )
    assert single_image.status_code == 200
    refreshed = single_image.get_json()
    assert refreshed["image_urls"] == ["https://example.com/defender-updated.jpg"]


def test_admin_can_filter_manage_auctions_by_created_dates(client):
    ensure_admin_user(client)
    admin_token = login_user(client, "admin", ADMIN_PASSWORD)

    create_seller_response = client.post(
        "/admin/users",
        headers=auth_headers(admin_token),
        json={
            "email": "seller-date-filter@example.com",
            "username": "seller-date-filter",
            "role": UserRole.SELLER.value,
            "password": SELLER_PASSWORD,
        },
    )
    assert create_seller_response.status_code == 201

    seller_token = login_user(client, "seller-date-filter", SELLER_PASSWORD)

    older_resp = client.post(
        "/auctions",
        headers=auth_headers(seller_token),
        json={
            "title": "Older Auction",
            "description": "Should be filtered out",
            "carte_grise_image": "https://example.com/older-carte.jpg",
        },
    )
    assert older_resp.status_code == 201

    recent_resp = client.post(
        "/auctions",
        headers=auth_headers(seller_token),
        json={
            "title": "Recent Auction",
            "description": "Should remain",
            "carte_grise_image": "https://example.com/recent-carte.jpg",
        },
    )
    assert recent_resp.status_code == 201

    app = client.application
    with app.app_context():
        older = Auction.query.filter_by(title="Older Auction").first()
        recent = Auction.query.filter_by(title="Recent Auction").first()
        assert older and recent
        older.created_at = datetime.now(timezone.utc) - timedelta(days=30)
        recent.created_at = datetime.now(timezone.utc) - timedelta(days=2)
        db.session.commit()

    created_from = (datetime.now(timezone.utc) - timedelta(days=5)).date().isoformat()
    response = client.get(
        f"/auctions/manage?created_from={created_from}",
        headers=auth_headers(admin_token),
    )
    assert response.status_code == 200
    payload = response.get_json()
    assert len(payload) == 1
    assert payload[0]["title"] == "Recent Auction"

    invalid = client.get(
        "/auctions/manage?created_from=2024-05-10&created_to=2024-05-01",
        headers=auth_headers(admin_token),
    )
    assert invalid.status_code == 400
    message = invalid.get_json()["message"].lower()
    assert "created_from" in message


def test_admin_can_export_auctions_csv(client):
    ensure_admin_user(client)
    admin_token = login_user(client, "admin", ADMIN_PASSWORD)

    create_seller_response = client.post(
        "/admin/users",
        headers=auth_headers(admin_token),
        json={
            "email": "seller-export@example.com",
            "username": "seller-export",
            "role": UserRole.SELLER.value,
            "password": SELLER_PASSWORD,
        },
    )
    assert create_seller_response.status_code == 201

    seller_token = login_user(client, "seller-export", SELLER_PASSWORD)

    auction_resp = client.post(
        "/auctions",
        headers=auth_headers(seller_token),
        json={
            "title": "Export Auction",
            "description": "For CSV",
            "carte_grise_image": "https://example.com/export-carte.jpg",
        },
    )
    assert auction_resp.status_code == 201
    auction_id = auction_resp.get_json()["id"]

    register_buyer(client, "buyer-export", "buyer-export@example.com", BUYER_PASSWORD)
    buyer_token = login_user(client, "buyer-export", BUYER_PASSWORD)

    bid_response = client.post(
        f"/auctions/{auction_id}/bids",
        headers=auth_headers(buyer_token),
        json={"amount": 12345},
    )
    assert bid_response.status_code == 201

    app = client.application
    with app.app_context():
        auction = Auction.query.filter_by(id=uuid.UUID(auction_id)).first()
        assert auction is not None
        auction.created_at = datetime(2024, 1, 15, tzinfo=timezone.utc)
        db.session.commit()

    export_resp = client.get(
        "/auctions/manage/export?created_from=2024-01-01&created_to=2024-12-31",
        headers=auth_headers(admin_token),
    )
    assert export_resp.status_code == 200
    assert export_resp.headers["Content-Type"].startswith("text/csv")

    csv_rows = list(csv.reader(export_resp.data.decode().splitlines()))
    assert csv_rows[0] == ["auction name", "seller", "buyer", "price", "date"]
    assert csv_rows[1][0] == "Export Auction"
    assert csv_rows[1][1] == "seller-export"
    assert csv_rows[1][2] == "buyer-export"
    assert csv_rows[1][3].startswith("12345.00")
    assert csv_rows[1][4].startswith("2024-01-15")
