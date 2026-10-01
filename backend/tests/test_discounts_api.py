from datetime import datetime, timedelta, timezone

import pytest
from sqlalchemy import create_engine
from sqlalchemy.pool import StaticPool

from app.core.security import require_owner
from app.db.base import Base
from app.db.session import get_session, make_session_factory

HOUR = timedelta(hours=1)
PRODUCT = {"name": "Dress", "price_kobo": 1_500_000, "variants": [{"size": "S", "stock": 2}]}


def iso(dt):
    return dt.isoformat().replace("+00:00", "Z")


def when(hours):
    return iso(datetime.now(timezone.utc) + hours * HOUR)


def body(**over):
    return {
        "name": "Weekend sale", "kind": "percent", "percent": 10, "applies_to_all": True,
        "starts_at": when(-1), "ends_at": when(1), **over,
    }


@pytest.fixture
def owner_app(app):
    engine = create_engine("sqlite://", poolclass=StaticPool, connect_args={"check_same_thread": False})
    Base.metadata.create_all(engine)

    def override_session():
        with make_session_factory(engine)() as s:
            yield s

    app.dependency_overrides[get_session] = override_session
    app.dependency_overrides[require_owner] = lambda: None
    return app


def piece(client, **over):
    return client.post("/products", json={**PRODUCT, **over}).json()


# --- who may manage discounts ---

def test_discount_endpoints_are_owner_only(app, client):
    app.dependency_overrides.pop(require_owner, None)
    fake = "00000000-0000-0000-0000-000000000000"
    assert client.get("/admin/discounts").status_code == 401
    assert client.post("/admin/discounts", json=body()).status_code == 401
    assert client.put(f"/admin/discounts/{fake}", json=body()).status_code == 401
    assert client.delete(f"/admin/discounts/{fake}").status_code == 401


# --- managing them ---

def test_owner_creates_lists_reads_updates_and_deletes_a_discount(owner_app, client):
    created = client.post("/admin/discounts", json=body())
    assert created.status_code == 201
    d = created.json()
    assert d["percent"] == 10 and d["amount_kobo"] is None and d["status"] == "live"
    assert d["applies_to_all"] is True and d["product_ids"] == []

    assert [x["id"] for x in client.get("/admin/discounts").json()] == [d["id"]]
    assert client.get(f"/admin/discounts/{d['id']}").json()["name"] == "Weekend sale"

    updated = client.put(f"/admin/discounts/{d['id']}", json=body(name="Renamed", percent=12.5))
    assert updated.json()["name"] == "Renamed" and updated.json()["percent"] == 12.5

    assert client.delete(f"/admin/discounts/{d['id']}").status_code == 204
    assert client.get("/admin/discounts").json() == []


def test_status_reflects_the_schedule(owner_app, client):
    scheduled = client.post("/admin/discounts", json=body(starts_at=when(1), ends_at=when(2))).json()
    ended = client.post("/admin/discounts", json=body(starts_at=when(-3), ends_at=when(-1))).json()
    disabled = client.post("/admin/discounts", json=body(is_enabled=False)).json()
    assert (scheduled["status"], ended["status"], disabled["status"]) == ("scheduled", "ended", "disabled")


def test_a_fixed_amount_discount_for_selected_pieces(owner_app, client):
    pid = piece(client)["id"]
    d = client.post("/admin/discounts", json=body(kind="amount", percent=None, amount_kobo=200_000, applies_to_all=False, product_ids=[pid])).json()
    assert d["amount_kobo"] == 200_000 and d["percent"] is None and d["product_ids"] == [pid]


def test_bad_discounts_are_a_422_with_a_message(owner_app, client):
    cases = {
        "end before start": body(starts_at=when(2), ends_at=when(1)),
        "no time zone": body(starts_at="2026-10-01T12:00:00"),
        "100 percent": body(percent=100),
        "too many decimals": body(percent=10.001),
        "amount with percent kind": body(amount_kobo=500),
        "no pieces selected": body(applies_to_all=False, product_ids=[]),
        "blank name": body(name="  "),
    }
    for label, payload in cases.items():
        res = client.post("/admin/discounts", json=payload)
        assert res.status_code == 422, label
        assert res.json()["error"]["code"] == "validation_error", label


def test_an_unknown_piece_is_a_400_and_nothing_is_saved(owner_app, client):
    res = client.post("/admin/discounts", json=body(applies_to_all=False, product_ids=["00000000-0000-0000-0000-000000000000"]))
    assert res.status_code == 400
    assert client.get("/admin/discounts").json() == []


def test_unknown_discounts_are_a_404(owner_app, client):
    fake = "00000000-0000-0000-0000-000000000000"
    assert client.get(f"/admin/discounts/{fake}").status_code == 404
    assert client.put(f"/admin/discounts/{fake}", json=body()).status_code == 404
    assert client.delete(f"/admin/discounts/{fake}").status_code == 404


def test_times_with_an_offset_are_stored_and_returned_in_utc(owner_app, client):
    d = client.post("/admin/discounts", json=body(starts_at="2030-01-01T13:00:00+01:00", ends_at="2030-01-02T13:00:00+01:00")).json()
    assert d["starts_at"].startswith("2030-01-01T12:00:00")


# --- what customers see ---

def test_a_live_discount_shows_on_the_public_listing_and_product_page(owner_app, client):
    pid = piece(client)["id"]
    client.post("/admin/discounts", json=body())
    for out in (client.get("/products").json()[0], client.get(f"/products/{pid}").json()):
        assert out["price_kobo"] == 1_500_000          # the original, to be struck through
        assert out["sale_price_kobo"] == 1_350_000
        assert out["discount"]["name"] == "Weekend sale"
        assert out["discount"]["ends_at"]
        assert out["variants"][0]["sale_price_kobo"] == 1_350_000


def test_a_scheduled_discount_is_invisible_until_it_starts(owner_app, client):
    piece(client)
    client.post("/admin/discounts", json=body(starts_at=when(1), ends_at=when(2)))
    out = client.get("/products").json()[0]
    assert out["sale_price_kobo"] is None and out["discount"] is None


def test_ended_and_disabled_discounts_do_not_apply(owner_app, client):
    piece(client)
    client.post("/admin/discounts", json=body(starts_at=when(-3), ends_at=when(-1)))
    client.post("/admin/discounts", json=body(is_enabled=False))
    assert client.get("/products").json()[0]["sale_price_kobo"] is None


def test_deleting_a_discount_removes_the_sale_immediately(owner_app, client):
    piece(client)
    d = client.post("/admin/discounts", json=body()).json()
    assert client.get("/products").json()[0]["sale_price_kobo"] is not None
    client.delete(f"/admin/discounts/{d['id']}")
    assert client.get("/products").json()[0]["sale_price_kobo"] is None


def test_a_discount_for_selected_pieces_leaves_the_others_alone(owner_app, client):
    mine = piece(client, name="Mine")["id"]
    piece(client, name="Other")
    client.post("/admin/discounts", json=body(applies_to_all=False, product_ids=[mine]))
    sales = {p["name"]: p["sale_price_kobo"] for p in client.get("/products").json()}
    assert sales == {"Mine": 1_350_000, "Other": None}


def test_the_best_discount_wins_and_they_do_not_stack(owner_app, client):
    piece(client)
    client.post("/admin/discounts", json=body(name="Ten percent"))
    client.post("/admin/discounts", json=body(name="N5,000 off", kind="amount", percent=None, amount_kobo=500_000))
    out = client.get("/products").json()[0]
    assert out["sale_price_kobo"] == 1_000_000          # 5,000 off beats 10% (1,500) and nothing is stacked
    assert out["discount"]["name"] == "N5,000 off"


def test_per_size_pieces_are_discounted_size_by_size(owner_app, client):
    client.post("/products", json={
        "name": "Gown", "pricing_mode": "per_size",
        "variants": [{"size": "S", "stock": 1, "price_kobo": 2_000_000}, {"size": "M", "stock": 1, "price_kobo": 1_000_000}],
    })
    client.post("/admin/discounts", json=body())
    out = client.get("/products").json()[0]
    assert {v["size"]: (v["price_kobo"], v["sale_price_kobo"]) for v in out["variants"]} == {
        "S": (2_000_000, 1_800_000), "M": (1_000_000, 900_000)
    }
    assert out["price_kobo"] == 1_000_000 and out["sale_price_kobo"] == 900_000


def test_the_owner_sees_the_same_prices_in_the_admin_listing(owner_app, client):
    piece(client)
    client.post("/admin/discounts", json=body())
    assert client.get("/admin/products").json()[0]["sale_price_kobo"] == 1_350_000
