# AutoBet Backend (MVP)

This repository contains a Flask-based backend prototype for the AutoBet MVP described in the product *cahier des charges*. It implements core workflows for authentication, auction lifecycle management, bidding rules, and push notification registration while staying close to the specified domain model.

## Features

- JWT authentication with role-based access control for admins, sellers, and buyers.
- Administrative APIs for user provisioning and status updates.
- Seller-facing auction CRUD with automatic 24h window enforcement and notification fan-out.
- Buyer bidding API with validation of minimum price, highest bid requirement, and two-bid limit per auction.
- Notification registry endpoints for Expo push tokens plus persistence of notification events.
- `/time` endpoint exposing canonical server time for client countdown synchronization.
- SQLAlchemy models aligned with the proposed data schema (users, auctions, bids, notifications, audit logs, devices).
- Integration tests covering critical seller/buyer flows using pytest.

## Getting started

```bash
pip install -r backend/requirements.txt
python backend/run.py  # launches a debug server on http://127.0.0.1:5000
```

Run the automated tests:

```bash
pytest backend/tests
```

The application defaults to an in-memory SQLite database when running tests and to a local SQLite file (`autobet.db`) for development. Configure `DATABASE_URL` and `JWT_SECRET_KEY` environment variables in production deployments.
