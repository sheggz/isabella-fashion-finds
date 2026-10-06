"""Owner dashboard numbers. Pure: data in, numbers out; no database, no clock (`now` is passed in)."""
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone

LOW_STOCK_DEFAULT = 3
SHOP_UTC_OFFSET_MINUTES = 60  # Lagos is UTC+1 all year (no daylight saving)
TOP_PRODUCTS = 5


@dataclass(frozen=True)
class StockedProduct:
    id: object
    name: str
    is_active: bool
    sizes: dict  # size label -> units in stock


@dataclass(frozen=True)
class SoldLine:
    product_id: object  # None once the product was deleted: then the name groups the lines
    name: str
    quantity: int
    line_total_kobo: int


@dataclass(frozen=True)
class PaidOrder:
    paid_at: datetime
    total_kobo: int
    lines: list


def stock_report(products: list[StockedProduct], low_threshold: int = LOW_STOCK_DEFAULT) -> dict:
    """Stock levels for the owner.

    - `low_stock`: sizes of VISIBLE pieces with 1..threshold units left (lowest first), the
      "restock soon" list. A size at 0 is not "low", it is gone: see `sold_out`.
    - `sold_out`: VISIBLE pieces whose every size is at 0. A piece with no sizes at all is not
      reported (nothing was ever stocked).
    Hidden pieces are drafts or retired items, so they raise no alerts but their units still count.
    """
    low, sold_out = [], []
    for product in products:
        if not product.is_active or not product.sizes:
            continue
        if all(units == 0 for units in product.sizes.values()):
            sold_out.append({"product_id": product.id, "name": product.name})
        for size, units in product.sizes.items():
            if 0 < units <= low_threshold:
                low.append({"product_id": product.id, "name": product.name, "size": size, "stock": units})
    low.sort(key=lambda r: (r["stock"], r["name"], r["size"]))
    sold_out.sort(key=lambda r: r["name"])
    return {
        "pieces": len(products),
        "visible_pieces": sum(1 for p in products if p.is_active),
        "units_in_stock": sum(sum(p.sizes.values()) for p in products),
        "low_stock": low,
        "sold_out": sold_out,
    }


def _local_date(moment: datetime, offset_minutes: int):
    return (moment.astimezone(timezone.utc) + timedelta(minutes=offset_minutes)).date()


def sales_summary(
    orders: list[PaidOrder], *, now: datetime, days: int, tz_offset_minutes: int = SHOP_UTC_OFFSET_MINUTES
) -> dict:
    """Sales over the last `days` calendar days (today included), cut at the shop's local midnight.

    Only pass PAID orders. Every day of the window is present in `by_day` (zeros for quiet days)
    so a chart has no gaps. Revenue is integer kobo. Products are grouped by id, falling back to
    the name when the product has since been deleted.
    """
    today = _local_date(now, tz_offset_minutes)
    window = [today - timedelta(days=n) for n in range(days - 1, -1, -1)]
    per_day = {d: {"date": d.isoformat(), "revenue_kobo": 0, "orders": 0} for d in window}
    products: dict = {}
    revenue = items = count = 0

    for order in orders:
        day = _local_date(order.paid_at, tz_offset_minutes)
        if day not in per_day:
            continue
        count += 1
        revenue += order.total_kobo
        per_day[day]["revenue_kobo"] += order.total_kobo
        per_day[day]["orders"] += 1
        for line in order.lines:
            items += line.quantity
            key = line.product_id if line.product_id is not None else line.name
            entry = products.setdefault(
                key, {"product_id": line.product_id, "name": line.name, "units": 0, "revenue_kobo": 0}
            )
            entry["units"] += line.quantity
            entry["revenue_kobo"] += line.line_total_kobo

    top = sorted(products.values(), key=lambda p: (-p["revenue_kobo"], p["name"]))[:TOP_PRODUCTS]
    return {
        "days": days,
        "revenue_kobo": revenue,
        "orders": count,
        "items_sold": items,
        "average_order_kobo": revenue // count if count else 0,
        "by_day": [per_day[d] for d in window],
        "top_products": top,
    }
