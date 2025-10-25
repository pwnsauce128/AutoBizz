"""Authentication-specific regression tests."""
from __future__ import annotations


PASSWORD = "ComplexPass123!"


def test_login_is_case_insensitive_for_email(client):
    register_response = client.post(
        "/auth/register",
        json={
            "username": "casebuyer",
            "email": "buyer@example.com",
            "password": PASSWORD,
        },
    )
    assert register_response.status_code == 201

    login_response = client.post(
        "/auth/login",
        json={
            "usernameOrEmail": "BUYER@EXAMPLE.COM",
            "password": PASSWORD,
        },
    )

    assert login_response.status_code == 200
    body = login_response.get_json()
    assert "access" in body
    assert body["user"]["username"] == "casebuyer"


def test_username_login_does_not_match_other_user_email(client):
    first_response = client.post(
        "/auth/register",
        json={
            "username": "uniqueuser",
            "email": "unique@example.com",
            "password": PASSWORD,
        },
    )
    assert first_response.status_code == 201

    second_response = client.post(
        "/auth/register",
        json={
            "username": "anotheruser",
            "email": "uniqueuser@example.com",
            "password": PASSWORD,
        },
    )
    assert second_response.status_code == 201

    login_response = client.post(
        "/auth/login",
        json={
            "usernameOrEmail": "uniqueuser",
            "password": PASSWORD,
        },
    )

    assert login_response.status_code == 200
    body = login_response.get_json()
    assert body["user"]["username"] == "uniqueuser"
