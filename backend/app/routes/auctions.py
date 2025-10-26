"""Auction CRUD endpoints."""
from __future__ import annotations

from datetime import datetime, timezone
from decimal import Decimal, InvalidOperation, ROUND_HALF_UP
from http import HTTPStatus
import uuid

from flask import Blueprint, abort, jsonify, request
from flask_jwt_extended import get_jwt_identity, jwt_required, verify_jwt_in_request
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
MAX_AUCTION_IMAGES = 8
TWO_PLACES = Decimal("0.01")


auctions_bp = Blueprint("auctions", __name__)


def _resolve_optional_viewer() -> User | None:
    """Return the authenticated user if a valid JWT is present."""

    try:
        verify_jwt_in_request(optional=True)
    except Exception:  # pragma: no cover - defensive fallback
        return None

    identity = get_jwt_identity()
    if identity is None:
        return None

    try:
        viewer_uuid = uuid.UUID(str(identity))
    except (TypeError, ValueError):  # pragma: no cover - defensive fallback
        return None

    viewer = User.query.filter_by(id=viewer_uuid).first()
    if viewer is None:
        return None
    if not viewer.is_active():
        return None
    return viewer


@auctions_bp.get("")
def list_auctions():
    status_param = request.args.get("status", AuctionStatus.ACTIVE.value)
    sort = request.args.get("sort", "fresh")
    scope = request.args.get("scope")
    created_after_raw = request.args.get("created_after")

    bid_join = joinedload(Auction.bids).joinedload(Bid.buyer)

    query = Auction.query.options(bid_join)
    viewer: User | None = None

    if status_param != "all":
        try:
            status = AuctionStatus(status_param)
        except ValueError:
            abort(HTTPStatus.BAD_REQUEST, description="Invalid status filter")
        query = query.filter_by(status=status)

    if scope is not None:
        if scope != "participating":
            abort(HTTPStatus.BAD_REQUEST, description="Invalid scope filter")
        verify_jwt_in_request()
        user = get_current_user()
        if user.role != UserRole.BUYER:
            abort(HTTPStatus.FORBIDDEN, description="Only buyers can view this scope")
        query = query.filter(Auction.bids.any(Bid.buyer_id == user.id))
        viewer = user

    if viewer is None:
        viewer = _resolve_optional_viewer()

    if created_after_raw:
        parsed_raw = created_after_raw.replace("Z", "+00:00")
        try:
            created_after = datetime.fromisoformat(parsed_raw)
        except ValueError:  # pragma: no cover - defensive branch
            abort(HTTPStatus.BAD_REQUEST, description="Invalid created_after timestamp")
        if created_after.tzinfo is None:
            created_after = created_after.replace(tzinfo=timezone.utc)
        query = query.filter(Auction.created_at > created_after)

    if sort == "fresh":
        query = query.order_by(Auction.start_at.desc())
    else:
        query = query.order_by(Auction.created_at.desc())

    auctions = query.limit(AUCTIONS_PER_PAGE).all()
    return jsonify([serialize_auction_preview(auction, viewer=viewer) for auction in auctions])


def _normalize_images(images: object) -> list[str]:
    """Validate and normalize the list of provided image URLs/base64 strings."""

    if images is None:
        return []

    # Accept a single string/bytes payload for backwards compatibility by
    # normalising it into a list.
    if isinstance(images, (str, bytes)):
        images = [images]

    # Some clients may submit image descriptors instead of bare strings. Allow a
    # mapping with common keys so long as it contains a usable value.
    if isinstance(images, dict):
        images = [images]

    if not isinstance(images, list):
        abort(HTTPStatus.BAD_REQUEST, description="Images must be provided as a list")

    normalized: list[str] = []
    for item in images:
        if not item:
            continue

        if isinstance(item, dict):
            candidate = (
                item.get("dataUrl")
                or item.get("data_url")
                or item.get("url")
                or item.get("uri")
            )
            if not candidate:
                abort(
                    HTTPStatus.BAD_REQUEST,
                    description="Each image must include a usable string value",
                )
            item = candidate

        if isinstance(item, bytes):
            value = item.decode()
        elif isinstance(item, str):
            value = item
        else:
            abort(HTTPStatus.BAD_REQUEST, description="Each image must be a string value")

        value = value.strip()
        if value:
            normalized.append(value)

    if len(normalized) > MAX_AUCTION_IMAGES:
        abort(
            HTTPStatus.BAD_REQUEST,
            description=f"A maximum of {MAX_AUCTION_IMAGES} images is allowed per auction",
        )

    return normalized


def _normalize_single_image(image: object, field: str) -> str:
    """Validate a single image payload."""

    images = _normalize_images(image)
    if not images:
        abort(HTTPStatus.BAD_REQUEST, description=f"Missing {field}")
    if len(images) > 1:
        abort(
            HTTPStatus.BAD_REQUEST,
            description=f"Only one {field} can be provided",
        )
    return images[0]


def _sanitize_text(value: object, field: str, *, allow_empty: bool = False) -> str:
    if value is None:
        if allow_empty:
            return ""
        abort(HTTPStatus.BAD_REQUEST, description=f"Missing {field}")
    if not isinstance(value, str):
        abort(HTTPStatus.BAD_REQUEST, description=f"{field.capitalize()} must be a string")
    sanitized = value.strip()
    if not sanitized and not allow_empty:
        abort(HTTPStatus.BAD_REQUEST, description=f"Missing {field}")
    return sanitized


def _normalize_currency(value: object) -> str:
    if value is None:
        return "EUR"
    if not isinstance(value, str):
        abort(HTTPStatus.BAD_REQUEST, description="Currency must be a string")
    normalized = value.strip().upper()
    if len(normalized) != 3 or not normalized.isalpha():
        abort(HTTPStatus.BAD_REQUEST, description="Currency must be a three-letter code")
    return normalized


def _parse_price(raw_value: object) -> Decimal:
    if raw_value is None:
        abort(HTTPStatus.BAD_REQUEST, description="Missing minimum price")
    try:
        price = Decimal(str(raw_value))
    except (TypeError, InvalidOperation):
        abort(HTTPStatus.BAD_REQUEST, description="Minimum price must be numeric")
    try:
        quantized = price.quantize(TWO_PLACES, rounding=ROUND_HALF_UP)
    except InvalidOperation:
        abort(HTTPStatus.BAD_REQUEST, description="Minimum price must be numeric")
    if quantized <= 0:
        abort(HTTPStatus.BAD_REQUEST, description="Minimum price must be positive")
    return quantized


@auctions_bp.post("")
@jwt_required()
@role_required(UserRole.SELLER, UserRole.ADMIN)
def create_auction():
    user = get_current_user()
    data = request.get_json(force=True)
    title = _sanitize_text(data.get("title"), "title")
    description = _sanitize_text(data.get("description"), "description")
    min_price_value = _parse_price(data.get("min_price"))
    currency = _normalize_currency(data.get("currency", "EUR"))
    images = _normalize_images(data.get("images", []))
    carte_grise_image = _normalize_single_image(
        data.get("carte_grise_image") or data.get("carte_grise_url"),
        "carte grise image",
    )

    auction = Auction(
        seller_id=user.id,
        title=title,
        description=description,
        min_price=min_price_value,
        currency=currency,
        image_urls=images,
        carte_grise_image_url=carte_grise_image,
        status=AuctionStatus.DRAFT,
    )
    auction.activate()
    db.session.add(auction)
    db.session.flush()
    notify_new_auction(auction)
    db.session.commit()
    return jsonify(serialize_auction_detail(auction)), HTTPStatus.CREATED


@auctions_bp.get("/mine")
@jwt_required()
@role_required(UserRole.SELLER, UserRole.ADMIN)
def list_my_auctions():
    user = get_current_user()
    status_param = request.args.get("status", "all")

    query = (
        Auction.query.options(joinedload(Auction.bids).joinedload(Bid.buyer))
        .filter_by(seller_id=user.id)
    )

    if status_param != "all":
        try:
            status = AuctionStatus(status_param)
        except ValueError:
            abort(HTTPStatus.BAD_REQUEST, description="Invalid status filter")
        query = query.filter_by(status=status)

    auctions = query.order_by(Auction.created_at.desc()).all()
    return jsonify([serialize_auction_preview(auction) for auction in auctions])


@auctions_bp.get("/manage")
@jwt_required()
@role_required(UserRole.ADMIN)
def list_all_auctions():
    status_param = request.args.get("status", "all")

    query = Auction.query.options(joinedload(Auction.bids).joinedload(Bid.buyer))

    if status_param != "all":
        try:
            status = AuctionStatus(status_param)
        except ValueError:
            abort(HTTPStatus.BAD_REQUEST, description="Invalid status filter")
        query = query.filter_by(status=status)

    auctions = query.order_by(Auction.created_at.desc()).all()
    return jsonify([serialize_auction_preview(auction) for auction in auctions])


@auctions_bp.get("/<uuid:auction_id>")
def get_auction(auction_id: uuid.UUID):
    auction = (
        Auction.query.options(joinedload(Auction.bids).joinedload(Bid.buyer))
        .filter_by(id=auction_id)
        .first()
    )
    if auction is None:
        abort(HTTPStatus.NOT_FOUND, description="Auction not found")
    viewer = _resolve_optional_viewer()
    return jsonify(serialize_auction_detail(auction, viewer=viewer))


@auctions_bp.patch("/<uuid:auction_id>")
@jwt_required()
def update_auction(auction_id: uuid.UUID):
    user = get_current_user()
    auction = (
        Auction.query.options(joinedload(Auction.bids).joinedload(Bid.buyer))
        .filter_by(id=auction_id)
        .first()
    )
    if auction is None:
        abort(HTTPStatus.NOT_FOUND, description="Auction not found")

    if user.role not in {UserRole.ADMIN, UserRole.SELLER}:
        abort(HTTPStatus.FORBIDDEN, description="Insufficient permissions")

    if user.role == UserRole.SELLER and auction.seller_id != user.id:
        abort(HTTPStatus.FORBIDDEN, description="Cannot edit another seller's auction")

    data = request.get_json(force=True)
    updates_applied = False

    if "title" in data:
        auction.title = _sanitize_text(data.get("title"), "title")
        updates_applied = True

    if "description" in data:
        auction.description = _sanitize_text(data.get("description"), "description")
        updates_applied = True

    if "min_price" in data:
        auction.min_price = _parse_price(data.get("min_price"))
        updates_applied = True

    if "currency" in data:
        auction.currency = _normalize_currency(data.get("currency"))
        updates_applied = True

    if "images" in data or "image_urls" in data:
        payload = data.get("image_urls", data.get("images"))
        auction.image_urls = _normalize_images(payload)
        updates_applied = True

    if "carte_grise_image" in data or "carte_grise_url" in data:
        payload = data.get("carte_grise_image")
        if payload is None:
            payload = data.get("carte_grise_url")
        auction.carte_grise_image_url = _normalize_single_image(
            payload,
            "carte grise image",
        )
        updates_applied = True

    if not updates_applied:
        abort(HTTPStatus.BAD_REQUEST, description="No valid updates provided")

    db.session.commit()
    return jsonify(serialize_auction_detail(auction))


@auctions_bp.delete("/<uuid:auction_id>")
@jwt_required()
def delete_auction(auction_id: uuid.UUID):
    user = get_current_user()
    auction = (
        Auction.query.options(joinedload(Auction.bids).joinedload(Bid.buyer))
        .filter_by(id=auction_id)
        .first()
    )
    if auction is None:
        abort(HTTPStatus.NOT_FOUND, description="Auction not found")

    if user.role not in {UserRole.ADMIN, UserRole.SELLER}:
        abort(HTTPStatus.FORBIDDEN, description="Insufficient permissions")

    if user.role == UserRole.SELLER and auction.seller_id != user.id:
        abort(HTTPStatus.FORBIDDEN, description="Cannot delete another seller's auction")

    for bid in list(auction.bids):
        db.session.delete(bid)

    db.session.delete(auction)
    db.session.commit()
    return ("", HTTPStatus.NO_CONTENT)


def serialize_auction_preview(auction: Auction, *, viewer: User | None = None) -> dict:
    viewer_bid = None
    if viewer is not None:
        for bid in auction.bids:
            if bid.buyer_id == viewer.id:
                viewer_bid = bid
                break

    return {
        "id": str(auction.id),
        "title": auction.title,
        "description": auction.description,
        "min_price": float(auction.min_price),
        "currency": auction.currency,
        "status": auction.status.value,
        "created_at": auction.created_at.isoformat() if auction.created_at else None,
        "start_at": auction.start_at.isoformat() if auction.start_at else None,
        "end_at": auction.end_at.isoformat() if auction.end_at else None,
        "best_bid": serialize_bid(auction.bids[0]) if auction.bids else None,
        "viewer_bid": serialize_bid(viewer_bid) if viewer_bid else None,
        "viewer_has_bid": viewer_bid is not None,
        "image_urls": auction.image_urls,
        "carte_grise_image_url": auction.carte_grise_image_url,
    }


def serialize_auction_detail(auction: Auction, *, viewer: User | None = None) -> dict:
    data = serialize_auction_preview(auction, viewer=viewer)
    data.update(
        {
            "description": auction.description,
            "image_urls": auction.image_urls,
            "seller_id": str(auction.seller_id),
            "carte_grise_image_url": auction.carte_grise_image_url,
        }
    )
    return data


def serialize_bid(bid: Bid) -> dict:
    return {
        "id": str(bid.id),
        "amount": float(bid.amount),
        "buyer_id": str(bid.buyer_id),
        "buyer_username": bid.buyer.username if bid.buyer else None,
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
