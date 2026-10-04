"""Google sign-in (authorization-code flow). HTTP only.

Two clients share one flow up to Google and one callback:
- the WEBSITE ends with an httpOnly session cookie and a redirect to the site;
- the MOBILE APP ends with a one-time code sent to the app's own link, which it trades for a
  bearer token at /auth/mobile/exchange (PKCE protects that trade; see app/domain/pkce.py).
"""
import re
import secrets
from typing import Annotated

from fastapi import APIRouter, Depends, Request, Response, status
from fastapi.responses import RedirectResponse
from sqlalchemy.orm import Session

from app.core.config import Settings, get_settings
from app.core.errors import BadRequest, ServiceUnavailable
from app.core.security import SESSION_COOKIE, SESSION_MAX_AGE_SECONDS, require_user
from app.core.session_token import read_oauth_context, sign_oauth_context, sign_session
from app.db.session import get_session
from app.domain.pkce import is_valid_challenge
from app.domain.redirects import append_query, is_allowed_redirect
from app.integrations.google import GoogleClient
from app.models.user import User
from app.schemas.user import MobileExchangeIn, MobileTokenOut, UserOut
from app.services import auth, mobile_auth

router = APIRouter(prefix="/auth", tags=["auth"])

STATE_COOKIE = "oauth_state"
STATE_MAX_AGE_SECONDS = 600
MOBILE_COOKIE = "oauth_mobile"  # carries what the app asked for through the Google round trip
MOBILE_CONTEXT_MAX_AGE_SECONDS = 600
_SAFE_ERROR = re.compile(r"[a-z_]{1,50}")

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


def _cookie_args(settings: Settings, max_age: int) -> dict:
    # Lax (not Strict) so the cookie survives the redirect back from Google.
    return {"max_age": max_age, "httponly": True, "samesite": "lax", "secure": settings.cookie_secure}


@router.get("/google/login")
def google_login(
    google: GoogleDep,
    settings: SettingsDep,
    client: str | None = None,
    redirect_uri: str | None = None,
    code_challenge: str | None = None,
    state: str | None = None,
):
    """Start sign-in. For the mobile app pass client=mobile plus the app's redirect_uri, its PKCE
    code_challenge and its own `state`; everything is validated BEFORE Google is contacted."""
    mobile_context = None
    if client == "mobile":
        if not is_allowed_redirect(redirect_uri, settings.mobile_redirect_prefix_list):
            raise BadRequest("That redirect address is not allowed")
        if not is_valid_challenge(code_challenge):
            raise BadRequest("code_challenge must be a 43-character S256 challenge")
        if not state or len(state) > 200:
            raise BadRequest("state is required (at most 200 characters)")
        mobile_context = {"redirect_uri": redirect_uri, "code_challenge": code_challenge, "state": state}

    # `state` here is OUR random one-time value, also kept in a cookie; Google echoes it back and
    # both must match, which stops forged callbacks (login CSRF).
    google_state = secrets.token_urlsafe(32)
    response = RedirectResponse(google.authorization_url(google_state), status_code=302)
    response.set_cookie(STATE_COOKIE, google_state, **_cookie_args(settings, STATE_MAX_AGE_SECONDS))
    if mobile_context:
        signed = sign_oauth_context(settings.session_secret, mobile_context)
        response.set_cookie(MOBILE_COOKIE, signed, **_cookie_args(settings, MOBILE_CONTEXT_MAX_AGE_SECONDS))
    else:
        # A website login must never inherit a half-finished mobile attempt left in this browser.
        response.delete_cookie(MOBILE_COOKIE)
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
    mobile = None
    raw_mobile = request.cookies.get(MOBILE_COOKIE)
    if raw_mobile is not None:
        mobile = read_oauth_context(settings.session_secret, raw_mobile, MOBILE_CONTEXT_MAX_AGE_SECONDS)
        if mobile is None:  # tampered with or expired: do not guess what the app wanted
            raise BadRequest("Sign-in attempt is invalid or has expired. Please try again.")

    if error:  # e.g. the user pressed "Cancel" on Google's screen
        if mobile:
            reason = error if _SAFE_ERROR.fullmatch(error) else "access_denied"
            response = RedirectResponse(
                append_query(mobile["redirect_uri"], {"error": reason, "state": mobile["state"]}), status_code=302
            )
        else:
            response = RedirectResponse(f"{settings.frontend_url}?login=cancelled", status_code=302)
        response.delete_cookie(STATE_COOKIE)
        response.delete_cookie(MOBILE_COOKIE)
        return response

    if not auth.states_match(request.cookies.get(STATE_COOKIE), state):
        raise BadRequest("Sign-in attempt is invalid or has expired. Please try again.")
    if not code:
        raise BadRequest("Missing authorization code")

    profile = google.fetch_profile(code)
    user = auth.sign_in_with_google(session, profile, settings.owner_email_list)

    if mobile:
        # The app, not this browser, becomes signed in: no session cookie is set. The target was
        # checked against the allowlist at login and came back to us inside a signed cookie.
        one_time = mobile_auth.create_auth_code(session, user.id, mobile["code_challenge"])
        response = RedirectResponse(
            append_query(mobile["redirect_uri"], {"code": one_time, "state": mobile["state"]}), status_code=302
        )
        response.delete_cookie(STATE_COOKIE)
        response.delete_cookie(MOBILE_COOKIE)
        return response

    # Website: the redirect target is fixed in config (never taken from the request), so it can't
    # be abused as an open redirect.
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


@router.post("/mobile/exchange", response_model=MobileTokenOut)
def mobile_exchange(body: MobileExchangeIn, session: DbSession, settings: SettingsDep):
    """Trade a one-time code plus the PKCE verifier for a bearer token (the same signed, expiring
    token the website carries in its cookie, so roles and expiry behave identically)."""
    user = mobile_auth.exchange_code(session, body.code, body.code_verifier)
    return MobileTokenOut(
        token=sign_session(settings.session_secret, str(user.id)),
        expires_in=SESSION_MAX_AGE_SECONDS,
        user=UserOut.model_validate(user),
    )


@router.get("/me", response_model=UserOut)
def me(user: Annotated[User, Depends(require_user)]):
    return user


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
def logout():
    # The website's cookie is cleared here; an app signs out by discarding its token (tokens are
    # signed and expire by themselves; a server-side revocation list is a planned hardening step).
    response = Response(status_code=status.HTTP_204_NO_CONTENT)
    response.delete_cookie(SESSION_COOKIE)
    return response
