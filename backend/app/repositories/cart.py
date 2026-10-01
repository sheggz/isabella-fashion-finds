"""All database access for carts."""
import uuid

from sqlalchemy import delete, select
from sqlalchemy.orm import Session, selectinload

from app.models.cart import CartItem
from app.models.product import Product, ProductVariant


def items_for(session: Session, user_id: uuid.UUID) -> list[CartItem]:
    """A shopper's lines, oldest first, with each size, its piece and the piece's photos loaded.

    An INNER join to the size on purpose: if a size was removed and a database does not cascade
    (SQLite in tests), the dangling line is simply not returned instead of crashing the cart.
    """
    query = (
        select(CartItem)
        .join(ProductVariant, CartItem.variant_id == ProductVariant.id)
        .where(CartItem.user_id == user_id)
        .options(selectinload(CartItem.variant).selectinload(ProductVariant.product).selectinload(Product.images))
        .order_by(CartItem.created_at, CartItem.id)
    )
    return list(session.scalars(query))


def get_variant(session: Session, variant_id: uuid.UUID) -> ProductVariant | None:
    return session.scalar(
        select(ProductVariant)
        .where(ProductVariant.id == variant_id)
        .options(selectinload(ProductVariant.product))
    )


def add(session: Session, item: CartItem) -> CartItem:
    session.add(item)
    session.flush()
    return item


def delete_item(session: Session, item: CartItem) -> None:
    session.delete(item)


def clear(session: Session, user_id: uuid.UUID) -> None:
    session.execute(delete(CartItem).where(CartItem.user_id == user_id))
