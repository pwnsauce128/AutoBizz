"""Shared pytest fixtures."""
from __future__ import annotations

import sys
from pathlib import Path

import pytest

BASE_DIR = Path(__file__).resolve().parents[1]
if str(BASE_DIR) not in sys.path:
    sys.path.insert(0, str(BASE_DIR))

from app import create_app
from app.extensions import db


@pytest.fixture()
def app():
    app = create_app("testing")
    ctx = app.app_context()
    ctx.push()

    yield app

    db.session.remove()
    db.drop_all()
    ctx.pop()


@pytest.fixture()
def client(app):
    return app.test_client()
