"""Quick utility to inspect admin credentials in the database.

Run this script locally to list users (optionally filtering to the admin) and
optionally verify a password against the stored hash. It uses the same
SQLAlchemy models and password hashing helpers as the application, so it should
match runtime behavior.
"""
from __future__ import annotations

import argparse
import os
import sys
from getpass import getpass
from pathlib import Path

from sqlalchemy import text
from werkzeug.security import check_password_hash

PROJECT_ROOT = Path(__file__).resolve().parent
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from app import create_app
from app.extensions import db
from app.models import User, UserRole


def parse_args() -> argparse.Namespace:
    """Return parsed command-line arguments."""

    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--database-url",
        help="SQLAlchemy database URL (defaults to DATABASE_URL env or sqlite:///autobet.db)",
    )
    parser.add_argument("--username", help="Filter users by username")
    parser.add_argument("--email", help="Filter users by email (case-insensitive)")
    parser.add_argument(
        "--role", choices=[role.value for role in UserRole], help="Filter users by role"
    )
    parser.add_argument(
        "--check-password",
        action="store_true",
        help="Prompt for a password and verify it against each matching user",
    )
    return parser.parse_args()


def _describe_user(user: User) -> str:
    return (
        f"id={user.id} username={user.username} email={user.email} "
        f"role={user.role} status={user.status} created_at={user.created_at}"
    )


def main() -> None:
    args = parse_args()

    os.environ.setdefault("JWT_SECRET_KEY", "cli-temp-secret")
    if args.database_url:
        os.environ["DATABASE_URL"] = args.database_url

    app = create_app()

    with app.app_context():
        print(f"Using database URL: {app.config.get('SQLALCHEMY_DATABASE_URI')}")
        try:
            with db.engine.connect() as connection:
                connection.execute(text("SELECT 1"))
        except Exception as exc:  # pragma: no cover - diagnostic output
            print("Database connection: FAILED")
            print(f"Error: {exc}")
            return
        else:
            print("Database connection: SUCCESS")

        query = User.query
        if args.username:
            query = query.filter_by(username=args.username)
        if args.email:
            query = query.filter(User.email.ilike(args.email))
        if args.role:
            query = query.filter_by(role=UserRole(args.role))

        users = query.order_by(User.created_at.asc()).all()
        if not users:
            print("No users found with the provided filters.")
            return

        password_input = None
        if args.check_password:
            password_input = getpass("Enter password to verify against stored hash: ")

        print(f"Found {len(users)} user(s):")
        for user in users:
            print(" -", _describe_user(user))
            if password_input:
                valid = check_password_hash(user.password_hash, password_input)
                print(f"    Password match: {'YES' if valid else 'NO'}")


if __name__ == "__main__":
    main()
