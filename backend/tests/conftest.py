import pytest
from fastapi.testclient import TestClient
from sqlalchemy.exc import IntegrityError

from app.core.errors import Conflict, NotFound, OutOfStock, ServiceUnavailable
from app.main import create_app


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
