from types import SimpleNamespace

from sqlalchemy.exc import IntegrityError

from app.core.handlers import is_unique_violation


def err(orig):
    return IntegrityError("stmt", {}, orig)


def test_postgres_unique_violation_is_recognised_by_sqlstate():
    assert is_unique_violation(err(SimpleNamespace(sqlstate="23505"))) is True


def test_other_postgres_integrity_errors_are_not_unique_violations():
    for state in ("23503", "23514", "23502"):  # foreign key, check, not null
        assert is_unique_violation(err(SimpleNamespace(sqlstate=state))) is False


def test_sqlite_unique_violation_is_recognised_by_message():
    assert is_unique_violation(err(Exception("UNIQUE constraint failed: a.b"))) is True
    assert is_unique_violation(err(Exception("CHECK constraint failed: x"))) is False
