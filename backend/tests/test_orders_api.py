import uuid
from datetime import datetime, timedelta, timezone

import pytest
from sqlalchemy import create_engine
from sqlalchemy.pool import StaticPool

from app.core.security import require_user
from app.db.base import Base
from app.db.session import get_session, make_session_factory
from app.models.order import Order, OrderItem
from app.models.user import User

NOW = datetime(2026, 10, 1, 12, 0, tzinfo=timezone.utc)


@pytest.fixture
def shop(app):
    engine = create_engine("sqlite://", poolclass=StaticPool, connect_args={"check_same_thread": False})
    Base.metadata.create_all(engine)
    factory = make_session_factory(engine)
    with factory() as s:
        users = {n: User(google_sub=f"sub-{n}", email=f"{n}@example.test", name=n) for n in ("ada", "bola")}
        s.add_all(users.values())
        s.commit()
        ids = {n: u.id for n, u in users.items()}
    current = {"who": "ada"}

    def override_session():
        with factory() as s:
            yield s

    def current_user():
        class Who:
            id = ids[current["who"]]
        return Who()

    app.dependency_overrides[get_session] = override_session
    app.dependency_overrides[require_user] = current_user
    app.state.factory, app.state.ids = factory, ids
    app.state.switch_user = lambda name: current.update(who=name)
    return app


def place(app, who, *, hours_ago=0, status="paid", items=None):
    """Insert an order directly (orders are created by checkout in a later milestone)."""
    items = items or [("Ankara Dress", "M", 900_000, 1_000_000, "Sale", 2)]
    with app.state.factory() as s:
        order = Order(
            user_id=app.state.ids[who], status=status, currency="NGN",
            subtotal_kobo=sum(u * q for _, _, u, _, _, q in items),
            total_kobo=sum(u * q for _, _, u, _, _, q in items),
            created_at=NOW - timedelta(hours=hours_ago),
            paid_at=NOW - timedelta(hours=hours_ago) if status == "paid" else None,
        )
        order.items = [
            OrderItem(product_name=name, size=size, unit_price_kobo=unit, base_price_kobo=base,
                      discount_name=disc, quantity=qty, line_total_kobo=unit * qty)
            for name, size, unit, base, disc, qty in items
        ]
        s.add(order)
        s.commit()
        return str(order.id)


def test_orders_need_a_signed_in_shopper(app, client):
    assert client.get("/orders").status_code == 401
    assert client.get(f"/orders/{uuid.uuid4()}").status_code == 401


def test_no_orders_yet_is_an_empty_list(shop, client):
    assert client.get("/orders").json() == []


def test_history_lists_only_my_orders_newest_first(shop, client):
    old = place(shop, "ada", hours_ago=48)
    new = place(shop, "ada", hours_ago=1)
    place(shop, "bola", hours_ago=2)
    listing = client.get("/orders").json()
    assert [o["id"] for o in listing] == [new, old]


def test_an_order_shows_its_status_total_and_the_items_as_they_were_bought(shop, client):
    oid = place(shop, "ada", items=[("Ankara Dress", "M", 900_000, 1_000_000, "Sale", 2), ("Gown", "ONE_SIZE", 500_000, 500_000, None, 1)])
    order = client.get(f"/orders/{oid}").json()
    assert order["status"] == "paid" and order["currency"] == "NGN"
    assert order["total_kobo"] == 2_300_000 and order["item_count"] == 3
    first, second = order["items"]
    assert (first["product_name"], first["size"], first["quantity"]) == ("Ankara Dress", "M", 2)
    assert (first["unit_price_kobo"], first["base_price_kobo"], first["discount_name"], first["line_total_kobo"]) == (900_000, 1_000_000, "Sale", 1_800_000)
    assert second["discount_name"] is None and second["image_url"] is None
    assert order["created_at"] and order["paid_at"]


def test_a_pending_order_has_no_paid_time(shop, client):
    oid = place(shop, "ada", status="pending")
    order = client.get(f"/orders/{oid}").json()
    assert order["status"] == "pending" and order["paid_at"] is None


def test_someone_elses_order_looks_like_it_does_not_exist(shop, client):
    theirs = place(shop, "bola")
    res = client.get(f"/orders/{theirs}")
    assert res.status_code == 404
    assert res.json()["error"]["code"] == "not_found"


def test_unknown_orders_are_a_404_and_bad_ids_a_422(shop, client):
    assert client.get(f"/orders/{uuid.uuid4()}").status_code == 404
    assert client.get("/orders/not-a-uuid").status_code == 422


def test_the_history_survives_the_product_being_deleted(shop, client):
    """Order lines are copies, not links, so editing or deleting the product changes nothing."""
    oid = place(shop, "ada")
    with shop.state.factory() as s:
        s.query(OrderItem).update({OrderItem.product_id: None})   # what ON DELETE SET NULL does in Postgres
        s.commit()
    assert client.get(f"/orders/{oid}").json()["items"][0]["product_name"] == "Ankara Dress"
