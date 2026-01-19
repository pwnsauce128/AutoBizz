# AutoBet Backend (MVP)

This repository contains a Flask-based backend prototype for the AutoBet MVP described in the product *cahier des charges*. It implements core workflows for authentication, auction lifecycle management, bidding rules, and push notification registration while staying close to the specified domain model.

## Features

- JWT authentication with role-based access control for admins, sellers, and buyers.
- Administrative APIs for user provisioning and status updates.
- Seller-facing auction CRUD with automatic 24h window enforcement and notification fan-out.
- Buyer bidding API with validation of positive bid amounts, highest bid requirement, and two-bid limit per auction.
- Notification registry endpoints plus persistence of notification events.
- `/time` endpoint exposing canonical server time for client countdown synchronization.
- SQLAlchemy models aligned with the proposed data schema (users, auctions, bids, notifications, audit logs, devices).
- Integration tests covering critical seller/buyer flows using pytest.

## Getting started

```bash
pip install -r backend/requirements.txt
python backend/run.py  # launches a debug server on http://127.0.0.1:5000
```

To run the app with Gunicorn (recommended for production), ensure the required environment variables are set and then execute:

```bash
export JWT_SECRET_KEY="change-me"
export DATABASE_URL="sqlite:///autobet.db"
gunicorn --chdir backend "app:create_app()" --bind 0.0.0.0:8000 --workers 4
```

Run the automated tests:

```bash
pytest backend/tests
```

The application defaults to an in-memory SQLite database when running tests and to a local SQLite file (`autobet.db`) for development. Configure `DATABASE_URL` and `JWT_SECRET_KEY` environment variables in production deployments.

## Web UI (browser only)

The browser-only client lives in `frontend/web-ui/` and can be served as static files. Start the backend first, then run a static file server from the repository root:

```bash
python backend/run.py
```

```bash
python -m http.server 8080
```

Open <http://localhost:8080/frontend/web-ui/> in your browser.

To point the UI at a different backend, set a global variable or local storage value before reloading the page:

```html
<script>
  window.EXPO_PUBLIC_API_URL = 'https://your-backend.example.com';
</script>
```

```js
localStorage.setItem('apiBaseUrl', 'https://your-backend.example.com');
```

## MySQL setup helper

Use the MySQL helper script to install a MySQL server/client (where supported), create the database/user, install the Python driver, and write an environment file:

```bash
bash backend/scripts/mysql_setup.sh
```

## Environment variables

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

## Production setup script

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

## Enabling HTTPS

The backend enforces HTTPS when `ENFORCE_HTTPS=true` (default). Terminate TLS at your reverse proxy or load balancer (for example Nginx or HAProxy) and point it at the Flask/Gunicorn process over plain HTTP. Place the certificate and private key where your proxy expects them—on most Linux distributions that is `/etc/letsencrypt/live/<your-domain>/fullchain.pem` and `/etc/letsencrypt/live/<your-domain>/privkey.pem` when using Let’s Encrypt. If you provide your own certificate, store it alongside your proxy’s TLS assets (for example `/etc/ssl/<your-domain>/`), reference the paths in the proxy config, and ensure the proxy sends `X-Forwarded-Proto: https` so the app can recognize secure requests.

## Bootstrapping the first admin (manual alternative)

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
