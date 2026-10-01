"""Signed, expiring session tokens (what goes inside the login cookie).

The token is SIGNED, not encrypted: anyone can read the user id inside, but nobody can change
it or invent one without SESSION_SECRET. It carries only the user id; role and everything else
are looked up from the database on each request, so changes take effect immediately.
"""
from itsdangerous import BadSignature, URLSafeTimedSerializer

from app.core.errors import ServiceUnavailable

_SALT = "isabella.session.v1"
_MIN_SECRET_LENGTH = 32


def _serializer(secret: str) -> URLSafeTimedSerializer:
    if not secret or len(secret) < _MIN_SECRET_LENGTH:
        raise ServiceUnavailable("Sign-in is not configured")
    return URLSafeTimedSerializer(secret, salt=_SALT)


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
