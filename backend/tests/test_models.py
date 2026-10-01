import pytest
from sqlalchemy import create_engine, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.db.base import Base
from app.models.product import Product, ProductImage, ProductVariant


@pytest.fixture
def session():
    engine = create_engine("sqlite://")
    Base.metadata.create_all(engine)
    with Session(engine) as s:
        yield s


def make_product(**over):
    return Product(**{"name": "Ankara Dress", "price_kobo": 1_500_000, **over})


def test_product_description_is_optional(session):
    session.add(make_product())
    session.commit()
    assert session.scalars(select(Product)).one().description is None


def test_product_defaults_to_active_with_timestamps(session):
    session.add(make_product(description="Hand-sewn"))
    session.commit()
    p = session.scalars(select(Product)).one()
    assert p.is_active is True
    assert p.created_at is not None and p.id is not None


def test_negative_price_is_rejected(session):
    session.add(make_product(price_kobo=-1))
    with pytest.raises(IntegrityError):
        session.commit()


def test_variants_hold_per_size_stock(session):
    p = make_product()
    p.variants = [ProductVariant(size="S", stock=2), ProductVariant(size="M", stock=0)]
    session.add(p)
    session.commit()
    sizes = {v.size: v.stock for v in session.scalars(select(Product)).one().variants}
    assert sizes == {"S": 2, "M": 0}


def test_negative_stock_is_rejected(session):
    p = make_product()
    p.variants = [ProductVariant(size="S", stock=-1)]
    session.add(p)
    with pytest.raises(IntegrityError):
        session.commit()


def test_a_piece_priced_per_size_has_no_piece_price_and_each_size_has_its_own(session):
    p = make_product(pricing_mode="per_size", price_kobo=None)
    p.variants = [ProductVariant(size="S", stock=1, price_kobo=1000), ProductVariant(size="M", stock=1, price_kobo=1200)]
    session.add(p)
    session.commit()
    prices = {v.size: v.price_kobo for v in session.scalars(select(Product)).one().variants}
    assert prices == {"S": 1000, "M": 1200}


def test_one_price_mode_defaults_in_and_requires_the_piece_price(session):
    session.add(make_product())
    session.commit()
    assert session.scalars(select(Product)).one().pricing_mode == "single"
    session.add(make_product(price_kobo=None))
    with pytest.raises(IntegrityError):
        session.commit()


def test_per_size_mode_must_not_also_carry_a_piece_price(session):
    session.add(make_product(pricing_mode="per_size", price_kobo=1000))
    with pytest.raises(IntegrityError):
        session.commit()


def test_an_unknown_pricing_mode_is_rejected_by_the_database(session):
    session.add(make_product(pricing_mode="tiered"))
    with pytest.raises(IntegrityError):
        session.commit()


def test_a_negative_size_price_is_rejected_by_the_database(session):
    p = make_product(pricing_mode="per_size", price_kobo=None)
    p.variants = [ProductVariant(size="S", stock=1, price_kobo=-1)]
    session.add(p)
    with pytest.raises(IntegrityError):
        session.commit()


def test_a_size_outside_the_fixed_list_is_rejected_by_the_database(session):
    p = make_product()
    p.variants = [ProductVariant(size="HUGE", stock=1)]
    session.add(p)
    with pytest.raises(IntegrityError):
        session.commit()


def test_measurements_default_to_empty_and_round_trip(session):
    p = make_product()
    p.variants = [
        ProductVariant(size="S", stock=1),
        ProductVariant(size="M", stock=1, measurements={"bust": 92.0, "waist": 74.0}),
    ]
    session.add(p)
    session.commit()
    by_size = {v.size: v.measurements for v in session.scalars(select(Product)).one().variants}
    assert by_size == {"S": {}, "M": {"bust": 92.0, "waist": 74.0}}


def test_same_size_twice_for_one_product_is_rejected(session):
    p = make_product()
    p.variants = [ProductVariant(size="S", stock=1), ProductVariant(size="S", stock=1)]
    session.add(p)
    with pytest.raises(IntegrityError):
        session.commit()


def test_deleting_a_product_removes_its_variants_and_images(session):
    p = make_product()
    p.variants = [ProductVariant(size="S", stock=1)]
    p.images = [ProductImage(path="products/a.jpg", position=0)]
    session.add(p)
    session.commit()
    session.delete(p)
    session.commit()
    assert session.scalars(select(ProductVariant)).all() == []
    assert session.scalars(select(ProductImage)).all() == []


def test_every_table_is_registered_for_migrations():
    assert {"products", "product_variants", "product_images"} <= set(Base.metadata.tables)


# --- discounts ---

def make_discount(**over):
    from datetime import datetime, timedelta, timezone

    from app.models.discount import Discount

    now = datetime(2026, 10, 1, 12, 0, tzinfo=timezone.utc)
    return Discount(**{
        "name": "Sale", "kind": "percent", "percent_bp": 1000, "applies_to_all": True,
        "starts_at": now, "ends_at": now + timedelta(days=1), **over,
    })


def test_a_valid_discount_is_stored_with_defaults(session):
    session.add(make_discount())
    session.commit()
    from app.models.discount import Discount

    d = session.scalars(select(Discount)).one()
    assert d.is_enabled is True and d.id is not None and d.created_at is not None


@pytest.mark.parametrize(
    "bad",
    [
        {"kind": "bogus"},
        {"percent_bp": 0},
        {"percent_bp": 10000},                              # 100% would make the piece free
        {"amount_kobo": 500},                               # a percent discount must not carry an amount
        {"kind": "amount", "percent_bp": None, "amount_kobo": 0},
        {"kind": "amount", "percent_bp": 1000, "amount_kobo": 500},
    ],
)
def test_the_database_rejects_inconsistent_discount_values(session, bad):
    session.add(make_discount(**bad))
    with pytest.raises(IntegrityError):
        session.commit()


def test_the_database_rejects_a_discount_that_ends_before_it_starts(session):
    from datetime import datetime, timezone

    session.add(make_discount(ends_at=datetime(2020, 1, 1, tzinfo=timezone.utc)))
    with pytest.raises(IntegrityError):
        session.commit()


def test_a_discount_can_be_linked_to_selected_pieces(session):
    from app.models.discount import Discount

    piece = make_product()
    d = make_discount(applies_to_all=False)
    d.products = [piece]
    session.add_all([piece, d])
    session.commit()
    assert [p.name for p in session.scalars(select(Discount)).one().products] == ["Ankara Dress"]
