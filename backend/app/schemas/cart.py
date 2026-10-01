import uuid

from pydantic import BaseModel, Field


class AddToCartIn(BaseModel):
    variant_id: uuid.UUID
    quantity: int = Field(ge=1, le=100)  # the real ceiling (and stock) is enforced by the cart rules


class SetQuantityIn(BaseModel):
    quantity: int = Field(ge=1, le=100)  # to take an item out, use DELETE


class CartLineOut(BaseModel):
    variant_id: uuid.UUID
    product_id: uuid.UUID
    name: str
    size: str
    image_url: str | None
    quantity: int
    unit_price_kobo: int  # right now, after any live discount
    base_price_kobo: int  # before any discount
    line_total_kobo: int
    discount_name: str | None
    price_changed_from_kobo: int | None  # set when the price differs from what the shopper last saw
    problem: str | None  # "unavailable" | "out_of_stock" | "reduced" | "limit" | None
    problem_message: str | None
    available_quantity: int  # the most they may hold of this size right now
    max_per_order: int | None


class CartOut(BaseModel):
    lines: list[CartLineOut]
    item_count: int
    subtotal_kobo: int  # only lines without a problem
    savings_kobo: int
    has_problems: bool
