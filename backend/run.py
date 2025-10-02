"""Entry-point for running the AutoBet backend locally."""
from __future__ import annotations

from app import create_app


app = create_app("development")


if __name__ == "__main__":
    app.run(debug=True)
