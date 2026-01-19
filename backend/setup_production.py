#!/usr/bin/env python3
"""Interactive production setup helper for the AutoBet backend."""
from __future__ import annotations

import os
import secrets
import subprocess
import sys
from getpass import getpass
from pathlib import Path
import shutil
from typing import Callable

from sqlalchemy.engine.url import make_url

BACKEND_DIR = Path(__file__).resolve().parent
PROJECT_ROOT = BACKEND_DIR.parent


def _print_title(title: str) -> None:
    line = "=" * len(title)
    print(f"\n{title}\n{line}")


def _prompt(text: str, *, default: str | None = None, allow_empty: bool = False) -> str:
    while True:
        suffix = f" [{default}]" if default else ""
        response = input(f"{text}{suffix}: ").strip()
        if not response and default is not None:
            response = default
        if not response and not allow_empty:
            print("A value is required.")
            continue
        return response


def _prompt_bool(text: str, *, default: bool = True) -> bool:
    options = "Y/n" if default else "y/N"
    while True:
        response = input(f"{text} ({options}): ").strip().lower()
        if not response:
            return default
        if response in {"y", "yes"}:
            return True
        if response in {"n", "no"}:
            return False
        print("Please answer 'y' or 'n'.")


def _ensure_requirements_installed() -> None:
    requirements = BACKEND_DIR / "requirements.txt"
    if not requirements.exists():
        print("Could not find backend/requirements.txt; skipping dependency installation.")
        return
    print("Installing backend dependencies via pip...")
    subprocess.run([sys.executable, "-m", "pip", "install", "-r", str(requirements)], check=True)


def _collect_database_url() -> str:
    default = os.environ.get("DATABASE_URL", "postgresql+psycopg://user:pass@host/dbname")
    while True:
        candidate = _prompt("Database URL", default=default)
        try:
            make_url(candidate)
        except Exception as exc:  # pragma: no cover - defensive branch
            print(f"The value does not look like a valid SQLAlchemy URL ({exc}). Please try again.")
            continue
        return candidate


def _collect_postgres_admin_url(db_url: str) -> str:
    url = make_url(db_url)
    admin_default = url.set(database="postgres")
    return _prompt("PostgreSQL admin URL", default=str(admin_default))


def _ensure_database_exists(db_url: str, admin_url: str | None = None) -> None:
    url = make_url(db_url)
    if url.drivername.startswith("sqlite"):
        if url.database in (None, "", ":memory:"):
            print("SQLite in-memory database requested; skipping file creation.")
            return
        db_path = Path(url.database)
        if not db_path.is_absolute():
            db_path = (PROJECT_ROOT / db_path).resolve()
        db_path.parent.mkdir(parents=True, exist_ok=True)
        if not db_path.exists():
            db_path.touch()
            print(f"Created SQLite database file at {db_path}.")
        else:
            print(f"SQLite database file already exists at {db_path}.")
        return

    if url.drivername.startswith("postgresql"):
        if shutil.which("psql") is None:
            print("psql is not available; please create the PostgreSQL database manually.")
            return
        database_name = url.database
        if not database_name:
            print("No database name found in DATABASE_URL; skipping database creation.")
            return
        if admin_url is None:
            admin_url = _collect_postgres_admin_url(db_url)
        admin_url = make_url(admin_url)
        env = os.environ.copy()
        if admin_url.password:
            env["PGPASSWORD"] = admin_url.password
        query = f"SELECT 1 FROM pg_database WHERE datname = '{database_name}';"
        result = subprocess.run(
            ["psql", str(admin_url), "-tAc", query],
            check=False,
            capture_output=True,
            text=True,
            env=env,
        )
        if result.returncode != 0:
            print("Unable to query PostgreSQL for database existence:")
            print(result.stderr.strip())
            return
        if result.stdout.strip() == "1":
            print(f"PostgreSQL database '{database_name}' already exists.")
            return
        owner_flag = []
        if url.username:
            owner_flag = ["--owner", url.username]
        if shutil.which("createdb") is not None:
            createdb_cmd = ["createdb", database_name, "--dbname", str(admin_url), *owner_flag]
            subprocess.run(createdb_cmd, check=True, env=env)
        else:
            owner_sql = f' OWNER "{url.username}"' if url.username else ""
            subprocess.run(
                [
                    "psql",
                    str(admin_url),
                    "-c",
                    f'CREATE DATABASE "{database_name}"{owner_sql};',
                ],
                check=True,
                env=env,
            )
        print(f"Created PostgreSQL database '{database_name}'.")
        return

    print(
        f"Database creation is not automated for '{url.drivername}'. "
        "Please ensure the database exists before continuing."
    )


def _collect_jwt_secret() -> str:
    if _prompt_bool("Generate a random JWT secret for you?", default=True):
        secret = secrets.token_urlsafe(64)
        print("Generated secret:")
        print(secret)
        if _prompt_bool("Use this generated secret?", default=True):
            return secret
    return _prompt("JWT secret", default=os.environ.get("JWT_SECRET_KEY"))


def _collect_cors_origins() -> str | None:
    value = _prompt(
        "Allowed CORS origins (comma separated, leave blank for '*')",
        default=os.environ.get("CORS_ORIGINS", ""),
        allow_empty=True,
    )
    return value or None


def _ensure_postgres_role(db_url: str, admin_url: str | None = None) -> None:
    url = make_url(db_url)
    if not url.drivername.startswith("postgresql"):
        return
    if not url.username:
        print("No username found in DATABASE_URL; skipping role creation.")
        return
    if shutil.which("psql") is None:
        print("psql is not available; please create the PostgreSQL role manually.")
        return
    if not _prompt_bool("Create or update the PostgreSQL role now?", default=True):
        return
    if admin_url is None:
        admin_url = _collect_postgres_admin_url(db_url)
    admin_url = make_url(admin_url)
    env = os.environ.copy()
    if admin_url.password:
        env["PGPASSWORD"] = admin_url.password
    username = url.username
    password = url.password
    query = f"SELECT 1 FROM pg_roles WHERE rolname = '{username}';"
    result = subprocess.run(
        ["psql", str(admin_url), "-tAc", query],
        check=False,
        capture_output=True,
        text=True,
        env=env,
    )
    if result.returncode != 0:
        print("Unable to query PostgreSQL for role existence:")
        print(result.stderr.strip())
        return
    if result.stdout.strip() == "1":
        print(f"PostgreSQL role '{username}' already exists.")
        if password and _prompt_bool("Update the role password?", default=False):
            subprocess.run(
                ["psql", str(admin_url), "-c", f"ALTER ROLE \"{username}\" WITH PASSWORD '{password}';"],
                check=True,
                env=env,
            )
            print("Role password updated.")
        return
    if not password:
        password = getpass(f"Password for new PostgreSQL role '{username}': ")
    subprocess.run(
        [
            "psql",
            str(admin_url),
            "-c",
            f"CREATE ROLE \"{username}\" WITH LOGIN PASSWORD '{password}';",
        ],
        check=True,
        env=env,
    )
    print(f"Created PostgreSQL role '{username}'.")


def _generate_self_signed_certificate(cert_path: Path, key_path: Path, common_name: str) -> None:
    cert_path.parent.mkdir(parents=True, exist_ok=True)
    key_path.parent.mkdir(parents=True, exist_ok=True)
    subprocess.run(
        [
            "openssl",
            "req",
            "-x509",
            "-newkey",
            "rsa:2048",
            "-keyout",
            str(key_path),
            "-out",
            str(cert_path),
            "-days",
            "365",
            "-nodes",
            "-subj",
            f"/CN={common_name}",
        ],
        check=True,
    )
    print(f"Generated HTTPS certificate at {cert_path} and key at {key_path}.")


def _collect_https_certificate() -> tuple[str, str] | None:
    if not _prompt_bool("Generate a self-signed HTTPS certificate now?", default=True):
        return None
    if shutil.which("openssl") is None:
        print("OpenSSL is not available; skipping certificate generation.")
        return None
    cert_dir = _prompt("Certificate directory", default="backend/certs")
    common_name = _prompt("Certificate common name (CN)", default="localhost")
    cert_path = (PROJECT_ROOT / cert_dir / "server.crt").resolve()
    key_path = (PROJECT_ROOT / cert_dir / "server.key").resolve()
    if cert_path.exists() or key_path.exists():
        if not _prompt_bool("Certificate files already exist. Overwrite?", default=False):
            print("Keeping existing certificate files.")
            return str(cert_path), str(key_path)
    _generate_self_signed_certificate(cert_path, key_path, common_name)
    return str(cert_path), str(key_path)


def _write_env_file(env_vars: dict[str, str]) -> None:
    filename = _prompt("Where should the environment file be written?", default="backend/.env.production")
    env_path = (PROJECT_ROOT / filename).resolve()
    env_path.parent.mkdir(parents=True, exist_ok=True)
    with env_path.open("w", encoding="utf-8") as handle:
        for key, value in env_vars.items():
            handle.write(f"{key}={value}\n")
    print(f"Environment file written to {env_path}")


def _bootstrap_application(config_name: str | None = None):
    if str(BACKEND_DIR) not in sys.path:
        sys.path.insert(0, str(BACKEND_DIR))

    from app import create_app  # pylint: disable=import-error

    app = create_app(config_name)
    print("Application factory executed; database schema ensured.")
    return app


def _create_or_update_admin(app, username: str, email: str, password: str) -> None:
    if str(BACKEND_DIR) not in sys.path:
        sys.path.insert(0, str(BACKEND_DIR))

    from sqlalchemy import or_
    from werkzeug.security import generate_password_hash

    from app.extensions import db
    from app.models import User, UserRole

    with app.app_context():
        existing = User.query.filter(or_(User.username == username, User.email == email)).first()
        if existing:
            print(
                "Found an existing user matching the provided username/email; ensuring admin privileges..."
            )
            changed = False
            if existing.role != UserRole.ADMIN:
                existing.role = UserRole.ADMIN
                changed = True
                print("- Updated role to admin.")
            if _prompt_bool("Update this user's password with the new value?", default=False):
                existing.password_hash = generate_password_hash(password)
                changed = True
                print("- Password updated.")
            if email != existing.email and _prompt_bool(
                f"Update stored email from {existing.email} to {email}?", default=False
            ):
                existing.email = email
                changed = True
                print("- Email updated.")
            if changed:
                db.session.commit()
                print("Admin account updated.")
            else:
                print("No changes were made to the existing account.")
            return

        admin = User(
            username=username,
            email=email,
            role=UserRole.ADMIN,
            password_hash=generate_password_hash(password),
        )
        db.session.add(admin)
        db.session.commit()
        print(f"Created admin user '{username}'.")


def _collect_admin_password() -> str:
    while True:
        password = getpass("Admin password: ")
        if not password:
            print("Password cannot be empty.")
            continue
        confirm = getpass("Confirm password: ")
        if password != confirm:
            print("Passwords do not match. Please try again.")
            continue
        return password


def _run_step(step: Callable[[], None]) -> None:
    try:
        step()
    except subprocess.CalledProcessError as exc:
        print(f"Command failed with exit code {exc.returncode}. Aborting setup.")
        sys.exit(exc.returncode)


def main() -> None:
    _print_title("AutoBet backend production setup")
    print("This guided script will install dependencies, configure environment variables, and seed the first admin account.\n")

    if _prompt_bool("Install backend Python dependencies now?", default=True):
        _run_step(_ensure_requirements_installed)

    db_url = _collect_database_url()
    admin_url = None
    if make_url(db_url).drivername.startswith("postgresql"):
        admin_url = _collect_postgres_admin_url(db_url)
        _run_step(lambda: _ensure_postgres_role(db_url, admin_url))
        _run_step(lambda: _ensure_database_exists(db_url, admin_url))
    else:
        _run_step(lambda: _ensure_database_exists(db_url))
    jwt_secret = _collect_jwt_secret()
    cors_origins = _collect_cors_origins()
    https_cert = _collect_https_certificate()

    env_vars = {
        "DATABASE_URL": db_url,
        "JWT_SECRET_KEY": jwt_secret,
    }
    if cors_origins:
        env_vars["CORS_ORIGINS"] = cors_origins
    if https_cert:
        env_vars["SSL_CERT_FILE"] = https_cert[0]
        env_vars["SSL_KEY_FILE"] = https_cert[1]

    if _prompt_bool("Write these settings to an environment file?", default=True):
        _write_env_file(env_vars)

    os.environ.update(env_vars)
    app = _bootstrap_application()

    _print_title("Admin account provisioning")
    username = _prompt("Admin username", default="admin")
    email_default = f"{username}@example.com"
    email = _prompt("Admin email", default=email_default)
    password = _collect_admin_password()
    _create_or_update_admin(app, username, email, password)

    _print_title("All done")
    if https_cert:
        print("Use the generated TLS assets with your server, for example:")
        print(f'  gunicorn --certfile "{https_cert[0]}" --keyfile "{https_cert[1]}" "app:create_app()"')
    print("Production setup complete. You can now launch the backend with your WSGI server of choice.")


if __name__ == "__main__":  # pragma: no cover - manual script
    try:
        main()
    except KeyboardInterrupt:  # pragma: no cover - interactive flow
        print("\nSetup interrupted by user.")
        sys.exit(130)
