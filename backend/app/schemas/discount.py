"""Discount request/response shapes. Validation happens here, at the HTTP boundary."""
import uuid
from datetime import datetime, timezone
from typing import Literal

from pydantic import BaseModel, Field, field_validator, model_validator

from app.domain.pricing import percent_to_bp


class DiscountIn(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    kind: Literal["percent", "amount"]
    percent: float | None = None  # for kind "percent", e.g. 12.5
    amount_kobo: int | None = None  # for kind "amount"
    applies_to_all: bool
    product_ids: list[uuid.UUID] = Field(default_factory=list)
    starts_at: datetime
    ends_at: datetime
    is_enabled: bool = True

    @field_validator("name")
    @classmethod
    def trim_name(cls, v: str) -> str:
        v = v.strip()
        if not v:
            raise ValueError("name must not be blank")
        return v

    @field_validator("starts_at", "ends_at")
    @classmethod
    def aware_utc(cls, v: datetime) -> datetime:
        # A time without a zone is ambiguous (whose "noon"?), so it is refused instead of
        # guessed. Everything is stored and compared in UTC; the browser converts for display.
        if v.tzinfo is None:
            raise ValueError("include a time zone, for example 2026-10-01T12:00:00Z")
        return v.astimezone(timezone.utc)

    @model_validator(mode="after")
    def consistent(self):
        if self.kind == "percent":
            if self.amount_kobo is not None:
                raise ValueError("a percentage discount takes a percentage, not an amount")
            percent_to_bp(self.percent)  # raises a specific ValueError when invalid
        else:
            if self.percent is not None:
                raise ValueError("an amount discount takes an amount, not a percentage")
            if self.amount_kobo is None or self.amount_kobo <= 0:
                raise ValueError("the amount must be more than zero")

        if self.applies_to_all and self.product_ids:
            raise ValueError("remove the selected pieces when a discount applies to every piece")
        if not self.applies_to_all and not self.product_ids:
            raise ValueError("choose at least one piece, or apply the discount to every piece")
        if len(set(self.product_ids)) != len(self.product_ids):
            raise ValueError("a piece was listed more than once")

        if self.ends_at <= self.starts_at:
            raise ValueError("the end must be after the start")
        return self

    @property
    def percent_bp(self) -> int | None:
        return percent_to_bp(self.percent) if self.kind == "percent" else None


class DiscountOut(BaseModel):
    id: uuid.UUID
    name: str
    kind: str
    percent: float | None
    amount_kobo: int | None
    applies_to_all: bool
    product_ids: list[uuid.UUID]
    starts_at: datetime
    ends_at: datetime
    is_enabled: bool
    status: str  # "disabled" | "scheduled" | "live" | "ended"
    created_at: datetime
