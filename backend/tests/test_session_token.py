import pytest

from app.core.errors import ServiceUnavailable
from app.core.session_token import read_session, sign_session

SECRET = "x" * 40


def test_round_trip_returns_the_user_id():
    token = sign_session(SECRET, "user-123")
    assert read_session(SECRET, token, max_age_seconds=60) == "user-123"


def test_tampered_token_is_rejected():
    token = sign_session(SECRET, "user-123")
    assert read_session(SECRET, token[:-2] + "xx", max_age_seconds=60) is None


def test_token_signed_with_another_secret_is_rejected():
    token = sign_session("y" * 40, "user-123")
    assert read_session(SECRET, token, max_age_seconds=60) is None


def test_expired_token_is_rejected():
    token = sign_session(SECRET, "user-123")
    assert read_session(SECRET, token, max_age_seconds=-1) is None


def test_garbage_and_empty_tokens_are_rejected():
    assert read_session(SECRET, "not-a-token", max_age_seconds=60) is None
    assert read_session(SECRET, "", max_age_seconds=60) is None
    assert read_session(SECRET, None, max_age_seconds=60) is None


def test_a_weak_or_missing_secret_is_a_configuration_error():
    with pytest.raises(ServiceUnavailable):
        sign_session("short", "user-123")
    with pytest.raises(ServiceUnavailable):
        read_session("", "anything", max_age_seconds=60)
