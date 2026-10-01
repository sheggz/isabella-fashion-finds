"""Orders. Each line is a COPY of what was bought (name, size, the price actually charged), not
a link to the live product, so history stays accurate when a product is later edited or deleted."""
import uuid
from datetime import datetime

from sqlalchemy import CheckConstraint, DateTime, ForeignKey, Integer, String, Uuid, func
from sqlalchemy.ext.orderinglist import ordering_list
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base
from app.domain.orders import ORDER_STATUSES

STATUS_CHECK_SQL = "status in (" + ", ".join(f"'{s}'" for s in ORDER_STATUSES) + ")"


class Order(Base):
    __tablename__ = "orders"
    __table_args__ = (
        CheckConstraint(STATUS_CHECK_SQL, name="ck_orders_status_known"),
        CheckConstraint("subtotal_kobo >= 0", name="ck_orders_subtotal_non_negative"),
        CheckConstraint("total_kobo >= 0", name="ck_orders_total_non_negative"),
    )

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    # RESTRICT: an order is a financial record, so a shopper with orders cannot simply be deleted.
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="RESTRICT"), index=True)
    status: Mapped[str] = mapped_column(String(12), default="pending", server_default="pending")
    subtotal_kobo: Mapped[int] = mapped_column(Integer)
    total_kobo: Mapped[int] = mapped_column(Integer)
    currency: Mapped[str] = mapped_column(String(3), default="NGN", server_default="NGN")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    paid_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    items: Mapped[list["OrderItem"]] = relationship(
        back_populates="order",
        cascade="all, delete-orphan",
        order_by="OrderItem.position",
        collection_class=ordering_list("position"),  # keeps lines in the order they were added
    )


class OrderItem(Base):
    __tablename__ = "order_items"
    __table_args__ = (
        CheckConstraint("quantity >= 1", name="ck_order_items_quantity_positive"),
        CheckConstraint("unit_price_kobo >= 0", name="ck_order_items_unit_price_non_negative"),
        CheckConstraint("base_price_kobo >= 0", name="ck_order_items_base_price_non_negative"),
        CheckConstraint("line_total_kobo >= 0", name="ck_order_items_line_total_non_negative"),
    )

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    order_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("orders.id", ondelete="CASCADE"), index=True)
    position: Mapped[int] = mapped_column(Integer, default=0, server_default="0")
    # Loose links for reference only: they become NULL if the product or size is deleted.
    product_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("products.id", ondelete="SET NULL"), nullable=True)
    variant_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("product_variants.id", ondelete="SET NULL"), nullable=True)
    # The snapshot: what the customer actually bought and paid for.
    product_name: Mapped[str] = mapped_column(String(200))
    size: Mapped[str] = mapped_column(String(20))
    image_path: Mapped[str | None] = mapped_column(String(500), nullable=True)
    unit_price_kobo: Mapped[int] = mapped_column(Integer)  # per item, after any discount
    base_price_kobo: Mapped[int] = mapped_column(Integer)  # per item, before any discount
    discount_name: Mapped[str | None] = mapped_column(String(100), nullable=True)
    quantity: Mapped[int] = mapped_column(Integer)
    line_total_kobo: Mapped[int] = mapped_column(Integer)

    order: Mapped[Order] = relationship(back_populates="items")
