"""A shopper's order history."""
import uuid

from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.errors import NotFound
from app.domain.images import public_url
from app.models.order import Order
from app.repositories import orders as repo
from app.schemas.order import OrderItemOut, OrderOut
from app.services.discounts import as_utc


def present_order(order: Order) -> OrderOut:
    settings = get_settings()
    return OrderOut(
        id=order.id,
        status=order.status,
        currency=order.currency,
        subtotal_kobo=order.subtotal_kobo,
        total_kobo=order.total_kobo,
        item_count=sum(item.quantity for item in order.items),
        created_at=as_utc(order.created_at),
        paid_at=as_utc(order.paid_at) if order.paid_at else None,
        items=[
            OrderItemOut(
                product_id=item.product_id,
                product_name=item.product_name,
                size=item.size,
                image_url=public_url(settings.supabase_url, settings.storage_bucket, item.image_path) if item.image_path else None,
                quantity=item.quantity,
                unit_price_kobo=item.unit_price_kobo,
                base_price_kobo=item.base_price_kobo,
                discount_name=item.discount_name,
                line_total_kobo=item.line_total_kobo,
            )
            for item in order.items
        ],
    )


def list_orders(session: Session, user_id: uuid.UUID) -> list[OrderOut]:
    return [present_order(o) for o in repo.list_for(session, user_id)]


def get_order(session: Session, user_id: uuid.UUID, order_id: uuid.UUID) -> OrderOut:
    order = repo.get_for(session, user_id, order_id)
    # Someone else's order is reported as missing, so order ids cannot be probed.
    if order is None:
        raise NotFound("Order not found")
    return present_order(order)
