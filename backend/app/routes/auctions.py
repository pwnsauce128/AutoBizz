"""Auction CRUD endpoints."""
from __future__ import annotations

from http import HTTPStatus
import uuid

from flask import Blueprint, abort, jsonify, request
from flask_jwt_extended import jwt_required
from sqlalchemy.orm import joinedload

from ..extensions import db
from ..models import (
    Auction,
    AuctionStatus,
    Bid,
    Notification,
    NotificationType,
    User,
    UserRole,
    UserStatus,
)
from .utils import get_current_user, role_required


AUCTIONS_PER_PAGE = 20


auctions_bp = Blueprint("auctions", __name__)


@auctions_bp.get("")
def list_auctions():
    status_param = request.args.get("status", AuctionStatus.ACTIVE.value)
    try:
        status = AuctionStatus(status_param)
    except ValueError:
        abort(HTTPStatus.BAD_REQUEST, description="Invalid status filter")

    sort = request.args.get("sort", "fresh")

    query = (
        Auction.query.options(joinedload(Auction.bids))
        .filter_by(status=status)
        .order_by(Auction.start_at.desc())
    )
    if sort != "fresh":
        query = query.order_by(Auction.created_at.desc())

    auctions = query.limit(AUCTIONS_PER_PAGE).all()
    return jsonify([serialize_auction_preview(auction) for auction in auctions])


@auctions_bp.post("")
@jwt_required()
@role_required(UserRole.SELLER)
def create_auction():
    user = get_current_user()
    data = request.get_json(force=True)
    title = data.get("title")
    description = data.get("description")
    min_price = data.get("min_price")
    currency = data.get("currency", "EUR")
    images = data.get("images", [])

    if not title or not description or min_price is None:
        abort(HTTPStatus.BAD_REQUEST, description="Missing required fields")

    auction = Auction(
        seller_id=user.id,
        title=title,
        description=description,
        min_price=min_price,
        currency=currency,
        image_urls=images,
        status=AuctionStatus.DRAFT,
    )
    auction.activate()
    db.session.add(auction)
    db.session.flush()
    notify_new_auction(auction)
    db.session.commit()
    return jsonify(serialize_auction_detail(auction)), HTTPStatus.CREATED


@auctions_bp.get("/<uuid:auction_id>")
def get_auction(auction_id: uuid.UUID):
    auction = Auction.query.options(joinedload(Auction.bids)).filter_by(id=auction_id).first()
    if auction is None:
        abort(HTTPStatus.NOT_FOUND, description="Auction not found")
    return jsonify(serialize_auction_detail(auction))


@auctions_bp.patch("/<uuid:auction_id>")
@jwt_required()
def update_auction(auction_id: uuid.UUID):
    user = get_current_user()
    auction = Auction.query.options(joinedload(Auction.bids)).filter_by(id=auction_id).first()
    if auction is None:
        abort(HTTPStatus.NOT_FOUND, description="Auction not found")

    if auction.is_locked:
        abort(HTTPStatus.BAD_REQUEST, description="Auction locked after first bid")

    if user.role not in {UserRole.ADMIN, UserRole.SELLER}:
        abort(HTTPStatus.FORBIDDEN, description="Insufficient permissions")

    if user.role == UserRole.SELLER and auction.seller_id != user.id:
        abort(HTTPStatus.FORBIDDEN, description="Cannot edit another seller's auction")

    data = request.get_json(force=True)
    field_map = {
        "title": "title",
        "description": "description",
        "min_price": "min_price",
        "currency": "currency",
        "images": "image_urls",
        "image_urls": "image_urls",
    }
    for json_key, model_field in field_map.items():
        if json_key in data:
            setattr(auction, model_field, data[json_key])

    db.session.commit()
    return jsonify(serialize_auction_detail(auction))


@auctions_bp.delete("/<uuid:auction_id>")
@jwt_required()
def delete_auction(auction_id: uuid.UUID):
    user = get_current_user()
    auction = Auction.query.options(joinedload(Auction.bids)).filter_by(id=auction_id).first()
    if auction is None:
        abort(HTTPStatus.NOT_FOUND, description="Auction not found")

    if auction.is_locked:
        abort(HTTPStatus.BAD_REQUEST, description="Auction locked after first bid")

    if user.role not in {UserRole.ADMIN, UserRole.SELLER}:
        abort(HTTPStatus.FORBIDDEN, description="Insufficient permissions")

    if user.role == UserRole.SELLER and auction.seller_id != user.id:
        abort(HTTPStatus.FORBIDDEN, description="Cannot delete another seller's auction")

    db.session.delete(auction)
    db.session.commit()
    return ("", HTTPStatus.NO_CONTENT)


def serialize_auction_preview(auction: Auction) -> dict:
    return {
        "id": str(auction.id),
        "title": auction.title,
        "min_price": float(auction.min_price),
        "currency": auction.currency,
        "status": auction.status.value,
        "start_at": auction.start_at.isoformat() if auction.start_at else None,
        "end_at": auction.end_at.isoformat() if auction.end_at else None,
        "best_bid": serialize_bid(auction.bids[0]) if auction.bids else None,
    }


def serialize_auction_detail(auction: Auction) -> dict:
    data = serialize_auction_preview(auction)
    data.update(
        {
            "description": auction.description,
            "image_urls": auction.image_urls,
            "seller_id": str(auction.seller_id),
        }
    )
    return data


def serialize_bid(bid: Bid) -> dict:
    return {
        "id": str(bid.id),
        "amount": float(bid.amount),
        "buyer_id": str(bid.buyer_id),
        "created_at": bid.created_at.isoformat(),
    }


def notify_new_auction(auction: Auction) -> None:
    buyers = User.query.filter_by(role=UserRole.BUYER, status=UserStatus.ACTIVE).all()
    for buyer in buyers:
        notification = Notification(
            user_id=buyer.id,
            type=NotificationType.NEW_AUCTION,
            payload={"auction_id": str(auction.id)},
        )
        db.session.add(notification)
