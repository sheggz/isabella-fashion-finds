from urllib.parse import parse_qs, urlparse

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.pool import StaticPool

from app.core.config import Settings, get_settings
from app.core.errors import Unauthorized
from app.db.base import Base
from app.db.session import get_session, make_session_factory
from app.integrations.google import GoogleProfile
from app.routers.auth import get_google_client

TEST_SETTINGS = Settings(
    _env_file=None,
    session_secret="s" * 48,
    owner_emails="owner@example.com",
    frontend_url="http://localhost:5173",
    backend_url="http://localhost:8000",
    google_client_id="cid",
    google_client_secret="csecret",
)

PRODUCT = {"name": "Dress", "price_kobo": 1000, "variants": [{"size": "S", "stock": 1}]}


class FakeGoogle:
    """Stands in for Google: 'code-<email>' signs in as that email."""

    def authorization_url(self, state):
        return f"https://accounts.google.com/o/oauth2/v2/auth?state={state}"

    def fetch_profile(self, code):
        if code == "bad":
            raise Unauthorized("Google rejected the sign-in")
        email = code.removeprefix("code-")
        return GoogleProfile(sub=f"sub-{email}", email=email, name=email.split("@")[0], picture=None)


@pytest.fixture
def web(app):
    engine = create_engine(
        "sqlite://", poolclass=StaticPool, connect_args={"check_same_thread": False}
    )
    Base.metadata.create_all(engine)

    def override_session():
        with make_session_factory(engine)() as s:
            yield s

    app.dependency_overrides[get_session] = override_session
    app.dependency_overrides[get_settings] = lambda: TEST_SETTINGS
    app.dependency_overrides[get_google_client] = lambda: FakeGoogle()
    return TestClient(app, raise_server_exceptions=False, follow_redirects=False)


def sign_in(web, email):
    """Run the whole login dance; the TestClient keeps the cookies like a browser would."""
    start = web.get("/auth/google/login")
    state = parse_qs(urlparse(start.headers["location"]).query)["state"][0]
    return web.get("/auth/google/callback", params={"code": f"code-{email}", "state": state})


def test_login_redirects_to_google_and_sets_a_state_cookie(web):
    res = web.get("/auth/google/login")
    assert res.status_code == 302
    assert res.headers["location"].startswith("https://accounts.google.com/")
    cookie = res.headers["set-cookie"].lower()
    assert "oauth_state=" in cookie and "httponly" in cookie and "samesite=lax" in cookie


def test_callback_with_wrong_state_is_rejected(web):
    web.get("/auth/google/login")
    res = web.get("/auth/google/callback", params={"code": "code-a@x.com", "state": "forged"})
    assert res.status_code == 400
    assert res.json()["error"]["code"] == "bad_request"


def test_callback_without_a_prior_login_start_is_rejected(web):
    res = web.get("/auth/google/callback", params={"code": "code-a@x.com", "state": "anything"})
    assert res.status_code == 400


def test_successful_login_sets_an_httponly_session_and_returns_to_the_frontend(web):
    res = sign_in(web, "shopper@example.com")
    assert res.status_code == 302
    assert res.headers["location"] == "http://localhost:5173"
    cookies = [c.lower() for c in res.headers.get_list("set-cookie")]
    session_cookie = next(c for c in cookies if c.startswith("session="))
    assert "httponly" in session_cookie and "samesite=lax" in session_cookie


def test_me_returns_the_signed_in_user(web):
    sign_in(web, "shopper@example.com")
    res = web.get("/auth/me")
    assert res.status_code == 200
    assert res.json()["email"] == "shopper@example.com"
    assert res.json()["role"] == "customer"


def test_me_without_login_is_401(web):
    res = web.get("/auth/me")
    assert res.status_code == 401
    assert res.json()["error"]["code"] == "unauthorized"


def test_a_forged_session_cookie_is_401(web):
    web.cookies.set("session", "forged-value")
    assert web.get("/auth/me").status_code == 401


def test_logout_clears_the_session(web):
    sign_in(web, "shopper@example.com")
    assert web.post("/auth/logout").status_code == 204
    assert web.get("/auth/me").status_code == 401


def test_user_cancelling_at_google_returns_to_the_frontend_gracefully(web):
    res = web.get("/auth/google/callback", params={"error": "access_denied"})
    assert res.status_code == 302
    assert res.headers["location"] == "http://localhost:5173?login=cancelled"


def test_google_rejecting_the_code_is_401_in_the_standard_shape(web):
    start = web.get("/auth/google/login")
    state = parse_qs(urlparse(start.headers["location"]).query)["state"][0]
    res = web.get("/auth/google/callback", params={"code": "bad", "state": state})
    assert res.status_code == 401
    assert res.json()["error"]["code"] == "unauthorized"


# --- the real owner guard, end to end (no dependency override) ---

def test_owner_can_create_products_after_signing_in(web):
    sign_in(web, "owner@example.com")
    assert web.get("/auth/me").json()["role"] == "owner"
    assert web.post("/products", json=PRODUCT).status_code == 201


def test_a_customer_gets_403_on_owner_routes(web):
    sign_in(web, "shopper@example.com")
    res = web.post("/products", json=PRODUCT)
    assert res.status_code == 403
    assert res.json()["error"]["code"] == "forbidden"


def test_anonymous_gets_401_on_owner_routes(web):
    assert web.post("/products", json=PRODUCT).status_code == 401
