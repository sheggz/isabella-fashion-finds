import pytest

from app.core.errors import ServiceUnavailable
from app.db.url import build_engine, normalize_database_url


def test_plain_postgresql_url_gets_the_psycopg_driver():
    assert (
        normalize_database_url("postgresql://u:p@host:5432/db")
        == "postgresql+psycopg://u:p@host:5432/db"
    )


def test_legacy_postgres_scheme_is_accepted():
    assert normalize_database_url("postgres://u:p@h/db") == "postgresql+psycopg://u:p@h/db"


def test_already_qualified_url_is_unchanged():
    url = "postgresql+psycopg://u:p@h/db"
    assert normalize_database_url(url) == url


def test_other_databases_are_left_alone():
    assert normalize_database_url("sqlite://") == "sqlite://"


def test_build_engine_without_a_url_is_a_service_error_not_a_crash():
    with pytest.raises(ServiceUnavailable):
        build_engine("")


def test_build_engine_does_not_connect_until_used():
    engine = build_engine("postgresql://u:p@localhost:1/db")
    assert engine.url.drivername == "postgresql+psycopg"
