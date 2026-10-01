"""Authentication/authorization dependencies, attached per route with Depends(...).

Deliberately NOT middleware: some routes are public and some are not, and a dependency makes
that explicit on every route and is trivial to override in tests.
"""
import uuid
from typing import Annotated

from fastapi import Depends, Request
from sqlalchemy.orm import Session

from app.core.config import Settings, get_settings
from app.core.errors import Forbidden, Unauthorized
from app.core.session_token import read_session
from app.db.session import get_session
from app.models.user import User
from app.repositories import users as users_repo

SESSION_COOKIE = "session"
SESSION_MAX_AGE_SECONDS = 7 * 24 * 60 * 60


def current_user_optional(
    request: Request,
    db: Annotated[Session, Depends(get_session)],
    settings: Annotated[Settings, Depends(get_settings)],
) -> User | None:
    token = request.cookies.get(SESSION_COOKIE)
    if not token:
        return None
    user_id = read_session(settings.session_secret, token, SESSION_MAX_AGE_SECONDS)
    if user_id is None:
        return None
    try:
        return users_repo.get(db, uuid.UUID(user_id))
    except ValueError:
        return None


def require_user(user: Annotated[User | None, Depends(current_user_optional)]) -> User:
    if user is None:
        raise Unauthorized("Please sign in")
    return user


def require_owner(user: Annotated[User, Depends(require_user)]) -> User:
    if user.role != "owner":
        raise Forbidden("Only the store owner can do this")
    return user
