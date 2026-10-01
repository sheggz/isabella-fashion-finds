"""Owner-only discount management. HTTP only: the rules live in services/discounts.py."""
import uuid

from fastapi import APIRouter, Depends, Response, status

from app.core.security import require_owner
from app.routers.deps import DbSession
from app.schemas.discount import DiscountIn, DiscountOut
from app.services import discounts
from app.services.presentation import present_discount

router = APIRouter(prefix="/admin/discounts", tags=["discounts"], dependencies=[Depends(require_owner)])


@router.get("", response_model=list[DiscountOut])
def list_discounts(session: DbSession):
    return [present_discount(d) for d in discounts.list_discounts(session)]


@router.get("/{discount_id}", response_model=DiscountOut)
def get_discount(discount_id: uuid.UUID, session: DbSession):
    return present_discount(discounts.get_discount(session, discount_id))


@router.post("", response_model=DiscountOut, status_code=status.HTTP_201_CREATED)
def create_discount(data: DiscountIn, session: DbSession):
    return present_discount(discounts.create_discount(session, data))


@router.put("/{discount_id}", response_model=DiscountOut)
def replace_discount(discount_id: uuid.UUID, data: DiscountIn, session: DbSession):
    return present_discount(discounts.replace_discount(session, discount_id, data))


@router.delete("/{discount_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_discount(discount_id: uuid.UUID, session: DbSession):
    discounts.delete_discount(session, discount_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)
