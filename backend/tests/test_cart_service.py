import uuid
from datetime import datetime, timedelta, timezone

import pytest
from sqlalchemy import create_engine
from sqlalchemy.pool import StaticPool

from app.core.errors import BadRequest, LimitExceeded, NotFound, OutOfStock
from app.db.base import Base
from app.db.session import make_session_factory
from app.models.user import User
from app.schemas.discount import DiscountIn
from app.schemas.product import ProductCreate
from app.services import cart, catalogue, discounts

HOUR = timedelta(hours=1)


@pytest.fixture
def session():
    engine = create_engine("sqlite://", poolclass=StaticPool, connect_args={"check_same_thread": False})
    Base.metadata.create_all(engine)
    with make_session_factory(engine)() as s:
        yield s


def make_user(session, name="ada"):
    user = User(google_sub=f"sub-{name}", email=f"{name}@example.test", name=name)
    session.add(user)
    session.commit()
    return user


@pytest.fixture
def user(session):
    return make_user(session)


def piece(session, name="Dress", stock=5, max_per_order=None, **over):
    data = {"name": name, "price_kobo": 1_000_000, "max_per_order": max_per_order,
            "variants": [{"size": "S", "stock": stock}, {"size": "M", "stock": stock}], **over}
    return catalogue.create_product(session, ProductCreate(**data))


def variant_id(product, size="S"):
    return next(v.id for v in product.variants if v.size == size)


def live_discount(session, **over):
    now = datetime.now(timezone.utc)
    data = {"name": "Sale", "kind": "percent", "percent": 10, "applies_to_all": True,
            "starts_at": now - HOUR, "ends_at": now + HOUR, **over}
    return discounts.create_discount(session, DiscountIn(**data))


# --- adding ---

def test_adding_creates_a_line_at_the_current_price(session, user):
    p = piece(session)
    result = cart.add_item(session, user.id, variant_id(p), 2)
    (line,) = result.lines
    assert (line.quantity, line.unit_price_kobo, line.base_price_kobo, line.line_total_kobo) == (2, 1_000_000, 1_000_000, 2_000_000)
    assert (line.name, line.size) == ("Dress", "S")
    assert result.subtotal_kobo == 2_000_000 and result.item_count == 2


def test_adding_the_same_size_again_adds_to_the_quantity(session, user):
    p = piece(session)
    cart.add_item(session, user.id, variant_id(p), 1)
    result = cart.add_item(session, user.id, variant_id(p), 2)
    assert [line.quantity for line in result.lines] == [3]


def test_unknown_or_hidden_items_cannot_be_added(session, user):
    with pytest.raises(NotFound):
        cart.add_item(session, user.id, uuid.uuid4(), 1)
    hidden = piece(session, is_active=False)
    with pytest.raises(NotFound):
        cart.add_item(session, user.id, variant_id(hidden), 1)


def test_more_than_the_stock_is_refused_with_what_is_left_and_nothing_changes(session, user):
    p = piece(session, stock=3)
    cart.add_item(session, user.id, variant_id(p), 2)
    with pytest.raises(OutOfStock) as caught:
        cart.add_item(session, user.id, variant_id(p), 2)   # would be 4, only 3 exist
    assert caught.value.details == {"allowed": 3, "in_cart": 2}
    assert cart.get_cart(session, user.id).lines[0].quantity == 2


def test_the_line_ceiling_applies_even_with_plenty_of_stock(session, user):
    p = piece(session, stock=99)
    with pytest.raises(LimitExceeded):
        cart.add_item(session, user.id, variant_id(p), 11)


def test_the_owners_per_order_limit_counts_all_sizes_of_the_piece(session, user):
    p = piece(session, max_per_order=2)
    cart.add_item(session, user.id, variant_id(p, "S"), 1)
    with pytest.raises(LimitExceeded) as caught:
        cart.add_item(session, user.id, variant_id(p, "M"), 2)   # 1 + 2 = 3 of the same piece
    assert caught.value.details["allowed"] == 1
    cart.add_item(session, user.id, variant_id(p, "M"), 1)       # exactly the limit is fine


def test_the_limit_is_per_piece_not_per_store(session, user):
    limited, free = piece(session, "Limited", max_per_order=1), piece(session, "Free")
    cart.add_item(session, user.id, variant_id(limited), 1)
    assert cart.add_item(session, user.id, variant_id(free), 3).item_count == 4


# --- changing and removing ---

def test_set_quantity_replaces_it_and_respects_the_same_rules(session, user):
    p = piece(session, stock=4)
    cart.add_item(session, user.id, variant_id(p), 1)
    assert cart.set_quantity(session, user.id, variant_id(p), 3).lines[0].quantity == 3
    with pytest.raises(OutOfStock):
        cart.set_quantity(session, user.id, variant_id(p), 5)
    with pytest.raises(NotFound):
        cart.set_quantity(session, user.id, variant_id(p, "M"), 1)   # not in the cart


def test_quantities_below_one_are_a_bad_request_use_remove_instead(session, user):
    p = piece(session)
    cart.add_item(session, user.id, variant_id(p), 1)
    with pytest.raises(BadRequest):
        cart.set_quantity(session, user.id, variant_id(p), 0)


def test_remove_and_clear(session, user):
    p = piece(session)
    cart.add_item(session, user.id, variant_id(p, "S"), 1)
    cart.add_item(session, user.id, variant_id(p, "M"), 1)
    assert [l.size for l in cart.remove_item(session, user.id, variant_id(p, "S")).lines] == ["M"]
    assert cart.clear_cart(session, user.id).lines == []


def test_removing_something_not_in_the_cart_is_not_found(session, user):
    p = piece(session)
    with pytest.raises(NotFound):
        cart.remove_item(session, user.id, variant_id(p))


def test_each_shopper_has_their_own_cart(session, user):
    other = make_user(session, "bola")
    p = piece(session)
    cart.add_item(session, user.id, variant_id(p), 2)
    assert cart.get_cart(session, other.id).lines == []


# --- prices ---

def test_a_live_discount_lowers_the_unit_price_and_is_reported_as_savings(session, user):
    p = piece(session)
    live_discount(session)
    result = cart.add_item(session, user.id, variant_id(p), 2)
    (line,) = result.lines
    assert (line.unit_price_kobo, line.base_price_kobo, line.discount_name) == (900_000, 1_000_000, "Sale")
    assert result.subtotal_kobo == 1_800_000 and result.savings_kobo == 200_000


def test_each_size_of_a_per_size_piece_uses_its_own_price(session, user):
    p = catalogue.create_product(session, ProductCreate(name="Gown", pricing_mode="per_size",
        variants=[{"size": "S", "stock": 3, "price_kobo": 2_000_000}, {"size": "M", "stock": 3, "price_kobo": 1_200_000}]))
    cart.add_item(session, user.id, variant_id(p, "S"), 1)
    result = cart.add_item(session, user.id, variant_id(p, "M"), 1)
    assert {l.size: l.unit_price_kobo for l in result.lines} == {"S": 2_000_000, "M": 1_200_000}


def test_a_price_that_changed_since_adding_is_flagged_with_the_old_price(session, user):
    p = piece(session)
    cart.add_item(session, user.id, variant_id(p), 1)
    assert cart.get_cart(session, user.id).lines[0].price_changed_from_kobo is None
    live_discount(session)   # a sale starts while the item sits in the cart
    line = cart.get_cart(session, user.id).lines[0]
    assert (line.unit_price_kobo, line.price_changed_from_kobo) == (900_000, 1_000_000)


def test_the_shopper_always_pays_the_current_price_when_the_quantity_is_touched_again(session, user):
    p = piece(session)
    cart.add_item(session, user.id, variant_id(p), 1)
    live_discount(session)
    result = cart.set_quantity(session, user.id, variant_id(p), 2)   # seeing the new price, then changing
    assert result.lines[0].price_changed_from_kobo is None and result.lines[0].line_total_kobo == 1_800_000


# --- lines that went bad after being added ---

def test_a_piece_hidden_after_adding_is_unavailable_and_not_charged_for(session, user):
    p = piece(session)
    cart.add_item(session, user.id, variant_id(p), 1)
    catalogue.update_product(session, p.id, __import__("app.schemas.product", fromlist=["ProductUpdate"]).ProductUpdate(is_active=False))
    result = cart.get_cart(session, user.id)
    assert result.lines[0].problem == "unavailable" and result.has_problems
    assert result.subtotal_kobo == 0 and result.item_count == 1


def test_stock_that_drops_after_adding_is_reported(session, user):
    p = piece(session, stock=5)
    cart.add_item(session, user.id, variant_id(p), 4)
    from app.schemas.product import VariantIn
    catalogue.replace_variants(session, p.id, [VariantIn(size="S", stock=2), VariantIn(size="M", stock=5)])
    line = cart.get_cart(session, user.id).lines[0]
    assert (line.problem, line.available_quantity) == ("reduced", 2)
    catalogue.replace_variants(session, p.id, [VariantIn(size="S", stock=0), VariantIn(size="M", stock=5)])
    assert cart.get_cart(session, user.id).lines[0].problem == "out_of_stock"


def test_a_size_the_owner_removed_disappears_from_the_cart(session, user):
    p = piece(session)
    cart.add_item(session, user.id, variant_id(p, "S"), 1)
    cart.add_item(session, user.id, variant_id(p, "M"), 1)
    from app.schemas.product import VariantIn
    catalogue.replace_variants(session, p.id, [VariantIn(size="M", stock=5)])
    assert [l.size for l in cart.get_cart(session, user.id).lines] == ["M"]
