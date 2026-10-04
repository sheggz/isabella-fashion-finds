"""Signed, expiring session tokens (what goes inside the login cookie).

The token is SIGNED, not encrypted: anyone can read the user id inside, but nobody can change
it or invent one without SESSION_SECRET. It carries only the user id; role and everything else
are looked up from the database on each request, so changes take effect immediately.
"""
from itsdangerous import BadSignature, URLSafeTimedSerializer

from app.core.errors import ServiceUnavailable

_SALT = "isabella.session.v1"
_MIN_SECRET_LENGTH = 32


_OAUTH_SALT = "isabella.oauth.mobile.v1"


def _serializer(secret: str, salt: str = _SALT) -> URLSafeTimedSerializer:
    if not secret or len(secret) < _MIN_SECRET_LENGTH:
        raise ServiceUnavailable("Sign-in is not configured")
    return URLSafeTimedSerializer(secret, salt=salt)


def sign_session(secret: str, user_id: str) -> str:
    return _serializer(secret).dumps({"uid": user_id})


def read_session(secret: str, token: str | None, max_age_seconds: int) -> str | None:
    """Return the user id, or None for anything missing, forged, malformed or expired."""
    serializer = _serializer(secret)
    if not token:
        return None
    try:
        payload = serializer.loads(token, max_age=max_age_seconds)
    except BadSignature:  # also covers SignatureExpired
        return None
    uid = payload.get("uid") if isinstance(payload, dict) else None
    return uid if isinstance(uid, str) else None


def sign_oauth_context(secret: str, data: dict) -> str:
    """Sign what the mobile app asked for (redirect, challenge, its state) so it can ride in a
    cookie through the Google round trip without the browser being able to alter it.

    A DIFFERENT salt from the session token, so a value signed here can never be accepted as a
    login session or the other way round, even though both use the same secret."""
    return _serializer(secret, _OAUTH_SALT).dumps(data)


def read_oauth_context(secret: str, token: str | None, max_age_seconds: int) -> dict | None:
    serializer = _serializer(secret, _OAUTH_SALT)
    if not token:
        return None
    try:
        payload = serializer.loads(token, max_age=max_age_seconds)
    except BadSignature:
        return None
    return payload if isinstance(payload, dict) else None
