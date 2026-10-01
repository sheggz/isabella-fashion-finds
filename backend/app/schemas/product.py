"""Request/response shapes. Validation happens here, at the HTTP boundary."""
import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field, field_validator


def _clean_optional(value: str | None) -> str | None:
    """Pure: trim; treat blank as 'not provided'."""
    if value is None:
        return None
    value = value.strip()
    return value or None


class VariantIn(BaseModel):
    size: str = Field(min_length=1, max_length=20)
    stock: int = Field(ge=0)

    @field_validator("size")
    @classmethod
    def trim_size(cls, v: str) -> str:
        v = v.strip()
        if not v:
            raise ValueError("size must not be blank")
        return v


def _ensure_unique_sizes(variants: list[VariantIn]) -> list[VariantIn]:
    sizes = [v.size.casefold() for v in variants]
    if len(sizes) != len(set(sizes)):
        raise ValueError("each size may appear only once")
    return variants


class ProductCreate(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    description: str | None = Field(default=None, max_length=5000)  # optional
    price_kobo: int = Field(ge=0)
    is_active: bool = True
    variants: list[VariantIn] = Field(min_length=1)

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

    @field_validator("variants")
    @classmethod
    def unique_sizes(cls, v: list[VariantIn]) -> list[VariantIn]:
        return _ensure_unique_sizes(v)


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


class ProductOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    name: str
    description: str | None
    price_kobo: int
    is_active: bool
    created_at: datetime
    variants: list[VariantOut]
