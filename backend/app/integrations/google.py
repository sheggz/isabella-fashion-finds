"""Google OAuth adapter: the boundary between us and Google.

Vendor errors, timeouts and odd responses are caught here and translated into OUR errors, so
the rest of the app never sees httpx exceptions and secrets never reach a response.
"""
import logging
from dataclasses import dataclass
from urllib.parse import urlencode

import httpx

from app.core.errors import ServiceUnavailable, Unauthorized

logger = logging.getLogger(__name__)

AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth"
TOKEN_URL = "https://oauth2.googleapis.com/token"
USERINFO_URL = "https://openidconnect.googleapis.com/v1/userinfo"


@dataclass(frozen=True)
class GoogleProfile:
    sub: str  # Google's permanent, unique id for the account (emails can change; this can't)
    email: str
    name: str | None
    picture: str | None


class GoogleClient:
    def __init__(self, client_id, client_secret, redirect_uri, transport=None, timeout=10.0):
        self._client_id = client_id
        self._client_secret = client_secret
        self._redirect_uri = redirect_uri
        self._transport = transport  # tests inject httpx.MockTransport here
        self._timeout = timeout

    def authorization_url(self, state: str) -> str:
        query = urlencode(
            {
                "client_id": self._client_id,
                "redirect_uri": self._redirect_uri,
                "response_type": "code",
                "scope": "openid email profile",
                "state": state,
                "prompt": "select_account",
            }
        )
        return f"{AUTH_URL}?{query}"

    def fetch_profile(self, code: str) -> GoogleProfile:
        try:
            with httpx.Client(transport=self._transport, timeout=self._timeout) as http:
                token_res = http.post(
                    TOKEN_URL,
                    data={
                        "code": code,
                        "client_id": self._client_id,
                        "client_secret": self._client_secret,
                        "redirect_uri": self._redirect_uri,
                        "grant_type": "authorization_code",
                    },
                )
                self._check_status(token_res)
                access_token = token_res.json().get("access_token")
                if not access_token:
                    raise Unauthorized("Google sign-in failed")

                info_res = http.get(USERINFO_URL, headers={"Authorization": f"Bearer {access_token}"})
                self._check_status(info_res)
                info = info_res.json()
        except (httpx.HTTPError, ValueError):
            # Details (which may echo request data) go to the logs only.
            logger.warning("Google sign-in call failed", exc_info=True)
            raise ServiceUnavailable("Google sign-in is temporarily unavailable") from None

        return self._to_profile(info)

    @staticmethod
    def _check_status(res: httpx.Response) -> None:
        if res.status_code >= 500:
            raise ServiceUnavailable("Google sign-in is temporarily unavailable")
        if res.status_code >= 400:
            raise Unauthorized("Google sign-in failed")

    @staticmethod
    def _to_profile(info) -> GoogleProfile:
        if not isinstance(info, dict) or not info.get("sub") or not info.get("email"):
            raise Unauthorized("Google sign-in failed")
        if info.get("email_verified") not in (True, "true"):
            raise Unauthorized("Your Google email address is not verified")
        return GoogleProfile(
            sub=str(info["sub"]),
            email=str(info["email"]).strip().lower(),
            name=info.get("name"),
            picture=info.get("picture"),
        )
