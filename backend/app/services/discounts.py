"""Discount management and the bridge to the pure pricing rules."""
import uuid
from datetime import datetime, timezone

from sqlalchemy.orm import Session

from app.core.errors import BadRequest, NotFound
from app.domain.pricing import DiscountInfo
from app.models.discount import Discount
from app.repositories import discounts as repo
from app.schemas.discount import DiscountIn


def as_utc(value: datetime) -> datetime:
    """Return `value` as an aware UTC time, treating a time without a zone as already UTC.

    Postgres hands back aware times; SQLite (our test database) forgets the zone. The pricing
    rules compare against an aware `now`, and Python refuses to compare aware with naive times,
    so values are repaired here, at the edge, instead of crashing mid-request.
    """
    return value.replace(tzinfo=timezone.utc) if value.tzinfo is None else value.astimezone(timezone.utc)


def to_info(discount: Discount) -> DiscountInfo:
    """Database row -> the plain value the pure pricing rules work with."""
    return DiscountInfo(
        id=discount.id,
        name=discount.name,
        kind=discount.kind,
        percent_bp=discount.percent_bp,
        amount_kobo=discount.amount_kobo,
        starts_at=as_utc(discount.starts_at),
        ends_at=as_utc(discount.ends_at),
        is_enabled=discount.is_enabled,
        applies_to_all=discount.applies_to_all,
        product_ids=frozenset(p.id for p in discount.products),
    )


def live_candidates(session: Session, now: datetime) -> list[DiscountInfo]:
    return [to_info(d) for d in repo.not_ended(session, now)]


def list_discounts(session: Session) -> list[Discount]:
    return repo.list_all(session)


def get_discount(session: Session, discount_id: uuid.UUID) -> Discount:
    discount = repo.get(session, discount_id)
    if discount is None:
        raise NotFound("Discount not found")
    return discount


def create_discount(session: Session, data: DiscountIn) -> Discount:
    discount = Discount()
    _fill(session, discount, data)
    repo.add(session, discount)
    session.commit()
    return discount


def replace_discount(session: Session, discount_id: uuid.UUID, data: DiscountIn) -> Discount:
    discount = get_discount(session, discount_id)
    _fill(session, discount, data)
    session.commit()
    return discount


def delete_discount(session: Session, discount_id: uuid.UUID) -> None:
    repo.delete(session, get_discount(session, discount_id))
    session.commit()


def _fill(session: Session, discount: Discount, data: DiscountIn) -> None:
    pieces = [] if data.applies_to_all else repo.products_by_ids(session, data.product_ids)
    missing = set(data.product_ids) - {p.id for p in pieces}
    if missing:
        raise BadRequest(f"Unknown piece(s): {', '.join(sorted(str(m) for m in missing))}")

    discount.name = data.name
    discount.kind = data.kind
    discount.percent_bp = data.percent_bp
    discount.amount_kobo = data.amount_kobo if data.kind == "amount" else None
    discount.applies_to_all = data.applies_to_all
    discount.starts_at = data.starts_at
    discount.ends_at = data.ends_at
    discount.is_enabled = data.is_enabled
    discount.products = pieces
