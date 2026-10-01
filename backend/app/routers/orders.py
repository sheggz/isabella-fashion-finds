"""The signed-in shopper's order history. HTTP only."""
import uuid
from typing import Annotated

from fastapi import APIRouter, Depends

from app.core.security import require_user
from app.models.user import User
from app.routers.deps import DbSession
from app.schemas.order import OrderOut
from app.services import orders

router = APIRouter(prefix="/orders", tags=["orders"])

Shopper = Annotated[User, Depends(require_user)]


@router.get("", response_model=list[OrderOut])
def list_orders(user: Shopper, session: DbSession):
    return orders.list_orders(session, user.id)


@router.get("/{order_id}", response_model=OrderOut)
def get_order(order_id: uuid.UUID, user: Shopper, session: DbSession):
    return orders.get_order(session, user.id, order_id)
