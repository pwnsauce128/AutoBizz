"""Application factory for the AutoBet backend."""

from flask import Flask, jsonify
from flask_cors import CORS
from sqlalchemy import inspect, text
from sqlalchemy.engine import Engine
from werkzeug.exceptions import HTTPException

from . import models
from .config import get_config
from .extensions import db, jwt
from .routes.admin import admin_bp
from .routes.auth import auth_bp
from .routes.auctions import auctions_bp
from .routes.bids import bids_bp
from .routes.notifications import notifications_bp
from .push_delivery import init_app as init_push_delivery


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
    CORS(app, resources={r"/*": {"origins": app.config.get("CORS_ORIGINS", "*")}})

    if not app.config.get("JWT_SECRET_KEY"):
        msg = "JWT_SECRET_KEY must be configured for the application"
        raise RuntimeError(msg)

    db.init_app(app)
    jwt.init_app(app)

    with app.app_context():
        db.create_all()
        _ensure_carte_grise_column(db.engine)

    app.register_blueprint(auth_bp, url_prefix="/auth")
    app.register_blueprint(admin_bp, url_prefix="/admin")
    app.register_blueprint(auctions_bp, url_prefix="/auctions")
    app.register_blueprint(bids_bp, url_prefix="/auctions")
    app.register_blueprint(notifications_bp, url_prefix="/")
    init_push_delivery(app)

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


def _ensure_carte_grise_column(engine: Engine) -> None:
    """Ensure the auctions table has the carte grise column.

    When upgrading an existing SQLite database, ``db.create_all`` will not add the
    newly required column. This helper inspects the table definition and issues an
    ``ALTER TABLE`` statement to append the column if it is missing.
    """

    inspector = inspect(engine)
    if "auctions" not in inspector.get_table_names():
        return

    columns = {column["name"] for column in inspector.get_columns("auctions")}
    if "carte_grise_image_url" in columns:
        return

    with engine.begin() as connection:
        connection.execute(
            text("ALTER TABLE auctions ADD COLUMN carte_grise_image_url TEXT")
        )
