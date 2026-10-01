import uuid

import pytest
from pydantic import ValidationError
from sqlalchemy import create_engine
from sqlalchemy.pool import StaticPool

from app.core.errors import BadRequest, NotFound
from app.db.base import Base
from app.db.session import make_session_factory
from app.schemas.product import ProductCreate, ProductUpdate, VariantIn
from app.services import catalogue


@pytest.fixture
def session():
    engine = create_engine(
        "sqlite://", poolclass=StaticPool, connect_args={"check_same_thread": False}
    )
    Base.metadata.create_all(engine)
    with make_session_factory(engine)() as s:
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


def test_sizes_are_normalised_to_the_fixed_list():
    assert new(variants=[{"size": " m ", "stock": 1}]).variants[0].size == "M"
    assert new(variants=[{"size": "one size", "stock": 1}]).variants[0].size == "ONE_SIZE"


def test_a_size_outside_the_list_is_rejected():
    with pytest.raises(ValidationError):
        VariantIn(size="XXXL", stock=1)


def test_measurements_are_validated_per_size():
    ok = VariantIn(size="M", stock=1, measurements={"bust": 92, "waist": 74})
    assert ok.measurements == {"bust": 92.0, "waist": 74.0}
    with pytest.raises(ValidationError):
        VariantIn(size="M", stock=1, measurements={"earlobe": 3})
    with pytest.raises(ValidationError):
        VariantIn(size="M", stock=1, measurements={"bust": -4})


# --- service behaviour ---

def test_measurements_are_stored_and_returned_with_each_size(session):
    created = catalogue.create_product(
        session,
        new(variants=[
            {"size": "S", "stock": 2},
            {"size": "M", "stock": 1, "measurements": {"bust": 92, "length": 110}},
        ]),
    )
    got = {v.size: v.measurements for v in catalogue.get_product(session, created.id).variants}
    assert got == {"S": {}, "M": {"bust": 92.0, "length": 110.0}}


def test_replace_variants_updates_measurements_of_existing_sizes(session):
    p = catalogue.create_product(session, new())
    result = catalogue.replace_variants(
        session, p.id, [VariantIn(size="M", stock=1, measurements={"waist": 70})]
    )
    assert {v.size: v.measurements for v in result.variants} == {"M": {"waist": 70.0}}

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


# --- pricing: one price for every size, or a price per size ---

def per_size(**over):
    return new(
        pricing_mode="per_size",
        price_kobo=None,
        variants=[{"size": "S", "stock": 1, "price_kobo": 1000000}, {"size": "M", "stock": 1, "price_kobo": 1200000}],
        **over,
    )


def test_one_price_is_the_default_mode():
    assert new().pricing_mode == "single"


def test_per_size_pieces_need_a_price_on_every_size_and_none_on_the_piece():
    assert per_size().pricing_mode == "per_size"
    with pytest.raises(ValidationError, match="every size needs a price"):
        new(pricing_mode="per_size", price_kobo=None, variants=[{"size": "S", "stock": 1}])
    with pytest.raises(ValidationError, match="remove the piece price"):
        new(pricing_mode="per_size", variants=[{"size": "S", "stock": 1, "price_kobo": 1000}])


def test_one_price_pieces_need_the_price_and_no_size_prices():
    with pytest.raises(ValidationError, match="set the price"):
        new(price_kobo=None)
    with pytest.raises(ValidationError, match="per size"):
        new(variants=[{"size": "S", "stock": 1, "price_kobo": 1000}])


def test_unknown_pricing_mode_and_negative_size_prices_are_rejected():
    with pytest.raises(ValidationError):
        new(pricing_mode="tiered")
    with pytest.raises(ValidationError):
        VariantIn(size="S", stock=1, price_kobo=-1)


def test_a_per_size_piece_is_stored_with_each_size_price(session):
    created = catalogue.create_product(session, per_size())
    got = catalogue.get_product(session, created.id)
    assert got.pricing_mode == "per_size" and got.price_kobo is None
    assert {v.size: v.price_kobo for v in got.variants} == {"S": 1000000, "M": 1200000}


def test_replacing_sizes_must_respect_the_pieces_pricing_mode(session):
    single = catalogue.create_product(session, new())
    with pytest.raises(BadRequest):
        catalogue.replace_variants(session, single.id, [VariantIn(size="S", stock=1, price_kobo=500)])

    priced = catalogue.create_product(session, per_size())
    with pytest.raises(BadRequest):
        catalogue.replace_variants(session, priced.id, [VariantIn(size="S", stock=1)])
    ok = catalogue.replace_variants(session, priced.id, [VariantIn(size="L", stock=2, price_kobo=900000)])
    assert {v.size: v.price_kobo for v in ok.variants} == {"L": 900000}


def test_the_piece_price_cannot_be_patched_when_each_size_has_its_own(session):
    priced = catalogue.create_product(session, per_size())
    with pytest.raises(BadRequest):
        catalogue.update_product(session, priced.id, ProductUpdate(price_kobo=1000))


def test_the_piece_price_cannot_be_patched_to_nothing(session):
    single = catalogue.create_product(session, new())
    with pytest.raises(BadRequest):
        catalogue.update_product(session, single.id, ProductUpdate(price_kobo=None))


def test_replace_product_switches_pricing_mode_in_one_step(session):
    original = catalogue.create_product(session, new(description="old"))
    replaced = catalogue.replace_product(session, original.id, per_size(name="Renamed", description=None))
    got = catalogue.get_product(session, original.id)
    assert got.name == "Renamed" and got.description is None
    assert got.pricing_mode == "per_size" and got.price_kobo is None
    assert {v.size: v.price_kobo for v in got.variants} == {"S": 1000000, "M": 1200000}
    assert replaced.id == original.id


def test_replace_product_can_switch_back_to_one_price(session):
    original = catalogue.create_product(session, per_size())
    catalogue.replace_product(session, original.id, new(price_kobo=800000))
    got = catalogue.get_product(session, original.id)
    assert got.pricing_mode == "single" and got.price_kobo == 800000
    assert all(v.price_kobo is None for v in got.variants)


def test_replace_product_on_a_missing_piece_is_not_found(session):
    with pytest.raises(NotFound):
        catalogue.replace_product(session, uuid.uuid4(), new())
