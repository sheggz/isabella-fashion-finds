"""All database access for discounts."""
import uuid
from datetime import datetime

from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app.models.discount import Discount
from app.models.product import Product


def add(session: Session, discount: Discount) -> Discount:
    session.add(discount)
    session.flush()
    return discount


def get(session: Session, discount_id: uuid.UUID) -> Discount | None:
    return session.scalar(
        select(Discount).where(Discount.id == discount_id).options(selectinload(Discount.products))
    )


def list_all(session: Session) -> list[Discount]:
    query = select(Discount).options(selectinload(Discount.products)).order_by(Discount.starts_at, Discount.name)
    return list(session.scalars(query))


def not_ended(session: Session, now: datetime) -> list[Discount]:
    """Enabled discounts that have not ended yet (live ones AND scheduled ones).

    A cheap first filter so old campaigns are never loaded. Whether one actually applies right
    now is decided by the pure rules in domain/pricing.py, not by this query.
    """
    query = (
        select(Discount)
        .where(Discount.is_enabled.is_(True), Discount.ends_at > now)
        .options(selectinload(Discount.products))
    )
    return list(session.scalars(query))


def products_by_ids(session: Session, ids: list[uuid.UUID]) -> list[Product]:
    return list(session.scalars(select(Product).where(Product.id.in_(ids)))) if ids else []


def delete(session: Session, discount: Discount) -> None:
    session.delete(discount)
