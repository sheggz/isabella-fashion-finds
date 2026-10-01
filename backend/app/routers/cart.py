"""The signed-in shopper's cart. HTTP only: the rules live in services/cart.py."""
import uuid
from typing import Annotated

from fastapi import APIRouter, Depends

from app.core.security import require_user
from app.models.user import User
from app.routers.deps import DbSession
from app.schemas.cart import AddToCartIn, CartOut, SetQuantityIn
from app.services import cart

router = APIRouter(prefix="/cart", tags=["cart"])

Shopper = Annotated[User, Depends(require_user)]


@router.get("", response_model=CartOut)
def get_cart(user: Shopper, session: DbSession):
    return cart.get_cart(session, user.id)


@router.post("/items", response_model=CartOut)
def add_item(body: AddToCartIn, user: Shopper, session: DbSession):
    return cart.add_item(session, user.id, body.variant_id, body.quantity)


@router.patch("/items/{variant_id}", response_model=CartOut)
def set_quantity(variant_id: uuid.UUID, body: SetQuantityIn, user: Shopper, session: DbSession):
    return cart.set_quantity(session, user.id, variant_id, body.quantity)


@router.delete("/items/{variant_id}", response_model=CartOut)
def remove_item(variant_id: uuid.UUID, user: Shopper, session: DbSession):
    return cart.remove_item(session, user.id, variant_id)


@router.delete("", response_model=CartOut)
def clear_cart(user: Shopper, session: DbSession):
    return cart.clear_cart(session, user.id)
