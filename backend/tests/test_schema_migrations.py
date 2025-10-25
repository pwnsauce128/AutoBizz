"""Tests for database schema compatibility helpers."""

from sqlalchemy import create_engine, inspect, text

from app import _ensure_carte_grise_column


def test_ensure_carte_grise_column_adds_missing_column(tmp_path):
    """The helper should add the carte grise column to legacy databases."""

    db_path = tmp_path / "legacy.db"
    engine = create_engine(f"sqlite:///{db_path}")

    with engine.begin() as connection:
        connection.execute(text("CREATE TABLE auctions (id INTEGER PRIMARY KEY)"))

    _ensure_carte_grise_column(engine)

    inspector = inspect(engine)
    columns = {column["name"] for column in inspector.get_columns("auctions")}

    assert "carte_grise_image_url" in columns
