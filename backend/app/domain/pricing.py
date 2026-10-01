"""Pricing and discount rules. Pure: no database, no HTTP, and NO clock (`now` is always passed in).

All money is integer kobo. These functions are the single source of truth for "what does this
size cost right now"; the catalogue pages use them today and cart and checkout will reuse them,
so a price can never be computed two different ways.
"""
import uuid
from dataclasses import dataclass, field
from datetime import datetime

PRICING_MODES = ("single", "per_size")


# ---- which price a size has ---------------------------------------------------------------

def variant_base_price(mode: str, product_price: int | None, variant_price: int | None) -> int:
    """The undiscounted price of one size.

    "single" = one price for every size (stored on the piece); "per_size" = each size's own
    price. A missing price is an error and never silently becomes zero.
    """
    if mode == "single":
        price = product_price
    elif mode == "per_size":
        price = variant_price
    else:
        raise ValueError(f"unknown pricing mode '{mode}'")
    if price is None:
        raise ValueError("this size has no price")
    return price


def check_prices(mode: str, product_price: int | None, variant_prices: list[int | None]) -> None:
    """Raise ValueError (with a message the owner can act on) unless prices match the mode.

    Strict on purpose: in "single" mode size prices must be absent and in "per_size" mode the
    piece price must be absent, otherwise two prices would exist and nobody could say which wins.
    """
    if mode not in PRICING_MODES:
        raise ValueError(f"pricing must be one of: {', '.join(PRICING_MODES)}")
    if mode == "single":
        if product_price is None:
            raise ValueError("set the price, or switch to a price per size")
        if any(p is not None for p in variant_prices):
            raise ValueError(
                "sizes cannot have their own prices when one price applies to every size; "
                "switch to a price per size instead"
            )
        return
    if not variant_prices:
        raise ValueError("offer at least one size")
    if product_price is not None:
        raise ValueError("remove the piece price: each size has its own price in per size mode")
    if any(p is None for p in variant_prices):
        raise ValueError("every size needs a price in per size mode")


# ---- discounts ----------------------------------------------------------------------------

@dataclass(frozen=True)
class DiscountInfo:
    """What the pricing rules need to know about a discount (no database objects)."""

    id: uuid.UUID
    name: str
    kind: str  # "percent" or "amount"
    percent_bp: int | None  # basis points: 1000 = 10.00%
    amount_kobo: int | None
    starts_at: datetime
    ends_at: datetime
    is_enabled: bool
    applies_to_all: bool
    product_ids: frozenset = field(default_factory=frozenset)


@dataclass(frozen=True)
class Offer:
    discount: DiscountInfo
    reduction_kobo: int
    final_kobo: int


@dataclass(frozen=True)
class Quote:
    base_kobo: int
    final_kobo: int
    discount: DiscountInfo | None


@dataclass(frozen=True)
class ProductPricing:
    from_price_kobo: int | None
    price_varies: bool
    sale_price_kobo: int | None
    discount: DiscountInfo | None


def reduction_for(price_kobo: int, kind: str, percent_bp: int | None, amount_kobo: int | None) -> int:
    """How many kobo a discount takes off `price_kobo`.

    Percentages use integer maths (half rounds up) so there is never a floating point error.
    The result is capped so the price never drops below 1 kobo: a free item could not be paid
    for through a payment provider, and a typo like "N50,000 off" must not give pieces away.
    """
    if kind == "percent":
        reduction = (price_kobo * (percent_bp or 0) + 5000) // 10000
    else:
        reduction = amount_kobo or 0
    return min(reduction, max(price_kobo - 1, 0))


def status_of(d: DiscountInfo, now: datetime) -> str:
    """"disabled" | "scheduled" | "live" | "ended". The start is inclusive and the end exclusive."""
    if not d.is_enabled:
        return "disabled"
    if now < d.starts_at:
        return "scheduled"
    if now >= d.ends_at:
        return "ended"
    return "live"


def applies_to(d: DiscountInfo, product_id: uuid.UUID) -> bool:
    return d.applies_to_all or product_id in d.product_ids


def best_offer(
    price_kobo: int, product_id: uuid.UUID, discounts: list[DiscountInfo], now: datetime
) -> Offer | None:
    """The single best live discount for this price, or None. Discounts never stack.

    "Best" = the biggest reduction. Ties go to the discount that ends soonest, then to the
    lowest id, so the answer never depends on the order the database happened to return rows.
    """
    best: tuple | None = None
    for d in discounts:
        if status_of(d, now) != "live" or not applies_to(d, product_id):
            continue
        reduction = reduction_for(price_kobo, d.kind, d.percent_bp, d.amount_kobo)
        if reduction <= 0:
            continue
        key = (-reduction, d.ends_at, str(d.id))
        if best is None or key < best[0]:
            best = (key, d, reduction)
    if best is None:
        return None
    _, d, reduction = best
    return Offer(discount=d, reduction_kobo=reduction, final_kobo=price_kobo - reduction)


def quote_variant(
    mode: str,
    product_price: int | None,
    variant_price: int | None,
    product_id: uuid.UUID,
    discounts: list[DiscountInfo],
    now: datetime,
) -> Quote:
    """Base and final price of one size right now."""
    base = variant_base_price(mode, product_price, variant_price)
    offer = best_offer(base, product_id, discounts, now)
    if offer is None:
        return Quote(base_kobo=base, final_kobo=base, discount=None)
    return Quote(base_kobo=base, final_kobo=offer.final_kobo, discount=offer.discount)


def product_pricing(quotes: list[Quote]) -> ProductPricing:
    """Summarise a piece for listings: the "from" price, whether sizes differ, and the best sale.

    The sale shown is the cheapest final price among the sizes; the discount reported is the
    one that produced it.
    """
    if not quotes:
        return ProductPricing(None, False, None, None)
    from_price = min(q.base_kobo for q in quotes)
    varies = len({q.base_kobo for q in quotes}) > 1
    discounted = [q for q in quotes if q.discount is not None]
    if not discounted:
        return ProductPricing(from_price, varies, None, None)
    cheapest = min(discounted, key=lambda q: q.final_kobo)
    return ProductPricing(from_price, varies, cheapest.final_kobo, cheapest.discount)
