import pytest
from fastapi.testclient import TestClient
from sqlalchemy.exc import IntegrityError

from app.core.config import get_settings
from app.core.errors import Conflict, NotFound, OutOfStock, ServiceUnavailable
from app.db.session import get_engine
from app.main import create_app

TEST_ENV = {
    # Never connected to: the engine is created lazily and tests replace the session.
    "DATABASE_URL": "postgresql://test:test@localhost:1/test",
    "SESSION_SECRET": "t" * 48,
    "SUPABASE_URL": "https://test.supabase.co",
    "SUPABASE_SERVICE_KEY": "sb_secret_test_key_for_tests_only_0123456789",
    "STORAGE_BUCKET": "product-images",
    "APP_ENV": "development",
    "OWNER_EMAILS": "",
    "GOOGLE_CLIENT_ID": "test-client-id",
    "GOOGLE_CLIENT_SECRET": "test-client-secret",
}


@pytest.fixture(autouse=True)
def hermetic_settings(monkeypatch):
    """Give every test the SAME configuration, whatever machine it runs on.

    Without this, tests silently depended on a developer's local `.env`: with a real
    DATABASE_URL a request with no login got a clean 401, but on a clean machine (CI) the
    app answered 503 "database not configured" before reaching the login check. Environment
    variables win over the .env file, so setting them here makes the .env irrelevant. The
    caches are cleared before and after so nothing leaks between tests.
    """
    for name, value in TEST_ENV.items():
        monkeypatch.setenv(name, value)
    get_settings.cache_clear()
    get_engine.cache_clear()
    yield
    get_settings.cache_clear()
    get_engine.cache_clear()


class FakeStorage:
    """In-memory stand-in for the Supabase Storage adapter (same two methods the app uses)."""

    def __init__(self, fail_upload=False, fail_delete=False):
        self.objects = {}  # path -> (bytes, content_type)
        self.fail_upload = fail_upload
        self.fail_delete = fail_delete

    def upload(self, path, data, content_type):
        if self.fail_upload:
            raise ServiceUnavailable("Image storage is unavailable")
        self.objects[path] = (data, content_type)

    def delete(self, paths):
        if self.fail_delete:
            raise ServiceUnavailable("Image storage is unavailable")
        for path in paths:
            self.objects.pop(path, None)


@pytest.fixture
def fake_storage():
    return FakeStorage()


@pytest.fixture
def app():
    app = create_app()

    # Throwaway routes that exercise each kind of failure at the boundary.
    @app.get("/_t/notfound")
    def _notfound():
        raise NotFound("Product not found")

    @app.get("/_t/stock")
    def _stock():
        raise OutOfStock("Size M is sold out", details={"size": "M"})

    @app.get("/_t/conflict")
    def _conflict():
        raise Conflict("Already exists")

    @app.get("/_t/unique")
    def _unique():
        raise IntegrityError("INSERT", {}, Exception("UNIQUE constraint failed: products.name"))

    @app.get("/_t/check")
    def _check():
        raise IntegrityError("INSERT", {}, Exception("CHECK constraint failed: ck_price"))

    @app.get("/_t/boom")
    def _boom():
        raise RuntimeError("secret database password is hunter2")

    @app.get("/_t/int/{n}")
    def _int(n: int):
        return {"n": n}

    return app


@pytest.fixture
def client(app):
    # raise_server_exceptions=False so unhandled errors reach our 500 handler, like in production
    return TestClient(app, raise_server_exceptions=False)
