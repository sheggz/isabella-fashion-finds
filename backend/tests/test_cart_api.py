import pytest
from sqlalchemy import create_engine
from sqlalchemy.pool import StaticPool

from app.core.security import require_owner, require_user
from app.db.base import Base
from app.db.session import get_session, make_session_factory
from app.models.user import User

PRODUCT = {"name": "Dress", "price_kobo": 1_000_000, "variants": [{"size": "S", "stock": 3}, {"size": "M", "stock": 5}]}


@pytest.fixture
def shop(app):
    """A fake shop: an owner who stocks it, and two shoppers who can be switched between."""
    engine = create_engine("sqlite://", poolclass=StaticPool, connect_args={"check_same_thread": False})
    Base.metadata.create_all(engine)
    factory = make_session_factory(engine)
    with factory() as s:
        users = {n: User(google_sub=f"sub-{n}", email=f"{n}@example.test", name=n) for n in ("ada", "bola")}
        s.add_all(users.values())
        s.commit()
        ids = {n: u.id for n, u in users.items()}

    def override_session():
        with factory() as s:
            yield s

    current = {"who": "ada"}

    def current_user():
        class Who:
            id = ids[current["who"]]
        return Who()

    app.dependency_overrides[get_session] = override_session
    app.dependency_overrides[require_owner] = lambda: None
    app.dependency_overrides[require_user] = current_user
    app.state.switch_user = lambda name: current.update(who=name)
    return app


def stock(client, **over):
    return client.post("/products", json={**PRODUCT, **over}).json()


def vid(product, size="S"):
    return next(v["id"] for v in product["variants"] if v["size"] == size)


# --- who can use a cart ---

def test_the_cart_needs_a_signed_in_shopper(app, client):
    assert client.get("/cart").status_code == 401
    assert client.post("/cart/items", json={"variant_id": "00000000-0000-0000-0000-000000000000", "quantity": 1}).status_code == 401
    assert client.delete("/cart").status_code == 401


# --- the shape the shop relies on ---

def test_products_expose_a_size_id_and_the_per_order_limit(shop, client):
    p = stock(client, max_per_order=2)
    assert p["max_per_order"] == 2
    assert all(v["id"] for v in p["variants"])
    assert stock(client, name="Other")["max_per_order"] is None


def test_an_empty_cart(shop, client):
    assert client.get("/cart").json() == {
        "lines": [], "item_count": 0, "subtotal_kobo": 0, "savings_kobo": 0, "has_problems": False,
    }


def test_adding_then_reading_the_cart(shop, client):
    p = stock(client)
    res = client.post("/cart/items", json={"variant_id": vid(p), "quantity": 2})
    assert res.status_code == 200
    body = client.get("/cart").json()
    (line,) = body["lines"]
    assert (line["name"], line["size"], line["quantity"]) == ("Dress", "S", 2)
    assert (line["unit_price_kobo"], line["line_total_kobo"]) == (1_000_000, 2_000_000)
    assert line["variant_id"] == vid(p) and line["product_id"] == p["id"]
    assert (line["problem"], line["price_changed_from_kobo"]) == (None, None)
    assert line["available_quantity"] == 3
    assert body["subtotal_kobo"] == 2_000_000 and body["item_count"] == 2


def test_lines_carry_the_cover_photo_so_the_cart_can_show_it(shop, client):
    p = stock(client)
    client.post("/cart/items", json={"variant_id": vid(p), "quantity": 1})
    assert client.get("/cart").json()["lines"][0]["image_url"] is None   # no photo uploaded in this test


# --- rules, with the error shapes the UI uses ---

def test_asking_for_more_than_is_in_stock_is_a_409_that_says_how_many_are_left(shop, client):
    p = stock(client)
    res = client.post("/cart/items", json={"variant_id": vid(p), "quantity": 4})
    assert res.status_code == 409
    err = res.json()["error"]
    assert err["code"] == "out_of_stock" and "3" in err["message"]
    assert err["details"] == {"allowed": 3, "in_cart": 0}
    assert client.get("/cart").json()["lines"] == []


def test_the_owners_per_order_limit_is_a_409_with_its_own_code(shop, client):
    p = stock(client, max_per_order=1)
    client.post("/cart/items", json={"variant_id": vid(p, "S"), "quantity": 1})
    res = client.post("/cart/items", json={"variant_id": vid(p, "M"), "quantity": 1})
    assert res.status_code == 409
    assert res.json()["error"]["code"] == "limit_exceeded"
    assert "per order" in res.json()["error"]["message"]


def test_bad_requests_are_422_or_404(shop, client):
    p = stock(client)
    assert client.post("/cart/items", json={"variant_id": vid(p), "quantity": 0}).status_code == 422
    assert client.post("/cart/items", json={"variant_id": vid(p), "quantity": 1000}).status_code == 422
    assert client.post("/cart/items", json={"variant_id": "not-a-uuid", "quantity": 1}).status_code == 422
    assert client.post("/cart/items", json={"variant_id": "00000000-0000-0000-0000-000000000000", "quantity": 1}).status_code == 404


def test_hidden_pieces_cannot_be_added(shop, client):
    p = stock(client, is_active=False)
    assert client.post("/cart/items", json={"variant_id": vid(p), "quantity": 1}).status_code == 404


# --- changing it ---

def test_change_quantity_remove_and_clear(shop, client):
    p = stock(client)
    client.post("/cart/items", json={"variant_id": vid(p, "S"), "quantity": 1})
    client.post("/cart/items", json={"variant_id": vid(p, "M"), "quantity": 1})

    changed = client.patch(f"/cart/items/{vid(p, 'S')}", json={"quantity": 3}).json()
    assert {l["size"]: l["quantity"] for l in changed["lines"]} == {"S": 3, "M": 1}
    assert client.patch(f"/cart/items/{vid(p, 'S')}", json={"quantity": 4}).status_code == 409

    removed = client.delete(f"/cart/items/{vid(p, 'S')}").json()
    assert [l["size"] for l in removed["lines"]] == ["M"]
    assert client.delete(f"/cart/items/{vid(p, 'S')}").status_code == 404

    assert client.delete("/cart").json()["lines"] == []


def test_each_shopper_sees_only_their_own_cart(shop, client):
    p = stock(client)
    client.post("/cart/items", json={"variant_id": vid(p), "quantity": 1})
    shop.state.switch_user("bola")
    assert client.get("/cart").json()["lines"] == []
    assert client.delete(f"/cart/items/{vid(p)}").status_code == 404   # cannot touch Ada's line
    shop.state.switch_user("ada")
    assert len(client.get("/cart").json()["lines"]) == 1


# --- things that change while an item sits in the cart ---

def test_a_sale_that_starts_is_shown_with_the_old_price(shop, client):
    from datetime import datetime, timedelta, timezone

    p = stock(client)
    client.post("/cart/items", json={"variant_id": vid(p), "quantity": 1})
    now = datetime.now(timezone.utc)
    client.post("/admin/discounts", json={"name": "Flash", "kind": "percent", "percent": 10, "applies_to_all": True,
        "starts_at": (now - timedelta(hours=1)).isoformat(), "ends_at": (now + timedelta(hours=1)).isoformat()})
    body = client.get("/cart").json()
    line = body["lines"][0]
    assert (line["unit_price_kobo"], line["price_changed_from_kobo"], line["discount_name"]) == (900_000, 1_000_000, "Flash")
    assert body["savings_kobo"] == 100_000


def test_a_piece_hidden_after_adding_shows_as_a_problem_and_is_not_charged_for(shop, client):
    p = stock(client)
    client.post("/cart/items", json={"variant_id": vid(p), "quantity": 1})
    client.patch(f"/products/{p['id']}", json={"is_active": False})
    body = client.get("/cart").json()
    assert body["lines"][0]["problem"] == "unavailable"
    assert body["has_problems"] is True and body["subtotal_kobo"] == 0
    assert body["lines"][0]["problem_message"]


def test_reduced_stock_is_reported_with_how_many_can_be_kept(shop, client):
    p = stock(client)
    client.post("/cart/items", json={"variant_id": vid(p), "quantity": 3})
    client.put(f"/products/{p['id']}/variants", json=[{"size": "S", "stock": 1}, {"size": "M", "stock": 5}])
    line = client.get("/cart").json()["lines"][0]
    assert (line["problem"], line["available_quantity"]) == ("reduced", 1)
    assert "1" in line["problem_message"]


# --- the limit is an owner setting ---

def test_the_owner_can_set_and_clear_the_limit_when_saving_a_piece(shop, client):
    p = stock(client)
    saved = client.put(f"/products/{p['id']}", json={**PRODUCT, "max_per_order": 2}).json()
    assert saved["max_per_order"] == 2
    cleared = client.put(f"/products/{p['id']}", json=PRODUCT).json()
    assert cleared["max_per_order"] is None


def test_the_limit_must_be_a_sensible_number(shop, client):
    assert client.post("/products", json={**PRODUCT, "max_per_order": 0}).status_code == 422
    assert client.post("/products", json={**PRODUCT, "max_per_order": 101}).status_code == 422
