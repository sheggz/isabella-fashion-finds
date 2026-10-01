import uuid
from datetime import datetime, timedelta, timezone

import pytest
from sqlalchemy import create_engine
from sqlalchemy.pool import StaticPool

from app.db.base import Base
from app.db.session import make_session_factory
from app.domain.pricing import DiscountInfo
from app.schemas.product import ProductCreate
from app.services import catalogue
from app.services.presentation import present_product

NOW = datetime(2026, 10, 1, 12, 0, tzinfo=timezone.utc)
HOUR = timedelta(hours=1)


@pytest.fixture
def session():
    engine = create_engine("sqlite://", poolclass=StaticPool, connect_args={"check_same_thread": False})
    Base.metadata.create_all(engine)
    with make_session_factory(engine)() as s:
        yield s


def info(**over):
    return DiscountInfo(**{
        "id": uuid.UUID(int=1), "name": "Weekend sale", "kind": "percent", "percent_bp": 1000,
        "amount_kobo": None, "starts_at": NOW - HOUR, "ends_at": NOW + HOUR, "is_enabled": True,
        "applies_to_all": True, "product_ids": frozenset(), **over,
    })


def single(session):
    return catalogue.create_product(
        session, ProductCreate(name="Dress", price_kobo=1500000, variants=[{"size": "S", "stock": 1}, {"size": "M", "stock": 1}])
    )


def per_size(session):
    return catalogue.create_product(
        session,
        ProductCreate(name="Gown", pricing_mode="per_size",
                      variants=[{"size": "S", "stock": 1, "price_kobo": 2000000}, {"size": "M", "stock": 1, "price_kobo": 1000000}]),
    )


def test_without_discounts_there_is_no_sale(session):
    out = present_product(single(session), [], NOW)
    assert out.sale_price_kobo is None and out.discount is None
    assert all(v.sale_price_kobo is None for v in out.variants)


def test_a_live_discount_reduces_every_size_of_a_one_price_piece(session):
    out = present_product(single(session), [info()], NOW)
    assert out.price_kobo == 1500000          # the original stays visible so it can be struck through
    assert out.sale_price_kobo == 1350000
    assert [v.sale_price_kobo for v in out.variants] == [1350000, 1350000]
    assert out.discount.name == "Weekend sale" and out.discount.ends_at == NOW + HOUR


def test_each_size_of_a_per_size_piece_is_discounted_from_its_own_price(session):
    out = present_product(per_size(session), [info()], NOW)
    assert {v.size: (v.price_kobo, v.sale_price_kobo) for v in out.variants} == {
        "S": (2000000, 1800000), "M": (1000000, 900000)
    }
    assert out.price_kobo == 1000000 and out.sale_price_kobo == 900000   # "from" prices


def test_the_discount_goes_live_exactly_at_its_start_with_no_job_involved(session):
    product = single(session)
    starts = info(starts_at=NOW, ends_at=NOW + HOUR)
    assert present_product(product, [starts], NOW - timedelta(milliseconds=1)).sale_price_kobo is None
    assert present_product(product, [starts], NOW).sale_price_kobo == 1350000


def test_it_stops_exactly_at_its_end(session):
    product = single(session)
    ends = info(starts_at=NOW - HOUR, ends_at=NOW)
    assert present_product(product, [ends], NOW - timedelta(milliseconds=1)).sale_price_kobo == 1350000
    assert present_product(product, [ends], NOW).sale_price_kobo is None


def test_a_discount_for_other_pieces_does_not_apply(session):
    other = info(applies_to_all=False, product_ids=frozenset({uuid.uuid4()}))
    assert present_product(single(session), [other], NOW).sale_price_kobo is None


def test_a_discount_for_this_piece_does_apply(session):
    product = single(session)
    mine = info(applies_to_all=False, product_ids=frozenset({product.id}))
    assert present_product(product, [mine], NOW).sale_price_kobo == 1350000
