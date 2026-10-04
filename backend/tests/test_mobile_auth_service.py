import hashlib
from datetime import datetime, timedelta, timezone

import pytest
from sqlalchemy import create_engine, select
from sqlalchemy.pool import StaticPool

from app.core.errors import BadRequest
from app.db.base import Base
from app.db.session import make_session_factory
from app.domain.pkce import challenge_for
from app.models.auth_code import AuthCode
from app.models.user import User
from app.services import mobile_auth

NOW = datetime(2026, 10, 4, 12, 0, tzinfo=timezone.utc)
VERIFIER = "v" * 43
CHALLENGE = challenge_for(VERIFIER)


@pytest.fixture
def session():
    engine = create_engine("sqlite://", poolclass=StaticPool, connect_args={"check_same_thread": False})
    Base.metadata.create_all(engine)
    with make_session_factory(engine)() as s:
        yield s


@pytest.fixture
def user(session):
    u = User(google_sub="sub-ada", email="ada@example.test", name="Ada")
    session.add(u)
    session.commit()
    return u


def test_a_code_is_random_url_safe_and_only_its_hash_is_stored(session, user):
    code = mobile_auth.create_auth_code(session, user.id, CHALLENGE, now=NOW)
    assert len(code) >= 40 and code.replace("-", "").replace("_", "").isalnum()
    row = session.scalars(select(AuthCode)).one()
    assert row.code_hash == hashlib.sha256(code.encode()).hexdigest()
    assert code not in (row.code_hash, row.code_challenge)   # the plaintext is never stored
    assert (row.user_id, row.code_challenge, row.used_at) == (user.id, CHALLENGE, None)


def test_a_code_lives_for_two_minutes(session, user):
    mobile_auth.create_auth_code(session, user.id, CHALLENGE, now=NOW)
    row = session.scalars(select(AuthCode)).one()
    assert mobile_auth.AUTH_CODE_TTL_SECONDS == 120
    assert mobile_auth.as_utc(row.expires_at) == NOW + timedelta(seconds=120)


def test_two_codes_are_different(session, user):
    a = mobile_auth.create_auth_code(session, user.id, CHALLENGE, now=NOW)
    b = mobile_auth.create_auth_code(session, user.id, CHALLENGE, now=NOW)
    assert a != b


def test_the_right_code_and_verifier_give_the_user_back(session, user):
    code = mobile_auth.create_auth_code(session, user.id, CHALLENGE, now=NOW)
    assert mobile_auth.exchange_code(session, code, VERIFIER, now=NOW + timedelta(seconds=5)).id == user.id


def test_a_code_works_once_only(session, user):
    code = mobile_auth.create_auth_code(session, user.id, CHALLENGE, now=NOW)
    mobile_auth.exchange_code(session, code, VERIFIER, now=NOW)
    with pytest.raises(BadRequest):
        mobile_auth.exchange_code(session, code, VERIFIER, now=NOW)


def test_a_stolen_code_without_the_verifier_is_useless_and_the_code_is_burned(session, user):
    code = mobile_auth.create_auth_code(session, user.id, CHALLENGE, now=NOW)
    with pytest.raises(BadRequest):
        mobile_auth.exchange_code(session, code, "w" * 43, now=NOW)       # a thief's guess
    with pytest.raises(BadRequest):
        mobile_auth.exchange_code(session, code, VERIFIER, now=NOW)       # even the real app now fails


def test_an_expired_code_is_refused(session, user):
    code = mobile_auth.create_auth_code(session, user.id, CHALLENGE, now=NOW)
    with pytest.raises(BadRequest):
        mobile_auth.exchange_code(session, code, VERIFIER, now=NOW + timedelta(seconds=121))


def test_the_last_valid_instant_is_just_before_expiry(session, user):
    code = mobile_auth.create_auth_code(session, user.id, CHALLENGE, now=NOW)
    assert mobile_auth.exchange_code(session, code, VERIFIER, now=NOW + timedelta(seconds=119)).id == user.id


def test_an_unknown_code_is_refused(session, user):
    with pytest.raises(BadRequest):
        mobile_auth.exchange_code(session, "not-a-real-code", VERIFIER, now=NOW)


def test_every_failure_looks_the_same_so_nothing_is_revealed(session, user):
    code = mobile_auth.create_auth_code(session, user.id, CHALLENGE, now=NOW)
    messages = set()
    for attempt in (
        lambda: mobile_auth.exchange_code(session, "nope", VERIFIER, now=NOW),
        lambda: mobile_auth.exchange_code(session, code, "w" * 43, now=NOW),
        lambda: mobile_auth.exchange_code(session, code, VERIFIER, now=NOW),
    ):
        with pytest.raises(BadRequest) as caught:
            attempt()
        messages.add(caught.value.message)
    assert len(messages) == 1


def test_old_codes_are_cleaned_up_when_a_new_one_is_made(session, user):
    old = mobile_auth.create_auth_code(session, user.id, CHALLENGE, now=NOW - timedelta(days=2))
    fresh = mobile_auth.create_auth_code(session, user.id, CHALLENGE, now=NOW)
    hashes = {r.code_hash for r in session.scalars(select(AuthCode))}
    assert hashlib.sha256(old.encode()).hexdigest() not in hashes
    assert hashlib.sha256(fresh.encode()).hexdigest() in hashes
