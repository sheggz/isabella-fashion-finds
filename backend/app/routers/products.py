"""HTTP only: parse/validate in, call the service, serialise out."""
import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, Query, Response, status

from app.core.security import require_owner
from app.routers.deps import DbSession, StorageDep
from app.schemas.product import ProductCreate, ProductOut, ProductUpdate, VariantList
from app.services import catalogue
from app.services.presentation import present_many, present_one

router = APIRouter(prefix="/products", tags=["products"])

OwnerOnly = [Depends(require_owner)]


@router.get("", response_model=list[ProductOut])
def list_products(
    session: DbSession,
    limit: Annotated[int, Query(ge=1, le=100)] = 50,
    offset: Annotated[int, Query(ge=0)] = 0,
):
    return present_many(session, catalogue.list_products(session, limit=limit, offset=offset))


@router.get("/{product_id}", response_model=ProductOut)
def get_product(product_id: uuid.UUID, session: DbSession):
    return present_one(session, catalogue.get_product(session, product_id))


@router.post("", response_model=ProductOut, status_code=status.HTTP_201_CREATED, dependencies=OwnerOnly)
def create_product(data: ProductCreate, session: DbSession):
    return present_one(session, catalogue.create_product(session, data))


@router.put("/{product_id}", response_model=ProductOut, dependencies=OwnerOnly)
def replace_product(product_id: uuid.UUID, data: ProductCreate, session: DbSession):
    """Save the whole piece (details, pricing and sizes) atomically."""
    return present_one(session, catalogue.replace_product(session, product_id, data))


@router.patch("/{product_id}", response_model=ProductOut, dependencies=OwnerOnly)
def update_product(product_id: uuid.UUID, data: ProductUpdate, session: DbSession):
    return present_one(session, catalogue.update_product(session, product_id, data))


@router.put("/{product_id}/variants", response_model=ProductOut, dependencies=OwnerOnly)
def replace_variants(product_id: uuid.UUID, variants: VariantList, session: DbSession):
    return present_one(session, catalogue.replace_variants(session, product_id, variants))


@router.delete("/{product_id}", status_code=status.HTTP_204_NO_CONTENT, dependencies=OwnerOnly)
def delete_product(product_id: uuid.UUID, session: DbSession, storage: StorageDep):
    catalogue.delete_product(session, product_id, storage=storage)
    return Response(status_code=status.HTTP_204_NO_CONTENT)
