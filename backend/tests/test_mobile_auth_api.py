from datetime import datetime, timezone
from urllib.parse import parse_qs, urlparse

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, select, update
from sqlalchemy.pool import StaticPool

from app.core.config import Settings, get_settings
from app.core.errors import Unauthorized
from app.core.session_token import sign_session
from app.db.base import Base
from app.db.session import get_session, make_session_factory
from app.domain.pkce import challenge_for
from app.integrations.google import GoogleProfile
from app.models.auth_code import AuthCode
from app.models.user import User
from app.routers.auth import get_google_client

SECRET = "s" * 48
TEST_SETTINGS = Settings(
    _env_file=None,
    session_secret=SECRET,
    owner_emails="owner@example.com",
    frontend_url="http://localhost:5173",
    backend_url="http://localhost:8000",
    google_client_id="cid",
    google_client_secret="csecret",
    mobile_redirect_prefixes="isabella://,exp://",
)
VERIFIER = "dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk"
CHALLENGE = challenge_for(VERIFIER)
APP = "isabella://auth"
PRODUCT = {"name": "Dress", "price_kobo": 1000, "variants": [{"size": "S", "stock": 1}]}


class FakeGoogle:
    def authorization_url(self, state):
        return f"https://accounts.google.com/o/oauth2/v2/auth?state={state}"

    def fetch_profile(self, code):
        if code == "bad":
            raise Unauthorized("Google rejected the sign-in")
        email = code.removeprefix("code-")
        return GoogleProfile(sub=f"sub-{email}", email=email, name=email.split("@")[0], picture=None)


@pytest.fixture
def web(app):
    engine = create_engine("sqlite://", poolclass=StaticPool, connect_args={"check_same_thread": False})
    Base.metadata.create_all(engine)
    factory = make_session_factory(engine)

    def override_session():
        with factory() as s:
            yield s

    app.dependency_overrides[get_session] = override_session
    app.dependency_overrides[get_settings] = lambda: TEST_SETTINGS
    app.dependency_overrides[get_google_client] = lambda: FakeGoogle()
    client = TestClient(app, raise_server_exceptions=False, follow_redirects=False)
    client.factory = factory
    return client


def start(web, **over):
    params = {"client": "mobile", "redirect_uri": APP, "code_challenge": CHALLENGE, "state": "app-state-123", **over}
    return web.get("/auth/google/login", params=params)


def google_state(res):
    return parse_qs(urlparse(res.headers["location"]).query)["state"][0]


def finish(web, email="shopper@example.com", **over):
    """Start the mobile login, then play the part of Google redirecting back."""
    started = start(web)
    assert started.status_code == 302, started.text
    params = {"code": f"code-{email}", "state": google_state(started), **over}
    return web.get("/auth/google/callback", params=params)


def app_code(res):
    return parse_qs(urlparse(res.headers["location"]).query)["code"][0]


def exchange(web, code, verifier=VERIFIER):
    return web.post("/auth/mobile/exchange", json={"code": code, "code_verifier": verifier})


def sign_in(web, email="shopper@example.com"):
    return exchange(web, app_code(finish(web, email))).json()["token"]


def bearer(token):
    return {"Authorization": f"Bearer {token}"}


# ---- starting the login ------------------------------------------------------------------

def test_a_valid_start_goes_to_google_and_remembers_the_apps_request_in_a_signed_cookie(web):
    res = start(web)
    assert res.status_code == 302
    assert res.headers["location"].startswith("https://accounts.google.com/")
    cookies = [c.lower() for c in res.headers.get_list("set-cookie")]
    for name in ("oauth_state=", "oauth_mobile="):
        cookie = next(c for c in cookies if c.startswith(name))
        assert "httponly" in cookie and "samesite=lax" in cookie


def test_a_redirect_that_is_not_on_the_allowlist_is_refused_before_google_is_contacted(web):
    for bad in ("https://evil.example/steal", "javascript:alert(1)", "isabella.evil://auth", ""):
        res = start(web, redirect_uri=bad)
        assert res.status_code == 400, bad
        assert res.json()["error"]["code"] == "bad_request"
        assert not any(c.lower().startswith(("oauth_state", "oauth_mobile")) for c in res.headers.get_list("set-cookie"))


def test_expo_go_links_are_accepted_because_the_test_allowlist_includes_them(web):
    assert start(web, redirect_uri="exp://192.168.1.5:8081/--/auth").status_code == 302


def test_a_malformed_challenge_or_missing_app_state_is_refused(web):
    assert start(web, code_challenge="short").status_code == 400
    assert start(web, code_challenge=CHALLENGE + "=").status_code == 400
    assert start(web, state="").status_code == 400
    assert start(web, state="x" * 201).status_code == 400


def test_the_website_login_is_unchanged_and_sets_no_mobile_cookie(web):
    res = web.get("/auth/google/login")
    assert res.status_code == 302
    # It may CLEAR a leftover mobile cookie (Max-Age=0) but must never SET one.
    setting = [
        c for c in res.headers.get_list("set-cookie")
        if c.lower().startswith("oauth_mobile=") and "max-age=0" not in c.lower()
    ]
    assert setting == []


# ---- coming back from Google --------------------------------------------------------------

def test_a_successful_mobile_login_returns_a_one_time_code_to_the_app_and_sets_no_session_cookie(web):
    res = finish(web)
    assert res.status_code == 302
    target = urlparse(res.headers["location"])
    assert f"{target.scheme}://{target.netloc}{target.path}" == APP
    query = parse_qs(target.query)
    assert query["state"] == ["app-state-123"]          # the app's own state is echoed back
    assert len(query["code"][0]) >= 40
    assert not any(c.lower().startswith("session=") for c in res.headers.get_list("set-cookie"))
    with web.factory() as db:
        row = db.scalars(select(AuthCode)).one()
        assert row.code_hash != query["code"][0]         # only a hash is stored


def test_cancelling_at_google_sends_the_app_back_with_an_error_and_its_state(web):
    started = start(web)
    res = web.get("/auth/google/callback", params={"error": "access_denied"})
    assert res.status_code == 302
    query = parse_qs(urlparse(res.headers["location"]).query)
    assert res.headers["location"].startswith(APP)
    assert query == {"error": ["access_denied"], "state": ["app-state-123"]}
    assert started.status_code == 302


def test_a_forged_google_state_is_refused_and_the_app_is_not_called(web):
    start(web)
    res = web.get("/auth/google/callback", params={"code": "code-a@example.com", "state": "forged"})
    assert res.status_code == 400


def test_a_tampered_mobile_cookie_is_refused(web):
    started = start(web)
    web.cookies.clear()                       # drop the genuine cookie so only the forged one is sent
    web.cookies.set("oauth_mobile", "forged-value")
    res = web.get("/auth/google/callback", params={"code": "code-a@example.com", "state": google_state(started)})
    assert res.status_code == 400
    assert res.json()["error"]["code"] == "bad_request"


def test_google_rejecting_the_code_is_a_401_and_creates_no_app_code(web):
    started = start(web)
    res = web.get("/auth/google/callback", params={"code": "bad", "state": google_state(started)})
    assert res.status_code == 401
    with web.factory() as db:
        assert db.scalars(select(AuthCode)).all() == []


# ---- exchanging the code ------------------------------------------------------------------

def test_the_right_code_and_verifier_give_a_token_and_the_user(web):
    body = exchange(web, app_code(finish(web))).json()
    assert body["token_type"] == "bearer"
    assert body["expires_in"] == 7 * 24 * 60 * 60
    assert body["user"]["email"] == "shopper@example.com" and body["user"]["role"] == "customer"
    assert len(body["token"]) > 40


def test_the_token_signs_the_app_in(web):
    token = sign_in(web)
    me = web.get("/auth/me", headers=bearer(token))
    assert me.status_code == 200 and me.json()["email"] == "shopper@example.com"


def test_a_code_cannot_be_used_twice(web):
    code = app_code(finish(web))
    assert exchange(web, code).status_code == 200
    again = exchange(web, code)
    assert again.status_code == 400 and again.json()["error"]["code"] == "bad_request"


def test_a_thief_with_the_code_but_not_the_verifier_gets_nothing_and_burns_the_code(web):
    code = app_code(finish(web))
    assert exchange(web, code, verifier="w" * 43).status_code == 400
    assert exchange(web, code).status_code == 400


def test_an_expired_code_is_refused(web):
    code = app_code(finish(web))
    with web.factory() as db:
        db.execute(update(AuthCode).values(expires_at=datetime(2000, 1, 1, tzinfo=timezone.utc)))
        db.commit()
    assert exchange(web, code).status_code == 400


def test_unknown_codes_and_malformed_requests(web):
    assert exchange(web, "unknown").status_code == 400
    assert exchange(web, "x" * 43, verifier="short").status_code == 422
    assert web.post("/auth/mobile/exchange", json={}).status_code == 422


# ---- the bearer token everywhere a cookie works -------------------------------------------

def test_owner_and_customer_roles_work_the_same_with_a_token(web):
    owner, customer = sign_in(web, "owner@example.com"), sign_in(web, "shopper@example.com")
    assert web.get("/auth/me", headers=bearer(owner)).json()["role"] == "owner"
    assert web.post("/products", json=PRODUCT, headers=bearer(owner)).status_code == 201
    forbidden = web.post("/products", json=PRODUCT, headers=bearer(customer))
    assert forbidden.status_code == 403 and forbidden.json()["error"]["code"] == "forbidden"
    assert web.post("/products", json=PRODUCT).status_code == 401


def test_a_forged_or_foreign_token_is_a_401(web):
    assert web.get("/auth/me", headers=bearer("forged")).status_code == 401
    other = sign_session("o" * 48, "11111111-1111-1111-1111-111111111111")
    assert web.get("/auth/me", headers=bearer(other)).status_code == 401


def test_a_valid_token_for_a_user_that_no_longer_exists_is_a_401(web):
    token = sign_in(web)
    with web.factory() as db:
        db.query(User).delete()
        db.commit()
    assert web.get("/auth/me", headers=bearer(token)).status_code == 401


def test_other_authorization_schemes_are_ignored(web):
    assert web.get("/auth/me", headers={"Authorization": "Basic dXNlcjpwYXNz"}).status_code == 401


def test_when_both_are_sent_the_bearer_token_wins_over_the_cookie(web):
    # Sign in the website way: the test client now holds a session cookie for cookie@example.com.
    started = web.get("/auth/google/login")
    web.get("/auth/google/callback", params={"code": "code-cookie@example.com", "state": google_state(started)})
    assert web.get("/auth/me").json()["email"] == "cookie@example.com"

    token = sign_in(web, "token@example.com")
    assert web.get("/auth/me", headers=bearer(token)).json()["email"] == "token@example.com"


def test_signing_out_with_a_token_is_accepted(web):
    token = sign_in(web)
    assert web.post("/auth/logout", headers=bearer(token)).status_code == 204


def test_a_website_login_clears_any_half_finished_mobile_attempt(web):
    start(web)                                  # the app began a sign-in in this browser...
    res = web.get("/auth/google/login")         # ...then the person logs in to the website instead
    cleared = [c for c in res.headers.get_list("set-cookie") if c.lower().startswith("oauth_mobile=")]
    assert cleared and "max-age=0" in cleared[0].lower()
