"""HTTP only: parse/validate in, call the service, serialise out."""
import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, Query, Response, status
from sqlalchemy.orm import Session

from app.core.security import require_owner
from app.db.session import get_session
from app.schemas.product import ProductCreate, ProductOut, ProductUpdate, VariantIn
from app.services import catalogue

router = APIRouter(prefix="/products", tags=["products"])

DbSession = Annotated[Session, Depends(get_session)]
OwnerOnly = [Depends(require_owner)]


@router.get("", response_model=list[ProductOut])
def list_products(
    session: DbSession,
    limit: Annotated[int, Query(ge=1, le=100)] = 50,
    offset: Annotated[int, Query(ge=0)] = 0,
):
    return catalogue.list_products(session, limit=limit, offset=offset)


@router.get("/{product_id}", response_model=ProductOut)
def get_product(product_id: uuid.UUID, session: DbSession):
    return catalogue.get_product(session, product_id)


@router.post("", response_model=ProductOut, status_code=status.HTTP_201_CREATED, dependencies=OwnerOnly)
def create_product(data: ProductCreate, session: DbSession):
    return catalogue.create_product(session, data)


@router.patch("/{product_id}", response_model=ProductOut, dependencies=OwnerOnly)
def update_product(product_id: uuid.UUID, data: ProductUpdate, session: DbSession):
    return catalogue.update_product(session, product_id, data)


@router.put("/{product_id}/variants", response_model=ProductOut, dependencies=OwnerOnly)
def replace_variants(product_id: uuid.UUID, variants: list[VariantIn], session: DbSession):
    return catalogue.replace_variants(session, product_id, variants)


@router.delete("/{product_id}", status_code=status.HTTP_204_NO_CONTENT, dependencies=OwnerOnly)
def delete_product(product_id: uuid.UUID, session: DbSession):
    catalogue.delete_product(session, product_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)
