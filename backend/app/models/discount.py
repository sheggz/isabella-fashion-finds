"""Scheduled discounts. A discount never changes a stored price: it is applied when prices are
read, from its schedule (ADR 0005), so it goes live and ends without any background job."""
import uuid
from datetime import datetime

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    Column,
    DateTime,
    ForeignKey,
    Integer,
    String,
    Table,
    Uuid,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base
from app.models.product import Product

# Which pieces a discount covers when it does not apply to every piece.
discount_products = Table(
    "discount_products",
    Base.metadata,
    Column("discount_id", ForeignKey("discounts.id", ondelete="CASCADE"), primary_key=True),
    Column("product_id", ForeignKey("products.id", ondelete="CASCADE"), primary_key=True),
)


class Discount(Base):
    __tablename__ = "discounts"
    __table_args__ = (
        CheckConstraint("ends_at > starts_at", name="ck_discounts_window"),
        CheckConstraint("kind in ('percent', 'amount')", name="ck_discounts_kind_known"),
        # Exactly one value, matching the kind. A percentage stays strictly below 100% so a
        # discount can never make a piece free.
        CheckConstraint(
            "(kind = 'percent' AND percent_bp BETWEEN 1 AND 9999 AND amount_kobo IS NULL) "
            "OR (kind = 'amount' AND amount_kobo > 0 AND percent_bp IS NULL)",
            name="ck_discounts_value_matches_kind",
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    name: Mapped[str] = mapped_column(String(100))  # shown to customers, e.g. "Weekend sale"
    kind: Mapped[str] = mapped_column(String(10))
    percent_bp: Mapped[int | None] = mapped_column(Integer, nullable=True)  # basis points: 1000 = 10%
    amount_kobo: Mapped[int | None] = mapped_column(Integer, nullable=True)
    applies_to_all: Mapped[bool] = mapped_column(Boolean, default=False, server_default="false")
    starts_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    ends_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    is_enabled: Mapped[bool] = mapped_column(Boolean, default=True, server_default="true")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    products: Mapped[list[Product]] = relationship(secondary=discount_products)
