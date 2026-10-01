"""Rules about product photos. Pure: no network, no database, no clock.

The key safety idea: never believe what the client says about a file (its name or its
Content-Type header). We look at the bytes, and we choose the storage path ourselves.
"""
import uuid

MAX_IMAGE_BYTES = 5 * 1024 * 1024
MAX_IMAGES_PER_PRODUCT = 8

# content type -> file extension. Only these formats are accepted.
ALLOWED_TYPES = {"image/jpeg": "jpg", "image/png": "png", "image/webp": "webp"}


def detect_image_type(data: bytes) -> str | None:
    """Return the real content type from the file's leading bytes ("magic numbers"), or None.

    A file called `cat.png` whose bytes are actually an HTML page returns None, so it never
    gets stored where a browser might run it.
    """
    if data[:3] == b"\xff\xd8\xff":
        return "image/jpeg"
    if data[:8] == b"\x89PNG\r\n\x1a\n":
        return "image/png"
    # WebP is a RIFF container; the format tag sits after the 4-byte size field. Other RIFF
    # files (WAV, AVI) share the "RIFF" start, so the tag must be checked too.
    if data[:4] == b"RIFF" and data[8:12] == b"WEBP":
        return "image/webp"
    return None


def object_path(product_id: uuid.UUID, image_id: uuid.UUID, content_type: str) -> str:
    """Where the file lives in the bucket. Built only from ids we generated, never from a
    client-supplied filename, so nothing a user types can influence the path."""
    return f"products/{product_id}/{image_id}.{ALLOWED_TYPES[content_type]}"


def public_url(base_url: str, bucket: str, path: str) -> str:
    return f"{base_url.rstrip('/')}/storage/v1/object/public/{bucket}/{path}"


def plan_reorder(existing_ids: list, desired_ids: list) -> list:
    """Return `desired_ids` if it is exactly a re-ordering of `existing_ids`, else ValueError.

    Guards against a client dropping, duplicating or inventing photo ids.
    """
    if len(desired_ids) != len(existing_ids) or set(desired_ids) != set(existing_ids):
        raise ValueError("image_ids must list every existing photo exactly once")
    return list(desired_ids)
