import httpx
import pytest

from app.core.errors import ServiceUnavailable
from app.integrations.storage import StorageClient, auth_headers

SECRET = "sb_secret_abcdefghijklmnopqrstuvwxyz0123456"
JWT_KEY = "eyJhbGciOiJIUzI1NiJ9.payload.signature"


def client_with(handler, key=SECRET):
    return StorageClient(
        base_url="https://proj.supabase.co/",
        secret_key=key,
        bucket="product-images",
        transport=httpx.MockTransport(handler),
    )


def test_new_style_secret_keys_go_in_the_apikey_header_only():
    assert auth_headers(SECRET) == {"apikey": SECRET}


def test_legacy_jwt_keys_are_also_sent_as_a_bearer_token():
    assert auth_headers(JWT_KEY) == {"apikey": JWT_KEY, "Authorization": f"Bearer {JWT_KEY}"}


def test_upload_posts_the_bytes_to_the_object_url_with_the_right_headers():
    seen = {}

    def handler(request):
        seen["method"], seen["url"] = request.method, str(request.url)
        seen["headers"], seen["body"] = request.headers, request.content
        return httpx.Response(200, json={"Key": "k"})

    client_with(handler).upload("products/p/i.png", b"PNGDATA", "image/png")
    assert seen["method"] == "POST"
    assert seen["url"] == "https://proj.supabase.co/storage/v1/object/product-images/products/p/i.png"
    assert seen["headers"]["apikey"] == SECRET
    assert "authorization" not in seen["headers"]
    assert seen["headers"]["content-type"] == "image/png"
    assert seen["body"] == b"PNGDATA"


@pytest.mark.parametrize("status", [400, 401, 403, 413, 500, 503])
def test_any_error_status_becomes_service_unavailable_without_leaking_the_key(status):
    def handler(request):
        return httpx.Response(status, json={"message": f"denied for {SECRET}"})

    with pytest.raises(ServiceUnavailable) as caught:
        client_with(handler).upload("p.png", b"x", "image/png")
    assert SECRET not in caught.value.message
    assert SECRET not in str(caught.value.details)


def test_network_failure_becomes_service_unavailable():
    def handler(request):
        raise httpx.ConnectError(f"boom {SECRET}")

    with pytest.raises(ServiceUnavailable) as caught:
        client_with(handler).upload("p.png", b"x", "image/png")
    assert SECRET not in caught.value.message


def test_delete_sends_all_paths_in_one_request():
    seen = {}

    def handler(request):
        seen["method"], seen["url"] = request.method, str(request.url)
        seen["json"] = request.read()
        return httpx.Response(200, json=[])

    client_with(handler).delete(["a/1.png", "a/2.png"])
    assert seen["method"] == "DELETE"
    assert seen["url"] == "https://proj.supabase.co/storage/v1/object/product-images"
    assert b'"prefixes"' in seen["json"] and b"a/1.png" in seen["json"] and b"a/2.png" in seen["json"]


def test_delete_with_nothing_to_delete_makes_no_request():
    calls = []

    def handler(request):
        calls.append(request)
        return httpx.Response(200, json=[])

    client_with(handler).delete([])
    assert calls == []


def test_ensure_bucket_creates_it_with_limits():
    seen = {}

    def handler(request):
        seen["json"] = request.read()
        return httpx.Response(200, json={"name": "product-images"})

    client_with(handler).ensure_bucket(max_bytes=5242880, mime_types=["image/png"])
    assert b'"public":true' in seen["json"].replace(b" ", b"")
    assert b"5242880" in seen["json"]


def test_ensure_bucket_treats_already_exists_as_success():
    # Supabase answers HTTP 400 but puts the real reason in the body's `code`.
    def handler(request):
        return httpx.Response(
            400, json={"statusCode": "409", "error": "Duplicate", "code": "BucketAlreadyExists"}
        )

    client_with(handler).ensure_bucket(max_bytes=1, mime_types=["image/png"])


def test_ensure_bucket_fails_loudly_on_other_errors():
    def handler(request):
        return httpx.Response(403, json={"code": "AccessDenied"})

    with pytest.raises(ServiceUnavailable):
        client_with(handler).ensure_bucket(max_bytes=1, mime_types=["image/png"])
