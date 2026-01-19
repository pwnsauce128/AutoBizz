"""Database models for the AutoBet backend."""
from __future__ import annotations

from datetime import datetime, timedelta, timezone
import enum
import uuid

from sqlalchemy import UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .extensions import db


UTC = timezone.utc


def utcnow() -> datetime:
    """Return the current UTC time."""

    return datetime.now(UTC)


class UserRole(enum.StrEnum):
    ADMIN = "admin"
    SELLER = "seller"
    BUYER = "buyer"


class UserStatus(enum.StrEnum):
    ACTIVE = "active"
    SUSPENDED = "suspended"


class AuctionStatus(enum.StrEnum):
    DRAFT = "draft"
    ACTIVE = "active"
    CLOSED = "closed"
    CANCELLED = "cancelled"


class NotificationType(enum.StrEnum):
    NEW_AUCTION = "new_auction"
    RESULT = "result"


class BaseModel(db.Model):
    """Mixin with UUID primary key and timestamps."""

    __abstract__ = True

    id: Mapped[uuid.UUID] = mapped_column(
        db.Uuid, primary_key=True, default=uuid.uuid4, unique=True
    )
    created_at: Mapped[datetime] = mapped_column(db.DateTime(timezone=True), default=utcnow)


class User(BaseModel):
    """Application user model."""

    __tablename__ = "users"

    email: Mapped[str] = mapped_column(db.String(255), unique=True, nullable=False)
    username: Mapped[str] = mapped_column(db.String(80), unique=True, nullable=False)
    password_hash: Mapped[str] = mapped_column(db.String(255), nullable=False)
    role: Mapped[UserRole] = mapped_column(db.Enum(UserRole), nullable=False)
    status: Mapped[UserStatus] = mapped_column(
        db.Enum(UserStatus), nullable=False, default=UserStatus.ACTIVE
    )

    auctions: Mapped[list["Auction"]] = relationship(back_populates="seller")
    bids: Mapped[list["Bid"]] = relationship(back_populates="buyer")

    def is_active(self) -> bool:
        return self.status == UserStatus.ACTIVE


class Auction(BaseModel):
    """Vehicle auction model."""

    __tablename__ = "auctions"

    seller_id: Mapped[uuid.UUID] = mapped_column(db.Uuid, db.ForeignKey("users.id"))
    seller: Mapped[User] = relationship(back_populates="auctions")

    title: Mapped[str] = mapped_column(db.String(255), nullable=False)
    description: Mapped[str] = mapped_column(db.Text, nullable=False)
    currency: Mapped[str] = mapped_column(db.String(3), default="EUR", nullable=False)
    image_urls: Mapped[list[str]] = mapped_column(db.JSON, default=list)
    carte_grise_image_url: Mapped[str | None] = mapped_column(db.Text)
    status: Mapped[AuctionStatus] = mapped_column(
        db.Enum(AuctionStatus), default=AuctionStatus.DRAFT, nullable=False
    )
    start_at: Mapped[datetime | None] = mapped_column(db.DateTime(timezone=True))
    end_at: Mapped[datetime | None] = mapped_column(db.DateTime(timezone=True))

    bids: Mapped[list["Bid"]] = relationship(back_populates="auction", order_by="desc(Bid.amount)")

    def activate(self, *, start_time: datetime | None = None) -> None:
        if self.status != AuctionStatus.DRAFT:
            msg = "Only draft auctions can be activated"
            raise ValueError(msg)
        start = start_time or utcnow()
        self.start_at = start
        self.end_at = start + timedelta(hours=24)
        self.status = AuctionStatus.ACTIVE

    def close(self) -> None:
        self.status = AuctionStatus.CLOSED

    @property
    def is_locked(self) -> bool:
        return any(bid for bid in self.bids)


class Bid(BaseModel):
    """Auction bid."""

    __tablename__ = "bids"
    __table_args__ = (
        UniqueConstraint("auction_id", "buyer_id", "idx_per_buyer"),
    )

    auction_id: Mapped[uuid.UUID] = mapped_column(db.Uuid, db.ForeignKey("auctions.id"))
    auction: Mapped[Auction] = relationship(back_populates="bids")
    buyer_id: Mapped[uuid.UUID] = mapped_column(db.Uuid, db.ForeignKey("users.id"))
    buyer: Mapped[User] = relationship(back_populates="bids")
    amount: Mapped[float] = mapped_column(db.Numeric(10, 2), nullable=False)
    idx_per_buyer: Mapped[int] = mapped_column(db.Integer, nullable=False)


class Notification(BaseModel):
    """User notification record."""

    __tablename__ = "notifications"

    user_id: Mapped[uuid.UUID] = mapped_column(db.Uuid, db.ForeignKey("users.id"))
    user: Mapped[User] = relationship()
    type: Mapped[NotificationType] = mapped_column(db.Enum(NotificationType))
    payload: Mapped[dict] = mapped_column(db.JSON, default=dict)
    read_at: Mapped[datetime | None] = mapped_column(db.DateTime(timezone=True))


class AuditLog(BaseModel):
    """Administrative audit log."""

    __tablename__ = "audit_logs"

    actor_id: Mapped[uuid.UUID] = mapped_column(db.Uuid, db.ForeignKey("users.id"))
    actor: Mapped[User] = relationship()
    action: Mapped[str] = mapped_column(db.String(255), nullable=False)
    target_type: Mapped[str] = mapped_column(db.String(50), nullable=False)
    target_id: Mapped[str] = mapped_column(db.String(50), nullable=False)
    meta: Mapped[dict] = mapped_column(db.JSON, default=dict)


class Device(BaseModel):
    """Push notification device token registry."""

    __tablename__ = "devices"

    user_id: Mapped[uuid.UUID] = mapped_column(db.Uuid, db.ForeignKey("users.id"))
    user: Mapped[User] = relationship()
    expo_push_token: Mapped[str] = mapped_column(db.String(255), unique=True, nullable=False)


class WebPushSubscription(BaseModel):
    """Web Push subscription registry."""

    __tablename__ = "web_push_subscriptions"

    user_id: Mapped[uuid.UUID] = mapped_column(db.Uuid, db.ForeignKey("users.id"))
    user: Mapped[User] = relationship()
    endpoint: Mapped[str] = mapped_column(db.Text, unique=True, nullable=False)
    p256dh: Mapped[str] = mapped_column(db.String(255), nullable=False)
    auth: Mapped[str] = mapped_column(db.String(255), nullable=False)
