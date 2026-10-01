import uuid
from datetime import datetime

from pydantic import BaseModel


class OrderItemOut(BaseModel):
    product_id: uuid.UUID | None  # None once the product has been deleted
    product_name: str
    size: str
    image_url: str | None
    quantity: int
    unit_price_kobo: int  # what was charged per item
    base_price_kobo: int  # what it cost before any discount
    discount_name: str | None
    line_total_kobo: int


class OrderOut(BaseModel):
    id: uuid.UUID
    status: str
    currency: str
    subtotal_kobo: int
    total_kobo: int
    item_count: int
    created_at: datetime
    paid_at: datetime | None
    items: list[OrderItemOut]
