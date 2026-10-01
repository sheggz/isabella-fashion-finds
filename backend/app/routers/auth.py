"""Google sign-in (authorization-code flow) and the session cookie. HTTP only."""
import secrets
from typing import Annotated

from fastapi import APIRouter, Depends, Request, Response, status
from fastapi.responses import RedirectResponse
from sqlalchemy.orm import Session

from app.core.config import Settings, get_settings
from app.core.errors import BadRequest, ServiceUnavailable
from app.core.security import SESSION_COOKIE, SESSION_MAX_AGE_SECONDS, require_user
from app.core.session_token import sign_session
from app.db.session import get_session
from app.integrations.google import GoogleClient
from app.models.user import User
from app.schemas.user import UserOut
from app.services import auth

router = APIRouter(prefix="/auth", tags=["auth"])

STATE_COOKIE = "oauth_state"
STATE_MAX_AGE_SECONDS = 600

SettingsDep = Annotated[Settings, Depends(get_settings)]
DbSession = Annotated[Session, Depends(get_session)]


def get_google_client(settings: SettingsDep) -> GoogleClient:
    if not settings.google_client_id or not settings.google_client_secret:
        raise ServiceUnavailable("Google sign-in is not configured")
    return GoogleClient(
        client_id=settings.google_client_id,
        client_secret=settings.google_client_secret,
        redirect_uri=f"{settings.backend_url}/auth/google/callback",
    )


GoogleDep = Annotated[GoogleClient, Depends(get_google_client)]


@router.get("/google/login")
def google_login(google: GoogleDep, settings: SettingsDep):
    # `state` is a random one-time value we also keep in a cookie; Google echoes it back and
    # we require both to match, which stops forged callbacks (login CSRF).
    state = secrets.token_urlsafe(32)
    response = RedirectResponse(google.authorization_url(state), status_code=302)
    response.set_cookie(
        STATE_COOKIE,
        state,
        max_age=STATE_MAX_AGE_SECONDS,
        httponly=True,
        samesite="lax",  # must be Lax (not Strict) so it survives the redirect back from Google
        secure=settings.cookie_secure,
    )
    return response


@router.get("/google/callback")
def google_callback(
    request: Request,
    session: DbSession,
    settings: SettingsDep,
    google: GoogleDep,
    code: str | None = None,
    state: str | None = None,
    error: str | None = None,
):
    if error:  # e.g. the user pressed "Cancel" on Google's screen
        response = RedirectResponse(f"{settings.frontend_url}?login=cancelled", status_code=302)
        response.delete_cookie(STATE_COOKIE)
        return response

    if not auth.states_match(request.cookies.get(STATE_COOKIE), state):
        raise BadRequest("Sign-in attempt is invalid or has expired. Please try again.")
    if not code:
        raise BadRequest("Missing authorization code")

    profile = google.fetch_profile(code)
    user = auth.sign_in_with_google(session, profile, settings.owner_email_list)

    # The redirect target is fixed in config (never taken from the request), so it can't be
    # abused as an open redirect.
    response = RedirectResponse(settings.frontend_url, status_code=302)
    response.set_cookie(
        SESSION_COOKIE,
        sign_session(settings.session_secret, str(user.id)),
        max_age=SESSION_MAX_AGE_SECONDS,
        httponly=True,  # JavaScript can't read it, so an XSS bug can't steal the session
        samesite="lax",
        secure=settings.cookie_secure,
    )
    response.delete_cookie(STATE_COOKIE)
    return response


@router.get("/me", response_model=UserOut)
def me(user: Annotated[User, Depends(require_user)]):
    return user


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
def logout():
    response = Response(status_code=status.HTTP_204_NO_CONTENT)
    response.delete_cookie(SESSION_COOKIE)
    return response
