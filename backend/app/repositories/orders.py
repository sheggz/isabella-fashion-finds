"""All database access for orders."""
import uuid

from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app.models.order import Order


def list_for(session: Session, user_id: uuid.UUID) -> list[Order]:
    query = (
        select(Order)
        .where(Order.user_id == user_id)
        .options(selectinload(Order.items))
        .order_by(Order.created_at.desc(), Order.id)
    )
    return list(session.scalars(query))


def get_for(session: Session, user_id: uuid.UUID, order_id: uuid.UUID) -> Order | None:
    """Only ever returns the shopper's OWN order: the owner id is part of the query."""
    return session.scalar(
        select(Order).where(Order.id == order_id, Order.user_id == user_id).options(selectinload(Order.items))
    )


def list_paid_since(session: Session, since) -> list[Order]:
    """Paid orders (any shopper) with `paid_at` on or after `since`. For the owner's dashboard."""
    query = (
        select(Order)
        .where(Order.status == "paid", Order.paid_at >= since)
        .options(selectinload(Order.items))
    )
    return list(session.scalars(query))
