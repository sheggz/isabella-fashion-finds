import pytest
from sqlalchemy import create_engine
from sqlalchemy.pool import StaticPool

from app.core.security import require_owner
from app.db.base import Base
from app.db.session import get_session, make_session_factory

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
        with make_session_factory(engine)() as s:
            yield s

    app.dependency_overrides[get_session] = override_session
    return app


@pytest.fixture
def as_owner(db_app):
    db_app.dependency_overrides[require_owner] = lambda: None
    return db_app


def no_ids(variants):
    """Size ids are random; compare everything else."""
    return [{k: v for k, v in variant.items() if k != "id"} for variant in variants]


def test_options_endpoint_publishes_the_fixed_sizes_and_body_parts(db_app, client):
    res = client.get("/catalogue/options")
    assert res.status_code == 200
    body = res.json()
    assert [s["value"] for s in body["sizes"]][:3] == ["XS", "S", "M"]
    assert "bust" in [p["value"] for p in body["measurement_parts"]]
    assert body["unit"] == "cm"


def test_measurements_round_trip_through_the_api(as_owner, client):
    body = {**BODY, "variants": [{"size": "m", "stock": 3, "measurements": {"bust": 92, "hips": 100.5}}]}
    created = client.post("/products", json=body)
    assert created.status_code == 201
    variant = no_ids(created.json()["variants"])[0]
    assert variant == {"size": "M", "stock": 3, "measurements": {"bust": 92.0, "hips": 100.5}, "price_kobo": 1_500_000, "sale_price_kobo": None}


def test_invalid_measurements_are_a_422_naming_the_problem(as_owner, client):
    body = {**BODY, "variants": [{"size": "M", "stock": 1, "measurements": {"earlobe": 3}}]}
    res = client.post("/products", json=body)
    assert res.status_code == 422
    assert res.json()["error"]["code"] == "validation_error"
    assert "earlobe" in res.text


def test_a_size_outside_the_list_is_a_422(as_owner, client):
    body = {**BODY, "variants": [{"size": "XXXL", "stock": 1}]}
    assert client.post("/products", json=body).status_code == 422


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
    assert no_ids(detail.json()["variants"]) == [{"size": "S", "stock": 2, "measurements": {}, "price_kobo": 1_500_000, "sale_price_kobo": None}]


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
    assert no_ids(variants.json()["variants"]) == [{"size": "L", "stock": 4, "measurements": {}, "price_kobo": 2_000_000, "sale_price_kobo": None}]

    assert client.delete(f"/products/{pid}").status_code == 204
    assert client.get(f"/products/{pid}").status_code == 404


def test_update_and_delete_are_also_guarded(db_app, client):
    fake = "00000000-0000-0000-0000-000000000000"
    assert client.patch(f"/products/{fake}", json={"name": "x"}).status_code == 401
    assert client.put(f"/products/{fake}/variants", json=[]).status_code == 401
    assert client.delete(f"/products/{fake}").status_code == 401


# --- pricing in the API ---

PER_SIZE = {
    "name": "Ankara Dress",
    "pricing_mode": "per_size",
    "variants": [
        {"size": "S", "stock": 2, "price_kobo": 1_500_000},
        {"size": "M", "stock": 1, "price_kobo": 1_200_000},
    ],
}


def test_a_one_price_piece_reports_that_price_for_every_size(as_owner, client):
    body = client.post("/products", json=BODY).json()
    assert body["pricing_mode"] == "single"
    assert body["price_kobo"] == 1_500_000 and body["price_varies"] is False
    assert all(v["price_kobo"] == 1_500_000 for v in body["variants"])


def test_a_per_size_piece_reports_a_from_price_and_each_size_price(as_owner, client):
    res = client.post("/products", json=PER_SIZE)
    assert res.status_code == 201
    body = res.json()
    assert body["pricing_mode"] == "per_size"
    assert body["price_kobo"] == 1_200_000  # the "from" price: the cheapest size
    assert body["price_varies"] is True
    assert {v["size"]: v["price_kobo"] for v in body["variants"]} == {"S": 1_500_000, "M": 1_200_000}


def test_a_per_size_piece_with_equal_prices_does_not_claim_a_range(as_owner, client):
    same = {**PER_SIZE, "variants": [{"size": "S", "stock": 1, "price_kobo": 1000}, {"size": "M", "stock": 1, "price_kobo": 1000}]}
    assert client.post("/products", json=same).json()["price_varies"] is False


def test_inconsistent_prices_are_a_422_with_a_helpful_message(as_owner, client):
    bad = {**PER_SIZE, "variants": [{"size": "S", "stock": 1}]}
    res = client.post("/products", json=bad)
    assert res.status_code == 422
    assert "every size needs a price" in res.text


def test_owner_replaces_the_whole_piece_in_one_request(as_owner, client):
    pid = client.post("/products", json=BODY).json()["id"]
    res = client.put(f"/products/{pid}", json=PER_SIZE)
    assert res.status_code == 200
    body = res.json()
    assert body["name"] == "Ankara Dress" and body["pricing_mode"] == "per_size"
    assert body["description"] is None  # a full replace: omitted optional fields are cleared
    assert client.get(f"/products/{pid}").json()["price_kobo"] == 1_200_000


def test_replacing_with_invalid_data_changes_nothing(as_owner, client):
    pid = client.post("/products", json=BODY).json()["id"]
    assert client.put(f"/products/{pid}", json={**PER_SIZE, "variants": []}).status_code == 422
    assert client.get(f"/products/{pid}").json()["pricing_mode"] == "single"


def test_whole_piece_replace_is_owner_only_and_404s_for_unknown_pieces(db_app, client):
    fake = "00000000-0000-0000-0000-000000000000"
    assert client.put(f"/products/{fake}", json=PER_SIZE).status_code == 401
    db_app.dependency_overrides[require_owner] = lambda: None
    assert client.put(f"/products/{fake}", json=PER_SIZE).status_code == 404


def test_patching_the_price_of_a_per_size_piece_is_a_400(as_owner, client):
    pid = client.post("/products", json=PER_SIZE).json()["id"]
    res = client.patch(f"/products/{pid}", json={"price_kobo": 5000})
    assert res.status_code == 400
    assert res.json()["error"]["code"] == "bad_request"


def test_replacing_sizes_without_prices_on_a_per_size_piece_is_a_400(as_owner, client):
    pid = client.post("/products", json=PER_SIZE).json()["id"]
    assert client.put(f"/products/{pid}/variants", json=[{"size": "L", "stock": 1}]).status_code == 400
