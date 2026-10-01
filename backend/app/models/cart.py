"""A shopper's cart: one row per size they hold. The cart lives on the server so it follows the
shopper across devices. It does NOT hold stock: stock is checked again at checkout."""
import uuid
from datetime import datetime

from sqlalchemy import CheckConstraint, DateTime, ForeignKey, Integer, UniqueConstraint, Uuid, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base
from app.models.product import ProductVariant


class CartItem(Base):
    __tablename__ = "cart_items"
    __table_args__ = (
        CheckConstraint("quantity >= 1", name="ck_cart_items_quantity_positive"),
        CheckConstraint("price_at_add_kobo >= 0", name="ck_cart_items_price_non_negative"),
        UniqueConstraint("user_id", "variant_id", name="uq_cart_items_user_variant"),
    )

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    variant_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("product_variants.id", ondelete="CASCADE"))
    quantity: Mapped[int] = mapped_column(Integer)
    # The price per item the shopper last SAW (when adding or changing the line). If the real
    # price differs when the cart is shown again, the cart says so. It is never what they pay.
    price_at_add_kobo: Mapped[int] = mapped_column(Integer)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    variant: Mapped[ProductVariant] = relationship()
