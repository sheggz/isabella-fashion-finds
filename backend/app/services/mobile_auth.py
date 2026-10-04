"""Mobile sign-in: issue a short-lived one-time code, then trade it (plus the PKCE verifier) for
the user. See app/domain/pkce.py for what PKCE protects against."""
import hashlib
import secrets
import uuid
from datetime import datetime, timedelta, timezone

from sqlalchemy import delete, select, update
from sqlalchemy.orm import Session

from app.core.errors import BadRequest
from app.domain.pkce import verifier_matches
from app.models.auth_code import AuthCode
from app.models.user import User
from app.repositories import users as users_repo
from app.services.discounts import as_utc  # noqa: F401  (re-exported: callers compare stored times)

AUTH_CODE_TTL_SECONDS = 120
_PURGE_AFTER = timedelta(days=1)

# One message for every failure (unknown, used, expired, wrong verifier) so an attacker learns
# nothing about which part of a guess was close.
_INVALID = "Invalid or expired sign-in code"


def _hash(code: str) -> str:
    return hashlib.sha256(code.encode()).hexdigest()


def create_auth_code(
    session: Session, user_id: uuid.UUID, code_challenge: str, now: datetime | None = None
) -> str:
    """Make a one-time code for this user, bound to the app's PKCE challenge. Returns the
    plaintext code (the only time it exists); the database keeps just its hash."""
    now = now or datetime.now(timezone.utc)
    # Housekeeping: codes that expired more than a day ago are useless, so drop them here
    # instead of needing a scheduled job.
    session.execute(delete(AuthCode).where(AuthCode.expires_at < now - _PURGE_AFTER))
    code = secrets.token_urlsafe(32)
    session.add(
        AuthCode(
            code_hash=_hash(code),
            user_id=user_id,
            code_challenge=code_challenge,
            expires_at=now + timedelta(seconds=AUTH_CODE_TTL_SECONDS),
        )
    )
    session.commit()
    return code


def exchange_code(session: Session, code: str, verifier: str, now: datetime | None = None) -> User:
    """Redeem a code. Works at most once, only before it expires, and only with the verifier
    whose hash the app registered.

    The code is CONSUMED first (one atomic UPDATE that only matches an unused, unexpired row, so
    two simultaneous attempts cannot both win) and only then is the verifier checked. A wrong
    guess therefore burns the code: a thief who intercepted it gets exactly one try, and the
    real app is merely asked to sign in again.
    """
    now = now or datetime.now(timezone.utc)
    digest = _hash(code)
    consumed = session.execute(
        update(AuthCode)
        .where(AuthCode.code_hash == digest, AuthCode.used_at.is_(None), AuthCode.expires_at > now)
        .values(used_at=now)
    ).rowcount
    session.commit()  # commit the consumption BEFORE anything can fail below
    if consumed != 1:
        raise BadRequest(_INVALID)

    row = session.scalar(select(AuthCode).where(AuthCode.code_hash == digest))
    if row is None or not verifier_matches(verifier, row.code_challenge):
        raise BadRequest(_INVALID)
    user = users_repo.get(session, row.user_id)
    if user is None:
        raise BadRequest(_INVALID)
    return user
