from urllib.parse import parse_qs, urlparse

import httpx
import pytest

from app.core.errors import ServiceUnavailable, Unauthorized
from app.integrations.google import GoogleClient

PROFILE = {
    "sub": "g-1",
    "email": "Ada@Example.com",
    "email_verified": True,
    "name": "Ada",
    "picture": "http://img/a.png",
}


def client_with(handler):
    return GoogleClient(
        client_id="cid",
        client_secret="super-secret-value",
        redirect_uri="http://localhost:8000/auth/google/callback",
        transport=httpx.MockTransport(handler),
    )


def happy(request: httpx.Request) -> httpx.Response:
    if request.url.host == "oauth2.googleapis.com":
        return httpx.Response(200, json={"access_token": "tok"})
    assert request.headers["authorization"] == "Bearer tok"
    return httpx.Response(200, json=PROFILE)


def test_authorization_url_carries_everything_google_needs():
    url = client_with(happy).authorization_url(state="abc")
    parsed = urlparse(url)
    q = parse_qs(parsed.query)
    assert parsed.netloc == "accounts.google.com"
    assert q["client_id"] == ["cid"]
    assert q["redirect_uri"] == ["http://localhost:8000/auth/google/callback"]
    assert q["state"] == ["abc"]
    assert q["response_type"] == ["code"]
    assert set(q["scope"][0].split()) == {"openid", "email", "profile"}


def test_fetch_profile_returns_a_normalised_profile():
    profile = client_with(happy).fetch_profile("the-code")
    assert profile.sub == "g-1"
    assert profile.email == "ada@example.com"  # lowercased
    assert profile.name == "Ada"


def test_rejected_code_is_unauthorized_not_a_crash():
    def handler(request):
        return httpx.Response(400, json={"error": "invalid_grant"})

    with pytest.raises(Unauthorized):
        client_with(handler).fetch_profile("bad")


def test_unverified_email_is_refused():
    def handler(request):
        if request.url.host == "oauth2.googleapis.com":
            return httpx.Response(200, json={"access_token": "tok"})
        return httpx.Response(200, json={**PROFILE, "email_verified": False})

    with pytest.raises(Unauthorized):
        client_with(handler).fetch_profile("code")


def test_incomplete_profile_is_refused():
    def handler(request):
        if request.url.host == "oauth2.googleapis.com":
            return httpx.Response(200, json={"access_token": "tok"})
        return httpx.Response(200, json={"name": "no sub or email"})

    with pytest.raises(Unauthorized):
        client_with(handler).fetch_profile("code")


def test_network_failure_becomes_service_unavailable_without_leaking_secrets():
    def handler(request):
        raise httpx.ConnectError("boom client_secret=super-secret-value")

    with pytest.raises(ServiceUnavailable) as caught:
        client_with(handler).fetch_profile("code")
    assert "super-secret-value" not in caught.value.message


def test_non_json_response_from_google_is_handled():
    def handler(request):
        return httpx.Response(200, text="<html>oops</html>")

    with pytest.raises(ServiceUnavailable):
        client_with(handler).fetch_profile("code")
