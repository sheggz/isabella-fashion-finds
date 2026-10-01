"""Request/response shapes. Validation happens here, at the HTTP boundary."""
import uuid
from datetime import datetime
from typing import Annotated, Literal

from pydantic import (
    AfterValidator,
    BaseModel,
    ConfigDict,
    Field,
    computed_field,
    field_validator,
    model_validator,
)

from app.core.config import get_settings
from app.domain.images import public_url
from app.domain.pricing import check_prices
from app.domain.sizing import normalize_size, validate_measurements


def _clean_optional(value: str | None) -> str | None:
    """Pure: trim; treat blank as 'not provided'."""
    if value is None:
        return None
    value = value.strip()
    return value or None


class VariantIn(BaseModel):
    size: str
    stock: int = Field(ge=0)
    price_kobo: int | None = Field(default=None, ge=0)  # only for pieces priced per size
    measurements: dict[str, float] = Field(default_factory=dict)  # centimetres, optional

    @field_validator("size", mode="before")
    @classmethod
    def canonical_size(cls, v):
        return normalize_size(v)

    @field_validator("measurements", mode="before")
    @classmethod
    def clean_measurements(cls, v):
        # Runs BEFORE Pydantic's own float coercion so our rules (known body parts, positive,
        # at most 300 cm, no booleans) produce the error messages the owner sees.
        return validate_measurements(v)


def _ensure_unique_sizes(variants: list[VariantIn]) -> list[VariantIn]:
    sizes = [v.size for v in variants]  # already canonical, so "m" and "M" collide
    if len(sizes) != len(set(sizes)):
        raise ValueError("each size may appear only once")
    return variants


# Used by BOTH product creation and the "replace variants" endpoint, so the rules can't diverge.
VariantList = Annotated[
    list[VariantIn], Field(min_length=1), AfterValidator(_ensure_unique_sizes)
]


class ProductCreate(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    description: str | None = Field(default=None, max_length=5000)  # optional
    pricing_mode: Literal["single", "per_size"] = "single"
    price_kobo: int | None = Field(default=None, ge=0)  # the one price, in "single" mode only
    is_active: bool = True
    variants: VariantList

    @model_validator(mode="after")
    def prices_match_the_mode(self):
        # Needs the whole object (mode, piece price and every size price), so it runs after the
        # fields are validated. ValueError becomes a normal 422 for the owner.
        check_prices(self.pricing_mode, self.price_kobo, [v.price_kobo for v in self.variants])
        return self

    @field_validator("name")
    @classmethod
    def trim_name(cls, v: str) -> str:
        v = v.strip()
        if not v:
            raise ValueError("name must not be blank")
        return v

    @field_validator("description")
    @classmethod
    def clean_description(cls, v: str | None) -> str | None:
        return _clean_optional(v)


class ProductUpdate(BaseModel):
    """Every field optional: only what is sent is changed."""

    name: str | None = Field(default=None, min_length=1, max_length=200)
    description: str | None = Field(default=None, max_length=5000)
    price_kobo: int | None = Field(default=None, ge=0)
    is_active: bool | None = None

    @field_validator("name")
    @classmethod
    def trim_name(cls, v: str | None) -> str | None:
        if v is None:
            return None
        v = v.strip()
        if not v:
            raise ValueError("name must not be blank")
        return v

    @field_validator("description")
    @classmethod
    def clean_description(cls, v: str | None) -> str | None:
        return _clean_optional(v)


class VariantOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    size: str
    stock: int
    measurements: dict[str, float]
    price_kobo: int  # this size's undiscounted price (the shared price in "single" mode)


class ImageOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    position: int
    path: str = Field(exclude=True)  # internal storage path: needed to build the URL, never sent

    @computed_field
    @property
    def url(self) -> str:
        settings = get_settings()
        return public_url(settings.supabase_url, settings.storage_bucket, self.path)


class ReorderIn(BaseModel):
    image_ids: list[uuid.UUID]


class ProductOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    name: str
    description: str | None
    pricing_mode: str
    price_kobo: int | None  # the "from" price: the cheapest size's undiscounted price
    price_varies: bool  # True when sizes cost different amounts ("from" should be shown)
    is_active: bool
    created_at: datetime
    variants: list[VariantOut]
    images: list[ImageOut]
