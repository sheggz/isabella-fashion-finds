import uuid

import pytest

from app.domain.images import (
    MAX_IMAGE_BYTES,
    MAX_IMAGES_PER_PRODUCT,
    detect_image_type,
    object_path,
    plan_reorder,
    public_url,
)

JPEG = b"\xff\xd8\xff\xe0" + b"\x00" * 20
PNG = b"\x89PNG\r\n\x1a\n" + b"\x00" * 20
WEBP = b"RIFF\x24\x00\x00\x00WEBPVP8 " + b"\x00" * 20


def test_limits_are_the_agreed_ones():
    assert MAX_IMAGE_BYTES == 5 * 1024 * 1024
    assert MAX_IMAGES_PER_PRODUCT == 8


@pytest.mark.parametrize(
    ("data", "expected"),
    [(JPEG, "image/jpeg"), (PNG, "image/png"), (WEBP, "image/webp")],
)
def test_image_type_is_detected_from_the_bytes_themselves(data, expected):
    assert detect_image_type(data) == expected


@pytest.mark.parametrize(
    "data",
    [b"", b"GIF89a....", b"<script>alert(1)</script>", b"%PDF-1.7", b"RIFF\x00\x00\x00\x00WAVEfmt "],
)
def test_anything_that_is_not_a_supported_image_is_not_detected(data):
    assert detect_image_type(data) is None


def test_object_path_is_server_chosen_and_never_uses_a_filename():
    pid, iid = uuid.uuid4(), uuid.uuid4()
    assert object_path(pid, iid, "image/png") == f"products/{pid}/{iid}.png"
    assert object_path(pid, iid, "image/jpeg").endswith(".jpg")
    assert object_path(pid, iid, "image/webp").endswith(".webp")


def test_public_url_joins_the_pieces_without_double_slashes():
    assert (
        public_url("https://x.supabase.co/", "product-images", "products/a/b.jpg")
        == "https://x.supabase.co/storage/v1/object/public/product-images/products/a/b.jpg"
    )


def test_plan_reorder_returns_the_requested_order():
    assert plan_reorder(["a", "b", "c"], ["c", "a", "b"]) == ["c", "a", "b"]


@pytest.mark.parametrize(
    "desired",
    [["a", "b"], ["a", "b", "c", "d"], ["a", "a", "b"], ["a", "b", "x"], []],
)
def test_plan_reorder_requires_exactly_the_existing_images(desired):
    with pytest.raises(ValueError):
        plan_reorder(["a", "b", "c"], desired)
