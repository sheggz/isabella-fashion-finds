import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import Session
from sqlalchemy.pool import StaticPool

from app.core.security import require_owner
from app.db.base import Base
from app.db.session import get_session

BODY = {
    "name": "Ankara Dress",
    "description": "Hand-sewn",
    "price_kobo": 1_500_000,
    "variants": [{"size": "S", "stock": 2}],
}


@pytest.fixture
def db_app(app):
    engine = create_engine(
        "sqlite://", poolclass=StaticPool, connect_args={"check_same_thread": False}
    )
    Base.metadata.create_all(engine)

    def override_session():
        with Session(engine) as s:
            yield s

    app.dependency_overrides[get_session] = override_session
    return app


@pytest.fixture
def as_owner(db_app):
    db_app.dependency_overrides[require_owner] = lambda: None
    return db_app


def test_writes_are_rejected_by_default(db_app, client):
    # Secure by default: until real auth exists, nobody can write.
    res = client.post("/products", json=BODY)
    assert res.status_code == 401
    assert res.json()["error"]["code"] == "unauthorized"


def test_owner_can_create_and_public_can_read(as_owner, client):
    created = client.post("/products", json=BODY)
    assert created.status_code == 201
    pid = created.json()["id"]

    listing = client.get("/products")
    assert [p["name"] for p in listing.json()] == ["Ankara Dress"]

    detail = client.get(f"/products/{pid}")
    assert detail.status_code == 200
    assert detail.json()["description"] == "Hand-sewn"
    assert detail.json()["variants"] == [{"size": "S", "stock": 2}]


def test_missing_product_is_404_in_the_standard_shape(db_app, client):
    res = client.get("/products/00000000-0000-0000-0000-000000000000")
    assert res.status_code == 404
    assert res.json()["error"]["code"] == "not_found"


def test_bad_input_is_422_with_field_details(as_owner, client):
    res = client.post("/products", json={**BODY, "price_kobo": -1})
    assert res.status_code == 422
    assert res.json()["error"]["code"] == "validation_error"


def test_owner_can_update_replace_variants_and_delete(as_owner, client):
    pid = client.post("/products", json=BODY).json()["id"]

    patched = client.patch(f"/products/{pid}", json={"price_kobo": 2_000_000})
    assert patched.json()["price_kobo"] == 2_000_000

    variants = client.put(f"/products/{pid}/variants", json=[{"size": "L", "stock": 4}])
    assert variants.json()["variants"] == [{"size": "L", "stock": 4}]

    assert client.delete(f"/products/{pid}").status_code == 204
    assert client.get(f"/products/{pid}").status_code == 404


def test_update_and_delete_are_also_guarded(db_app, client):
    fake = "00000000-0000-0000-0000-000000000000"
    assert client.patch(f"/products/{fake}", json={"name": "x"}).status_code == 401
    assert client.put(f"/products/{fake}/variants", json=[]).status_code == 401
    assert client.delete(f"/products/{fake}").status_code == 401
