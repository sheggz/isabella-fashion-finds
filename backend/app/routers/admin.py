"""Owner-only read endpoints that include hidden (inactive) pieces. HTTP only."""
import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, Query

from app.core.security import require_owner
from app.routers.deps import DbSession
from app.schemas.product import ProductOut
from app.services import catalogue

router = APIRouter(prefix="/admin", tags=["admin"], dependencies=[Depends(require_owner)])


@router.get("/products", response_model=list[ProductOut])
def list_all_products(
    session: DbSession,
    limit: Annotated[int, Query(ge=1, le=200)] = 100,
    offset: Annotated[int, Query(ge=0)] = 0,
):
    return catalogue.list_products(session, include_inactive=True, limit=limit, offset=offset)


@router.get("/products/{product_id}", response_model=ProductOut)
def get_any_product(product_id: uuid.UUID, session: DbSession):
    return catalogue.get_product(session, product_id, include_inactive=True)
