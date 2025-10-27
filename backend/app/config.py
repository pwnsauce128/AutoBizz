"""Application configuration objects."""
from __future__ import annotations

from dataclasses import dataclass
from datetime import timedelta
import os

from sqlalchemy.pool import StaticPool
from typing import ClassVar


@dataclass
class BaseConfig:
    """Base configuration shared across environments."""

    SQLALCHEMY_DATABASE_URI: str = os.getenv(
        "DATABASE_URL", "sqlite:///autobet.db"
    )
    SQLALCHEMY_TRACK_MODIFICATIONS: bool = False
    JWT_SECRET_KEY: str | None = os.getenv("JWT_SECRET_KEY")
    JWT_ACCESS_TOKEN_EXPIRES: timedelta = timedelta(minutes=15)
    JWT_REFRESH_TOKEN_EXPIRES: timedelta = timedelta(days=7)
    CORS_ORIGINS: str = os.getenv("CORS_ORIGINS", "*")


@dataclass
class TestingConfig(BaseConfig):
    """Configuration used during automated testing."""

    TESTING: bool = True
    SQLALCHEMY_DATABASE_URI: str = "sqlite:///:memory:"
    JWT_SECRET_KEY: str = "test-secret"
    PUSH_DELIVERY_USE_THREAD: bool = False
    SQLALCHEMY_ENGINE_OPTIONS: ClassVar[dict[str, object]] = {
        "poolclass": StaticPool,
        "connect_args": {"check_same_thread": False},
    }


@dataclass
class DevelopmentConfig(BaseConfig):
    """Local development configuration."""

    DEBUG: bool = True
    JWT_SECRET_KEY: str = os.getenv("JWT_SECRET_KEY", "dev-secret")


CONFIGS: dict[str, type[BaseConfig]] = {
    "default": BaseConfig,
    "testing": TestingConfig,
    "development": DevelopmentConfig,
}


def get_config(name: str | None) -> type[BaseConfig]:
    """Return the configuration class matching *name*."""

    if name is None:
        return CONFIGS["default"]
    return CONFIGS.get(name, CONFIGS["default"])
