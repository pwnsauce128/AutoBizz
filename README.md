# AutoBet Backend (MVP)

This repository contains a Flask-based backend prototype for the AutoBet MVP described in the product *cahier des charges*. It implements core workflows for authentication, auction lifecycle management, bidding rules, and push notification registration while staying close to the specified domain model.

## Features

- JWT authentication with role-based access control for admins, sellers, and buyers.
- Administrative APIs for user provisioning and status updates.
- Seller-facing auction CRUD with automatic 24h window enforcement and notification fan-out.
- Buyer bidding API with validation of positive bid amounts, highest bid requirement, and two-bid limit per auction.
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

### Environment variables

Set the required secrets before launching the server. On macOS/Linux:

```bash
export JWT_SECRET_KEY="change-me"
export DATABASE_URL="sqlite:///autobet.db"
python backend/run.py
```

On Windows PowerShell:

```powershell
$env:JWT_SECRET_KEY = "change-me"
$env:DATABASE_URL = "sqlite:///autobet.db"
python backend/run.py
```

### Production setup script

Run the interactive helper to prepare a production deployment in one pass:

```bash
python backend/setup_production.py
```

The script can:

- Install the backend dependencies with `pip`.
- Collect your production `DATABASE_URL`, generate or accept a JWT secret, and capture optional CORS origins.
- Write the collected values to an environment file (for example `backend/.env.production`).
- Execute the Flask application factory so your target database has all required tables.
- Seed (or update) the first administrator account, including password rotation if an admin already exists.

### Bootstrapping the first admin (manual alternative)

If you prefer to provision the administrator manually, configure the environment variables above so they point at the production database and then run:

```bash
python - <<'PY'
from werkzeug.security import generate_password_hash
from app import create_app
from app.extensions import db
from app.models import User, UserRole

ADMIN_USERNAME = "admin"
ADMIN_EMAIL = "admin@example.com"
ADMIN_PASSWORD = "ChangeMe123!"  # update this before running

app = create_app()
with app.app_context():
    existing = User.query.filter_by(username=ADMIN_USERNAME).first()
    if existing:
        print(f"User '{ADMIN_USERNAME}' already exists; nothing to do.")
    else:
        admin = User(
            username=ADMIN_USERNAME,
            email=ADMIN_EMAIL,
            role=UserRole.ADMIN,
            password_hash=generate_password_hash(ADMIN_PASSWORD),
        )
        db.session.add(admin)
        db.session.commit()
        print(
            f"Created admin '{ADMIN_USERNAME}'. Remember to change the password after the first login."
        )
PY
```

The script is idempotent, so re-running it is safe; it will simply inform you if the admin account is already present.

## Expo client

An Expo Go compatible mobile client lives in the [`frontend/`](frontend/README.md) directory. It implements buyer registration, login, the active auction feed, auction detail, and bid placement against this backend. Follow the frontend README for setup instructions.
