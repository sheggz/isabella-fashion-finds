"""Owner-only read endpoints that include hidden (inactive) pieces. HTTP only."""
import uuid
from datetime import datetime, timezone
from typing import Annotated

from fastapi import APIRouter, Depends, Query

from app.core.security import require_owner
from app.domain.dashboard import LOW_STOCK_DEFAULT
from app.routers.deps import DbSession
from app.schemas.dashboard import DashboardOut
from app.schemas.product import ProductOut
from app.services import catalogue, dashboard
from app.services.presentation import present_many, present_one

router = APIRouter(prefix="/admin", tags=["admin"], dependencies=[Depends(require_owner)])


@router.get("/products", response_model=list[ProductOut])
def list_all_products(
    session: DbSession,
    limit: Annotated[int, Query(ge=1, le=200)] = 100,
    offset: Annotated[int, Query(ge=0)] = 0,
):
    return present_many(
        session, catalogue.list_products(session, include_inactive=True, limit=limit, offset=offset)
    )


@router.get("/products/{product_id}", response_model=ProductOut)
def get_any_product(product_id: uuid.UUID, session: DbSession):
    return present_one(session, catalogue.get_product(session, product_id, include_inactive=True))


@router.get("/dashboard", response_model=DashboardOut)
def get_dashboard(
    session: DbSession,
    days: Annotated[int, Query(ge=1, le=90)] = 30,
    low_stock: Annotated[int, Query(ge=0, le=100)] = LOW_STOCK_DEFAULT,
):
    """Stock levels and sales for the owner. `days` = sales window; `low_stock` = alert threshold."""
    return dashboard.build_dashboard(session, now=datetime.now(timezone.utc), days=days, low_threshold=low_stock)
