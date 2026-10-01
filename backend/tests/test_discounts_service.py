import uuid
from datetime import datetime, timedelta, timezone

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import Session
from sqlalchemy.pool import StaticPool

from app.core.errors import BadRequest, NotFound
from app.db.base import Base
from app.db.session import make_session_factory
from app.models.product import Product
from app.schemas.discount import DiscountIn
from app.schemas.product import ProductCreate
from app.services import catalogue, discounts

NOW = datetime(2026, 10, 1, 12, 0, tzinfo=timezone.utc)
HOUR = timedelta(hours=1)


@pytest.fixture
def session():
    engine = create_engine("sqlite://", poolclass=StaticPool, connect_args={"check_same_thread": False})
    Base.metadata.create_all(engine)
    with make_session_factory(engine)() as s:
        yield s


def piece(session: Session, name="Dress") -> Product:
    return catalogue.create_product(
        session, ProductCreate(name=name, price_kobo=1000000, variants=[{"size": "S", "stock": 1}])
    )


def data(**over):
    return DiscountIn(
        **{"name": "Sale", "kind": "percent", "percent": 10, "applies_to_all": True,
           "starts_at": NOW - HOUR, "ends_at": NOW + HOUR, **over}
    )


def test_create_stores_a_percentage_as_basis_points(session):
    d = discounts.create_discount(session, data(percent=12.5))
    assert (d.kind, d.percent_bp, d.amount_kobo) == ("percent", 1250, None)
    assert d.applies_to_all is True and d.is_enabled is True


def test_create_stores_a_fixed_amount(session):
    d = discounts.create_discount(session, data(kind="amount", percent=None, amount_kobo=250000))
    assert (d.kind, d.percent_bp, d.amount_kobo) == ("amount", None, 250000)


def test_create_links_the_selected_pieces(session):
    a, b = piece(session, "A"), piece(session, "B")
    d = discounts.create_discount(session, data(applies_to_all=False, product_ids=[a.id]))
    assert [p.id for p in discounts.get_discount(session, d.id).products] == [a.id]
    assert b.id not in {p.id for p in d.products}


def test_an_unknown_piece_is_a_bad_request_that_names_it(session):
    ghost = uuid.uuid4()
    with pytest.raises(BadRequest, match=str(ghost)):
        discounts.create_discount(session, data(applies_to_all=False, product_ids=[ghost]))


def test_replace_changes_the_details_and_the_pieces(session):
    a, b = piece(session, "A"), piece(session, "B")
    d = discounts.create_discount(session, data(applies_to_all=False, product_ids=[a.id]))
    discounts.replace_discount(
        session, d.id, data(name="New", kind="amount", percent=None, amount_kobo=5000, applies_to_all=False, product_ids=[b.id])
    )
    got = discounts.get_discount(session, d.id)
    assert (got.name, got.kind, got.percent_bp, got.amount_kobo) == ("New", "amount", None, 5000)
    assert [p.id for p in got.products] == [b.id]


def test_replace_to_every_piece_clears_the_selection(session):
    a = piece(session)
    d = discounts.create_discount(session, data(applies_to_all=False, product_ids=[a.id]))
    discounts.replace_discount(session, d.id, data())
    got = discounts.get_discount(session, d.id)
    assert got.applies_to_all is True and got.products == []


def test_missing_discounts_are_not_found(session):
    for call in (
        lambda: discounts.get_discount(session, uuid.uuid4()),
        lambda: discounts.replace_discount(session, uuid.uuid4(), data()),
        lambda: discounts.delete_discount(session, uuid.uuid4()),
    ):
        with pytest.raises(NotFound):
            call()


def test_delete_removes_it(session):
    d = discounts.create_discount(session, data())
    discounts.delete_discount(session, d.id)
    assert discounts.list_discounts(session) == []


def test_list_shows_the_soonest_starting_first(session):
    later = discounts.create_discount(session, data(name="Later", starts_at=NOW + HOUR, ends_at=NOW + 2 * HOUR))
    soon = discounts.create_discount(session, data(name="Soon"))
    assert [d.id for d in discounts.list_discounts(session)] == [soon.id, later.id]


def test_live_candidates_skip_disabled_and_ended_discounts(session):
    live = discounts.create_discount(session, data(name="live"))
    scheduled = discounts.create_discount(session, data(name="scheduled", starts_at=NOW + HOUR, ends_at=NOW + 2 * HOUR))
    discounts.create_discount(session, data(name="off", is_enabled=False))
    discounts.create_discount(session, data(name="ended", starts_at=NOW - 3 * HOUR, ends_at=NOW - HOUR))
    ids = {c.id for c in discounts.live_candidates(session, NOW)}
    assert ids == {live.id, scheduled.id}  # scheduled ones are kept: the pure rules decide when they apply


def test_to_info_treats_times_without_a_timezone_as_utc(session):
    # SQLite (used by the tests) forgets time zones; Postgres keeps them. The pricing rules compare
    # against an aware `now`, so the conversion must repair naive values or comparing would crash.
    d = discounts.create_discount(session, data())
    d.starts_at = d.starts_at.replace(tzinfo=None)
    d.ends_at = d.ends_at.replace(tzinfo=None)
    info = discounts.to_info(d)
    assert info.starts_at.tzinfo is not None and info.ends_at.tzinfo is not None
    assert info.starts_at < NOW < info.ends_at
