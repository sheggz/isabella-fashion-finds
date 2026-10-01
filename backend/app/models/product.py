"""Catalogue tables. Money is integer kobo (never floats)."""
import uuid
from datetime import datetime

from sqlalchemy import (
    JSON,
    Boolean,
    CheckConstraint,
    DateTime,
    ForeignKey,
    Integer,
    String,
    Text,
    UniqueConstraint,
    Uuid,
    func,
    text,
    true,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base
from app.domain.sizing import SIZES

# Built from the same constant the schemas validate against, so they cannot drift apart.
SIZE_CHECK_SQL = "size in (" + ", ".join(f"'{s}'" for s in SIZES) + ")"


class Product(Base):
    __tablename__ = "products"
    __table_args__ = (CheckConstraint("price_kobo >= 0", name="ck_products_price_non_negative"),)

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    name: Mapped[str] = mapped_column(String(200))
    description: Mapped[str | None] = mapped_column(Text, nullable=True)  # optional on purpose
    price_kobo: Mapped[int] = mapped_column(Integer)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, server_default=true())
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    variants: Mapped[list["ProductVariant"]] = relationship(
        back_populates="product", cascade="all, delete-orphan"
    )
    images: Mapped[list["ProductImage"]] = relationship(
        back_populates="product", cascade="all, delete-orphan", order_by="ProductImage.position"
    )


class ProductVariant(Base):
    """One size of one product, with its own stock count and optional measurements (cm).

    Measurements live on the variant (not a global size chart) because the same size label
    is cut differently on different pieces. They are stored as JSON: JSONB on Postgres, plain
    JSON elsewhere (the in-memory SQLite used by tests).
    """

    __tablename__ = "product_variants"
    __table_args__ = (
        CheckConstraint("stock >= 0", name="ck_variants_stock_non_negative"),
        CheckConstraint(SIZE_CHECK_SQL, name="ck_variants_size_known"),
        UniqueConstraint("product_id", "size", name="uq_variants_product_size"),
    )

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    product_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("products.id", ondelete="CASCADE"), index=True
    )
    size: Mapped[str] = mapped_column(String(20))
    stock: Mapped[int] = mapped_column(Integer, default=0, server_default="0")
    measurements: Mapped[dict] = mapped_column(
        JSON().with_variant(JSONB(), "postgresql"), default=dict, server_default=text("'{}'")
    )

    product: Mapped[Product] = relationship(back_populates="variants")


class ProductImage(Base):
    __tablename__ = "product_images"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    product_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("products.id", ondelete="CASCADE"), index=True
    )
    path: Mapped[str] = mapped_column(String(500))  # object path inside the Storage bucket
    position: Mapped[int] = mapped_column(Integer, default=0, server_default="0")

    product: Mapped[Product] = relationship(back_populates="images")
