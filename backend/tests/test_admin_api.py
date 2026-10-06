import pytest
from sqlalchemy import create_engine
from sqlalchemy.pool import StaticPool

from app.core.security import require_owner
from app.db.base import Base
from app.db.session import get_session, make_session_factory

PRODUCT = {"name": "Dress", "price_kobo": 1000, "variants": [{"size": "S", "stock": 1}]}
HIDDEN = {**PRODUCT, "name": "Hidden piece", "is_active": False}


@pytest.fixture
def owner_app(app):
    engine = create_engine(
        "sqlite://", poolclass=StaticPool, connect_args={"check_same_thread": False}
    )
    Base.metadata.create_all(engine)

    def override_session():
        with make_session_factory(engine)() as s:
            yield s

    app.dependency_overrides[get_session] = override_session
    app.dependency_overrides[require_owner] = lambda: None
    return app


def test_owner_listing_includes_hidden_pieces_but_the_public_one_does_not(owner_app, client):
    client.post("/products", json=PRODUCT)
    client.post("/products", json=HIDDEN)

    assert {p["name"] for p in client.get("/admin/products").json()} == {"Dress", "Hidden piece"}
    assert [p["name"] for p in client.get("/products").json()] == ["Dress"]


def test_owner_can_open_a_hidden_piece_and_the_public_cannot(owner_app, client):
    hidden_id = client.post("/products", json=HIDDEN).json()["id"]
    assert client.get(f"/admin/products/{hidden_id}").status_code == 200
    assert client.get(f"/products/{hidden_id}").status_code == 404


def test_unknown_piece_is_a_standard_404(owner_app, client):
    res = client.get("/admin/products/00000000-0000-0000-0000-000000000000")
    assert res.status_code == 404
    assert res.json()["error"]["code"] == "not_found"


def test_admin_endpoints_are_owner_only(app, client):
    app.dependency_overrides.pop(require_owner, None)
    assert client.get("/admin/products").status_code == 401
    assert client.get("/admin/products/00000000-0000-0000-0000-000000000000").status_code == 401


def test_options_also_publish_the_photo_rules(app, client):
    images = client.get("/catalogue/options").json()["images"]
    assert images["max_bytes"] == 5 * 1024 * 1024
    assert images["max_per_product"] == 8
    assert images["types"] == ["image/jpeg", "image/png", "image/webp"]


def test_options_also_publish_the_cart_ceiling(app, client):
    assert client.get("/catalogue/options").json()["cart"] == {"max_per_line": 10}


def _paid_order(app, user_id, total, lines):
    from datetime import datetime, timezone

    from app.db.session import get_session
    from app.models.order import Order, OrderItem

    session_gen = app.dependency_overrides[get_session]()
    s = next(session_gen)
    now = datetime.now(timezone.utc)
    order = Order(user_id=user_id, status="paid", subtotal_kobo=total, total_kobo=total, created_at=now, paid_at=now)
    order.items = [
        OrderItem(product_name=n, size="M", unit_price_kobo=t // q, base_price_kobo=t // q, quantity=q, line_total_kobo=t)
        for n, q, t in lines
    ]
    s.add(order)
    s.commit()
    s.close()


def _a_user(app):
    from app.db.session import get_session
    from app.models.user import User

    s = next(app.dependency_overrides[get_session]())
    u = User(google_sub="s1", email="a@example.test", name="Ada")
    s.add(u)
    s.commit()
    uid = u.id
    s.close()
    return uid


def test_dashboard_reports_stock_and_sales(owner_app, client):
    client.post("/products", json={"name": "Dress", "price_kobo": 1000, "variants": [{"size": "S", "stock": 2}, {"size": "M", "stock": 9}]})
    client.post("/products", json={"name": "Gone", "price_kobo": 1000, "variants": [{"size": "S", "stock": 0}]})
    _paid_order(owner_app, _a_user(owner_app), 5000, [("Dress", 2, 5000)])

    body = client.get("/admin/dashboard?days=7").json()

    assert body["stock"]["units_in_stock"] == 11
    assert [(r["name"], r["size"]) for r in body["stock"]["low_stock"]] == [("Dress", "S")]
    assert [r["name"] for r in body["stock"]["sold_out"]] == ["Gone"]
    assert body["stock"]["low_stock_threshold"] == 3
    assert body["sales"]["revenue_kobo"] == 5000 and body["sales"]["orders"] == 1
    assert len(body["sales"]["by_day"]) == 7
    assert body["sales"]["top_products"][0]["name"] == "Dress"


def test_dashboard_ignores_unpaid_orders(owner_app, client):
    from app.db.session import get_session
    from app.models.order import Order

    s = next(owner_app.dependency_overrides[get_session]())
    s.add(Order(user_id=_a_user(owner_app), status="pending", subtotal_kobo=900, total_kobo=900))
    s.commit()
    assert client.get("/admin/dashboard").json()["sales"]["revenue_kobo"] == 0


def test_dashboard_rejects_silly_parameters(owner_app, client):
    assert client.get("/admin/dashboard?days=0").status_code == 422
    assert client.get("/admin/dashboard?days=500").status_code == 422


def test_dashboard_is_owner_only(app, client):
    # no override of require_owner: an anonymous caller must be refused
    assert client.get("/admin/dashboard").status_code in (401, 403)
