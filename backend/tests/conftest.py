import pytest
from fastapi.testclient import TestClient

from app.core.errors import Conflict, NotFound, OutOfStock
from app.main import create_app


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
