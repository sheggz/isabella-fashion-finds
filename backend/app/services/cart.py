"""The shopper's cart. Pure rules live in app/domain/cart.py; prices come from the same pure
pricing rules as the storefront (app/domain/pricing.py), so a price is only ever computed one way."""
import uuid
from datetime import datetime, timezone

from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.errors import BadRequest, LimitExceeded, NotFound, OutOfStock
from app.domain.cart import (
    CartLine,
    allowed_quantity,
    cart_totals,
    line_problem,
    quantity_problem,
)
from app.domain.images import public_url
from app.domain.pricing import DiscountInfo, Quote, quote_variant
from app.models.cart import CartItem
from app.models.product import ProductVariant
from app.repositories import cart as repo
from app.schemas.cart import CartLineOut, CartOut
from app.services import discounts as discounts_service


def get_cart(session: Session, user_id: uuid.UUID, now: datetime | None = None) -> CartOut:
    now = now or datetime.now(timezone.utc)
    items = repo.items_for(session, user_id)
    discounts = discounts_service.live_candidates(session, now)
    return _present(items, discounts, now)


def add_item(session: Session, user_id: uuid.UUID, variant_id: uuid.UUID, quantity: int) -> CartOut:
    variant = repo.get_variant(session, variant_id)
    # A hidden piece looks exactly like a missing one, as in the storefront.
    if variant is None or not variant.product.is_active:
        raise NotFound("That item is not available")

    now = datetime.now(timezone.utc)
    items = repo.items_for(session, user_id)
    existing = next((i for i in items if i.variant_id == variant.id), None)
    held = existing.quantity if existing else 0
    _check(variant, held + quantity, held, _others(items, variant))

    price = _quote(variant, discounts_service.live_candidates(session, now), now).final_kobo
    if existing:
        existing.quantity = held + quantity
        existing.price_at_add_kobo = price
    else:
        repo.add(session, CartItem(user_id=user_id, variant_id=variant.id, quantity=quantity, price_at_add_kobo=price))
    session.commit()
    return get_cart(session, user_id, now)


def set_quantity(session: Session, user_id: uuid.UUID, variant_id: uuid.UUID, quantity: int) -> CartOut:
    if quantity < 1:
        raise BadRequest("Use remove to take an item out of the cart")
    now = datetime.now(timezone.utc)
    items = repo.items_for(session, user_id)
    item = next((i for i in items if i.variant_id == variant_id), None)
    if item is None:
        raise NotFound("That item is not in your cart")

    _check(item.variant, quantity, item.quantity, _others(items, item.variant))
    item.quantity = quantity
    # Changing the quantity means the shopper is looking at the cart again, so the price they
    # see now becomes the price they have "seen".
    item.price_at_add_kobo = _quote(item.variant, discounts_service.live_candidates(session, now), now).final_kobo
    session.commit()
    return get_cart(session, user_id, now)


def remove_item(session: Session, user_id: uuid.UUID, variant_id: uuid.UUID) -> CartOut:
    item = next((i for i in repo.items_for(session, user_id) if i.variant_id == variant_id), None)
    if item is None:
        raise NotFound("That item is not in your cart")
    repo.delete_item(session, item)
    session.commit()
    return get_cart(session, user_id)


def clear_cart(session: Session, user_id: uuid.UUID) -> CartOut:
    repo.clear(session, user_id)
    session.commit()
    return get_cart(session, user_id)


# ---- helpers --------------------------------------------------------------------------------

def _others(items: list[CartItem], variant: ProductVariant) -> int:
    """How many of the SAME piece the shopper already holds in other sizes (for the order limit)."""
    return sum(i.quantity for i in items if i.variant.product_id == variant.product_id and i.variant_id != variant.id)


def _check(variant: ProductVariant, wanted: int, held: int, others: int) -> None:
    problem = quantity_problem(wanted, variant.stock, variant.product.max_per_order, others)
    if problem is None:
        return
    error = OutOfStock if problem.kind == "stock" else LimitExceeded
    raise error(problem.message, details={"allowed": problem.allowed, "in_cart": held})


def _quote(variant: ProductVariant, discounts: list[DiscountInfo], now: datetime) -> Quote:
    product = variant.product
    return quote_variant(product.pricing_mode, product.price_kobo, variant.price_kobo, product.id, discounts, now)


def _problem_message(problem: str, available: int, limit: int | None) -> str:
    return {
        "unavailable": "This piece is no longer available",
        "out_of_stock": "Sold out",
        "reduced": f"Only {available} left in this size",
        "limit": f"Limited to {limit} per order",
    }[problem]


def _present(items: list[CartItem], discounts: list[DiscountInfo], now: datetime) -> CartOut:
    settings = get_settings()
    lines: list[CartLineOut] = []
    domain_lines: list[CartLine] = []

    for item in items:
        variant, product = item.variant, item.variant.product
        quote = _quote(variant, discounts, now)
        others = _others(items, variant)
        problem = line_problem(product.is_active, variant.stock, item.quantity, product.max_per_order, others)
        available = allowed_quantity(variant.stock, product.max_per_order, others) if product.is_active else 0
        cover = min(product.images, key=lambda image: image.position, default=None)

        domain_lines.append(CartLine(quote.final_kobo, quote.base_kobo, item.quantity, problem))
        lines.append(
            CartLineOut(
                variant_id=variant.id,
                product_id=product.id,
                name=product.name,
                size=variant.size,
                image_url=public_url(settings.supabase_url, settings.storage_bucket, cover.path) if cover else None,
                quantity=item.quantity,
                unit_price_kobo=quote.final_kobo,
                base_price_kobo=quote.base_kobo,
                line_total_kobo=quote.final_kobo * item.quantity,
                discount_name=quote.discount.name if quote.discount else None,
                price_changed_from_kobo=item.price_at_add_kobo if item.price_at_add_kobo != quote.final_kobo else None,
                problem=problem,
                problem_message=_problem_message(problem, available, product.max_per_order) if problem else None,
                available_quantity=available,
                max_per_order=product.max_per_order,
            )
        )

    totals = cart_totals(domain_lines)
    return CartOut(
        lines=lines,
        item_count=totals.item_count,
        subtotal_kobo=totals.subtotal_kobo,
        savings_kobo=totals.savings_kobo,
        has_problems=totals.has_problems,
    )
