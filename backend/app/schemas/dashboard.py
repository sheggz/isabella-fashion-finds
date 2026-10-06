import uuid

from pydantic import BaseModel


class LowStockOut(BaseModel):
    product_id: uuid.UUID
    name: str
    size: str
    stock: int


class SoldOutOut(BaseModel):
    product_id: uuid.UUID
    name: str


class StockOut(BaseModel):
    pieces: int
    visible_pieces: int
    units_in_stock: int
    low_stock_threshold: int
    low_stock: list[LowStockOut]
    sold_out: list[SoldOutOut]


class DayOut(BaseModel):
    date: str
    revenue_kobo: int
    orders: int


class TopProductOut(BaseModel):
    product_id: uuid.UUID | None
    name: str
    units: int
    revenue_kobo: int


class SalesOut(BaseModel):
    days: int
    revenue_kobo: int
    orders: int
    items_sold: int
    average_order_kobo: int
    by_day: list[DayOut]
    top_products: list[TopProductOut]


class DashboardOut(BaseModel):
    stock: StockOut
    sales: SalesOut
