"""Application factory for the AutoBet backend."""
from datetime import timedelta

from flask import Flask, jsonify
from werkzeug.exceptions import HTTPException

from . import models
from .config import get_config
from .extensions import db, jwt
from .routes.admin import admin_bp
from .routes.auth import auth_bp
from .routes.auctions import auctions_bp
from .routes.bids import bids_bp
from .routes.notifications import notifications_bp


def create_app(config_name: str | None = None) -> Flask:
    """Create and configure the Flask application.

    Parameters
    ----------
    config_name:
        Optional name of the configuration to load.
    """

    app = Flask(__name__)
    config_class = get_config(config_name)
    app.config.from_object(config_class)

    if not app.config.get("JWT_SECRET_KEY"):
        msg = "JWT_SECRET_KEY must be configured for the application"
        raise RuntimeError(msg)

    db.init_app(app)
    jwt.init_app(app)

    with app.app_context():
        db.create_all()

    app.register_blueprint(auth_bp, url_prefix="/auth")
    app.register_blueprint(admin_bp, url_prefix="/admin")
    app.register_blueprint(auctions_bp, url_prefix="/auctions")
    app.register_blueprint(bids_bp, url_prefix="/auctions")
    app.register_blueprint(notifications_bp, url_prefix="/")

    @app.get("/time")
    def get_server_time() -> dict[str, str]:
        """Return the current server time in UTC."""

        return {"server_time": models.utcnow().isoformat()}

    @app.errorhandler(HTTPException)
    def handle_http_exception(exc: HTTPException):
        response = jsonify(
            {
                "type": exc.name,
                "title": exc.name,
                "detail": exc.description,
                "status": exc.code,
                "message": exc.description,
            }
        )
        return response, exc.code

    return app
