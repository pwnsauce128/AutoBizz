"""Bid placement endpoints."""
from __future__ import annotations

from decimal import Decimal
from http import HTTPStatus
import uuid

from flask import Blueprint, abort, jsonify, request
from flask_jwt_extended import jwt_required
from ..extensions import db
from ..models import (
    Auction,
    AuctionStatus,
    Bid,
    Notification,
    NotificationType,
    UserRole,
    UTC,
    utcnow,
)
from .utils import get_current_user, role_required


bids_bp = Blueprint("bids", __name__)


@bids_bp.post("/<uuid:auction_id>/bids")
@jwt_required()
@role_required(UserRole.BUYER)
def place_bid(auction_id: uuid.UUID):
    user = get_current_user()
    data = request.get_json(force=True)
    amount = data.get("amount")

    if amount is None:
        abort(HTTPStatus.BAD_REQUEST, description="Missing bid amount")

    auction = Auction.query.filter_by(id=auction_id).first()
    if auction is None:
        abort(HTTPStatus.NOT_FOUND, description="Auction not found")

    if auction.status != AuctionStatus.ACTIVE:
        abort(HTTPStatus.BAD_REQUEST, description="Auction not active")

    end_at = auction.end_at
    if end_at is not None and end_at.tzinfo is None:
        end_at = end_at.replace(tzinfo=UTC)
    if end_at and end_at <= utcnow():
        abort(HTTPStatus.BAD_REQUEST, description="Auction already closed")

    existing_count = Bid.query.filter_by(auction_id=auction_id, buyer_id=user.id).count()
    if existing_count >= 2:
        abort(HTTPStatus.BAD_REQUEST, description="Bid limit reached for this auction")

    amount_decimal = Decimal(str(amount))
    min_price = Decimal(str(auction.min_price))
    if amount_decimal < min_price:
        abort(HTTPStatus.BAD_REQUEST, description="Bid below minimum price")

    top_bid = Bid.query.filter_by(auction_id=auction_id).order_by(Bid.amount.desc()).first()
    if top_bid and amount_decimal <= Decimal(str(top_bid.amount)):
        abort(HTTPStatus.BAD_REQUEST, description="Bid must be higher than current best")

    bid = Bid(
        auction_id=auction_id,
        buyer_id=user.id,
        amount=amount_decimal,
        idx_per_buyer=existing_count + 1,
    )
    db.session.add(bid)
    db.session.flush()

    notify_bid_outcome(auction, bid)

    db.session.commit()
    return jsonify({"bid": serialize_bid(bid)}), HTTPStatus.CREATED


def serialize_bid(bid: Bid) -> dict:
    return {
        "id": str(bid.id),
        "amount": float(bid.amount),
        "buyer_id": str(bid.buyer_id),
        "created_at": bid.created_at.isoformat(),
    }


def notify_bid_outcome(auction: Auction, bid: Bid) -> None:
    notification = Notification(
        user_id=auction.seller_id,
        type=NotificationType.RESULT,
        payload={
            "auction_id": str(auction.id),
            "latest_bid": serialize_bid(bid),
        },
    )
    db.session.add(notification)
