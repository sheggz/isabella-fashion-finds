import pytest
from sqlalchemy import create_engine
from sqlalchemy.pool import StaticPool

from app.core.config import get_settings
from app.core.security import require_owner
from app.db.base import Base
from app.db.session import get_session, make_session_factory
from app.domain.images import MAX_IMAGE_BYTES
from app.routers.deps import get_storage

PNG = b"\x89PNG\r\n\x1a\n" + b"\x00" * 50
JPEG = b"\xff\xd8\xff\xe0" + b"\x00" * 50
PRODUCT = {"name": "Dress", "price_kobo": 1000, "variants": [{"size": "S", "stock": 1}]}


@pytest.fixture
def owner_app(app, fake_storage):
    engine = create_engine(
        "sqlite://", poolclass=StaticPool, connect_args={"check_same_thread": False}
    )
    Base.metadata.create_all(engine)

    def override_session():
        with make_session_factory(engine)() as s:
            yield s

    app.dependency_overrides[get_session] = override_session
    app.dependency_overrides[get_storage] = lambda: fake_storage
    app.dependency_overrides[require_owner] = lambda: None
    return app


@pytest.fixture
def product_id(owner_app, client):
    return client.post("/products", json=PRODUCT).json()["id"]


def upload(client, pid, data=PNG, name="photo.png", ctype="image/png"):
    return client.post(f"/products/{pid}/images", files={"file": (name, data, ctype)})


def test_owner_uploads_a_photo_and_gets_the_updated_product(client, product_id, fake_storage):
    res = upload(client, product_id)
    assert res.status_code == 201
    images = res.json()["images"]
    assert len(images) == 1 and images[0]["position"] == 0
    settings = get_settings()
    assert images[0]["url"].startswith(f"{settings.supabase_url.rstrip('/')}/storage/v1/object/public/")
    assert images[0]["url"].endswith(".png")
    assert "path" not in images[0]  # internal storage path is not exposed
    assert len(fake_storage.objects) == 1


def test_the_public_can_see_the_photos_in_order(client, product_id):
    upload(client, product_id, PNG)
    upload(client, product_id, JPEG, "b.jpg", "image/jpeg")
    detail = client.get(f"/products/{product_id}").json()
    assert [i["position"] for i in detail["images"]] == [0, 1]
    assert detail["images"][0]["url"].endswith(".png") and detail["images"][1]["url"].endswith(".jpg")


def test_a_file_pretending_to_be_an_image_is_415(client, product_id, fake_storage):
    res = upload(client, product_id, b"<script>alert(1)</script>", "x.png", "image/png")
    assert res.status_code == 415
    assert res.json()["error"]["code"] == "unsupported_media_type"
    assert fake_storage.objects == {}


def test_an_oversized_file_is_413(client, product_id):
    res = upload(client, product_id, PNG + b"\x00" * MAX_IMAGE_BYTES)
    assert res.status_code == 413
    assert res.json()["error"]["code"] == "file_too_large"


def test_a_request_without_a_file_is_a_422(client, product_id):
    res = client.post(f"/products/{product_id}/images")
    assert res.status_code == 422
    assert res.json()["error"]["code"] == "validation_error"


def test_storage_outage_is_a_503_in_the_standard_shape(client, product_id, fake_storage):
    fake_storage.fail_upload = True
    res = upload(client, product_id)
    assert res.status_code == 503
    assert res.json()["error"]["code"] == "service_unavailable"


def test_owner_can_delete_a_photo(client, product_id, fake_storage):
    image_id = upload(client, product_id).json()["images"][0]["id"]
    res = client.delete(f"/products/{product_id}/images/{image_id}")
    assert res.status_code == 200
    assert res.json()["images"] == []
    assert fake_storage.objects == {}


def test_owner_can_reorder_photos_to_change_the_cover(client, product_id):
    upload(client, product_id, PNG)
    second = upload(client, product_id, JPEG, "b.jpg", "image/jpeg").json()["images"]
    ids = [i["id"] for i in second]
    res = client.put(f"/products/{product_id}/images/order", json={"image_ids": list(reversed(ids))})
    assert res.status_code == 200
    assert [i["id"] for i in res.json()["images"]] == list(reversed(ids))


def test_reordering_with_wrong_ids_is_a_400(client, product_id):
    upload(client, product_id)
    res = client.put(
        f"/products/{product_id}/images/order",
        json={"image_ids": ["00000000-0000-0000-0000-000000000000"]},
    )
    assert res.status_code == 400
    assert res.json()["error"]["code"] == "bad_request"


def test_deleting_the_product_removes_its_photos_from_storage(client, product_id, fake_storage):
    upload(client, product_id)
    assert client.delete(f"/products/{product_id}").status_code == 204
    assert fake_storage.objects == {}


def test_image_endpoints_are_owner_only(app, client):
    app.dependency_overrides.pop(require_owner, None)
    fake = "00000000-0000-0000-0000-000000000000"
    assert upload(client, fake).status_code == 401
    assert client.delete(f"/products/{fake}/images/{fake}").status_code == 401
    assert client.put(f"/products/{fake}/images/order", json={"image_ids": []}).status_code == 401
