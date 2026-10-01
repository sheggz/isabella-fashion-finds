import pytest
from sqlalchemy.exc import OperationalError

from app.core.errors import ServiceUnavailable
from app.db.session import get_session
from app.services.health import check_database


class FakeSession:
    def __init__(self, error=None):
        self.error = error
        self.ran = []

    def execute(self, statement):
        if self.error:
            raise self.error
        self.ran.append(str(statement))


def test_check_database_runs_a_trivial_query():
    session = FakeSession()
    check_database(session)
    assert session.ran == ["SELECT 1"]


def test_check_database_translates_driver_errors_without_leaking_them():
    leaky = OperationalError("SELECT 1", {}, Exception("password=hunter2 host=db.internal"))
    with pytest.raises(ServiceUnavailable) as caught:
        check_database(FakeSession(error=leaky))
    assert "hunter2" not in caught.value.message
    assert "hunter2" not in str(caught.value.details)


def test_db_health_route_ok(app, client):
    app.dependency_overrides[get_session] = lambda: FakeSession()
    res = client.get("/health/db")
    assert res.status_code == 200
    assert res.json() == {"status": "ok", "database": "up"}


def test_db_health_route_reports_503_in_the_standard_shape(app, client):
    broken = OperationalError("SELECT 1", {}, Exception("password=hunter2"))
    app.dependency_overrides[get_session] = lambda: FakeSession(error=broken)
    res = client.get("/health/db")
    assert res.status_code == 503
    assert res.json()["error"]["code"] == "service_unavailable"
    assert "hunter2" not in res.text
