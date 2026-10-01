"""All database access for products lives here. No business rules, no HTTP."""
import uuid

from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app.models.product import Product


def add(session: Session, product: Product) -> Product:
    session.add(product)
    session.flush()  # assign defaults/ids without ending the transaction
    return product


def get(session: Session, product_id: uuid.UUID) -> Product | None:
    return session.scalar(
        select(Product)
        .where(Product.id == product_id)
        .options(selectinload(Product.variants), selectinload(Product.images))
    )


def list_all(
    session: Session, *, include_inactive: bool, limit: int, offset: int
) -> list[Product]:
    query = select(Product).options(selectinload(Product.variants), selectinload(Product.images))
    if not include_inactive:
        query = query.where(Product.is_active.is_(True))
    query = query.order_by(Product.created_at.desc(), Product.name).limit(limit).offset(offset)
    return list(session.scalars(query))


def delete(session: Session, product: Product) -> None:
    session.delete(product)
