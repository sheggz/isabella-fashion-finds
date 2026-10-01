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
