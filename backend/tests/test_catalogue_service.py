import uuid

import pytest
from pydantic import ValidationError
from sqlalchemy import create_engine
from sqlalchemy.orm import Session
from sqlalchemy.pool import StaticPool

from app.core.errors import NotFound
from app.db.base import Base
from app.schemas.product import ProductCreate, ProductUpdate, VariantIn
from app.services import catalogue


@pytest.fixture
def session():
    engine = create_engine(
        "sqlite://", poolclass=StaticPool, connect_args={"check_same_thread": False}
    )
    Base.metadata.create_all(engine)
    with Session(engine) as s:
        yield s


def new(**over):
    data = {
        "name": "Ankara Dress",
        "price_kobo": 1_500_000,
        "variants": [{"size": "S", "stock": 2}, {"size": "M", "stock": 1}],
        **over,
    }
    return ProductCreate(**data)


# --- schema rules (pure validation) ---

def test_blank_description_becomes_none():
    assert new(description="   ").description is None


def test_name_is_trimmed_and_required():
    assert new(name="  Gown ").name == "Gown"
    with pytest.raises(ValidationError):
        new(name="   ")


def test_price_and_stock_cannot_be_negative():
    with pytest.raises(ValidationError):
        new(price_kobo=-5)
    with pytest.raises(ValidationError):
        VariantIn(size="S", stock=-1)


def test_duplicate_sizes_are_rejected_case_insensitively():
    with pytest.raises(ValidationError):
        new(variants=[{"size": "m", "stock": 1}, {"size": "M", "stock": 2}])


def test_at_least_one_variant_is_required():
    with pytest.raises(ValidationError):
        new(variants=[])


# --- service behaviour ---

def test_create_then_get_round_trips(session):
    created = catalogue.create_product(session, new(description="Hand-sewn"))
    fetched = catalogue.get_product(session, created.id)
    assert fetched.name == "Ankara Dress"
    assert {v.size: v.stock for v in fetched.variants} == {"S": 2, "M": 1}


def test_get_missing_product_raises_not_found(session):
    with pytest.raises(NotFound):
        catalogue.get_product(session, uuid.uuid4())


def test_public_listing_hides_inactive_products(session):
    catalogue.create_product(session, new(name="Visible"))
    catalogue.create_product(session, new(name="Hidden", is_active=False))
    assert [p.name for p in catalogue.list_products(session)] == ["Visible"]
    assert len(catalogue.list_products(session, include_inactive=True)) == 2


def test_public_get_of_inactive_product_is_not_found(session):
    hidden = catalogue.create_product(session, new(is_active=False))
    with pytest.raises(NotFound):
        catalogue.get_product(session, hidden.id)
    assert catalogue.get_product(session, hidden.id, include_inactive=True)


def test_update_changes_only_the_given_fields(session):
    p = catalogue.create_product(session, new(description="old"))
    updated = catalogue.update_product(session, p.id, ProductUpdate(price_kobo=2_000_000))
    assert updated.price_kobo == 2_000_000
    assert updated.name == "Ankara Dress"
    assert updated.description == "old"


def test_replace_variants_upserts_by_size_and_removes_missing(session):
    p = catalogue.create_product(session, new())
    result = catalogue.replace_variants(
        session, p.id, [VariantIn(size="M", stock=9), VariantIn(size="L", stock=3)]
    )
    assert {v.size: v.stock for v in result.variants} == {"M": 9, "L": 3}


def test_delete_removes_the_product(session):
    p = catalogue.create_product(session, new())
    catalogue.delete_product(session, p.id)
    with pytest.raises(NotFound):
        catalogue.get_product(session, p.id, include_inactive=True)
