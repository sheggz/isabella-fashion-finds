"""Assemble the owner's dashboard from the database. Rules live in app/domain/dashboard.py."""
from datetime import datetime, timedelta

from sqlalchemy.orm import Session

from app.domain.dashboard import PaidOrder, SoldLine, StockedProduct, sales_summary, stock_report
from app.repositories import orders as orders_repo
from app.repositories import products as products_repo
from app.schemas.dashboard import DashboardOut
from app.services.discounts import as_utc

# Safety valve: the dashboard reads the whole catalogue, which is fine for a small shop. If it
# ever grows past this, move the totals into SQL aggregates instead of raising the number.
MAX_PIECES = 1000


def build_dashboard(session: Session, *, now: datetime, days: int, low_threshold: int) -> DashboardOut:
    products = products_repo.list_all(session, include_inactive=True, limit=MAX_PIECES, offset=0)
    stocked = [
        StockedProduct(id=p.id, name=p.name, is_active=p.is_active, sizes={v.size: v.stock for v in p.variants})
        for p in products
    ]
    # One extra day of margin: the domain cuts days in shop-local time, the query is in UTC.
    rows = orders_repo.list_paid_since(session, now - timedelta(days=days + 1))
    paid = [
        PaidOrder(
            paid_at=as_utc(o.paid_at),
            total_kobo=o.total_kobo,
            lines=[SoldLine(i.product_id, i.product_name, i.quantity, i.line_total_kobo) for i in o.items],
        )
        for o in rows
    ]
    stock = stock_report(stocked, low_threshold)
    stock["low_stock_threshold"] = low_threshold
    return DashboardOut(stock=stock, sales=sales_summary(paid, now=now, days=days))
