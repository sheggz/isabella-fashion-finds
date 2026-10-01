import logging
import uuid

import pytest
from sqlalchemy import create_engine, select
from sqlalchemy.pool import StaticPool

from app.core.errors import (
    BadRequest,
    Conflict,
    NotFound,
    PayloadTooLarge,
    UnsupportedMediaType,
)
from app.db.base import Base
from app.db.session import make_session_factory
from app.domain.images import MAX_IMAGE_BYTES, MAX_IMAGES_PER_PRODUCT
from app.models.product import ProductImage
from app.schemas.product import ProductCreate
from app.services import catalogue, images

PNG = b"\x89PNG\r\n\x1a\n" + b"\x00" * 50
JPEG = b"\xff\xd8\xff\xe0" + b"\x00" * 50


@pytest.fixture
def session():
    engine = create_engine(
        "sqlite://", poolclass=StaticPool, connect_args={"check_same_thread": False}
    )
    Base.metadata.create_all(engine)
    with make_session_factory(engine)() as s:
        yield s


@pytest.fixture
def product(session):
    return catalogue.create_product(
        session,
        ProductCreate(name="Dress", price_kobo=1000, variants=[{"size": "S", "stock": 1}]),
    )


def test_add_image_uploads_the_object_and_records_it(session, fake_storage, product):
    image = images.add_image(session, fake_storage, product.id, PNG)
    assert image.path.startswith(f"products/{product.id}/") and image.path.endswith(".png")
    assert fake_storage.objects[image.path] == (PNG, "image/png")
    assert image.position == 0


def test_a_new_photo_is_visible_on_the_product_straight_away(session, fake_storage, product):
    # Regression: with production session settings the product's already-loaded `images` list
    # went stale after an upload, so the API answered with the product MINUS the new photo.
    image = images.add_image(session, fake_storage, product.id, PNG)
    reloaded = catalogue.get_product(session, product.id)
    assert [i.id for i in reloaded.images] == [image.id]


def test_positions_increase_with_each_upload(session, fake_storage, product):
    first = images.add_image(session, fake_storage, product.id, PNG)
    second = images.add_image(session, fake_storage, product.id, JPEG)
    assert (first.position, second.position) == (0, 1)


def test_the_type_is_taken_from_the_bytes_not_from_the_client(session, fake_storage, product):
    with pytest.raises(UnsupportedMediaType):
        images.add_image(session, fake_storage, product.id, b"<script>alert(1)</script>")
    assert fake_storage.objects == {}


def test_empty_upload_is_rejected(session, fake_storage, product):
    with pytest.raises(UnsupportedMediaType):
        images.add_image(session, fake_storage, product.id, b"")


def test_oversized_upload_is_rejected_before_touching_storage(session, fake_storage, product):
    with pytest.raises(PayloadTooLarge):
        images.add_image(session, fake_storage, product.id, PNG + b"\x00" * MAX_IMAGE_BYTES)
    assert fake_storage.objects == {}


def test_a_product_cannot_exceed_the_photo_limit(session, fake_storage, product):
    for _ in range(MAX_IMAGES_PER_PRODUCT):
        images.add_image(session, fake_storage, product.id, PNG)
    with pytest.raises(Conflict):
        images.add_image(session, fake_storage, product.id, PNG)


def test_uploading_to_a_missing_product_is_not_found(session, fake_storage):
    with pytest.raises(NotFound):
        images.add_image(session, fake_storage, uuid.uuid4(), PNG)


def test_if_the_database_write_fails_the_uploaded_object_is_removed(
    session, fake_storage, product, monkeypatch
):
    def boom():
        raise RuntimeError("database down")

    monkeypatch.setattr(session, "commit", boom)
    with pytest.raises(RuntimeError):
        images.add_image(session, fake_storage, product.id, PNG)
    assert fake_storage.objects == {}  # no orphan left behind


def test_a_storage_outage_is_reported_and_nothing_is_recorded(session, fake_storage, product):
    fake_storage.fail_upload = True
    with pytest.raises(Exception, match="unavailable"):
        images.add_image(session, fake_storage, product.id, PNG)
    assert session.scalars(select(ProductImage)).all() == []


def test_delete_image_removes_the_row_and_the_object(session, fake_storage, product):
    image = images.add_image(session, fake_storage, product.id, PNG)
    images.delete_image(session, fake_storage, product.id, image.id)
    assert session.scalars(select(ProductImage)).all() == []
    assert fake_storage.objects == {}


def test_delete_image_survives_a_storage_failure_and_logs_a_warning(
    session, fake_storage, product, caplog
):
    image = images.add_image(session, fake_storage, product.id, PNG)
    fake_storage.fail_delete = True
    with caplog.at_level(logging.WARNING):
        images.delete_image(session, fake_storage, product.id, image.id)
    assert session.scalars(select(ProductImage)).all() == []  # the user's intent still succeeded
    assert any(r.levelno == logging.WARNING for r in caplog.records)


def test_delete_unknown_image_is_not_found(session, fake_storage, product):
    with pytest.raises(NotFound):
        images.delete_image(session, fake_storage, product.id, uuid.uuid4())


def test_reorder_changes_positions(session, fake_storage, product):
    a = images.add_image(session, fake_storage, product.id, PNG)
    b = images.add_image(session, fake_storage, product.id, JPEG)
    result = images.reorder_images(session, product.id, [b.id, a.id])
    assert [i.id for i in result.images] == [b.id, a.id]


def test_reorder_with_wrong_ids_is_a_bad_request(session, fake_storage, product):
    a = images.add_image(session, fake_storage, product.id, PNG)
    with pytest.raises(BadRequest):
        images.reorder_images(session, product.id, [a.id, uuid.uuid4()])


def test_deleting_a_product_also_removes_its_stored_photos(session, fake_storage, product):
    images.add_image(session, fake_storage, product.id, PNG)
    images.add_image(session, fake_storage, product.id, JPEG)
    catalogue.delete_product(session, product.id, storage=fake_storage)
    assert fake_storage.objects == {}


def test_deleting_a_product_still_works_if_storage_is_down(session, fake_storage, product, caplog):
    images.add_image(session, fake_storage, product.id, PNG)
    fake_storage.fail_delete = True
    with caplog.at_level(logging.WARNING):
        catalogue.delete_product(session, product.id, storage=fake_storage)
    with pytest.raises(NotFound):
        catalogue.get_product(session, product.id, include_inactive=True)
    assert any(r.levelno == logging.WARNING for r in caplog.records)
