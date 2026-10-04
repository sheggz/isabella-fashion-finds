import uuid

from pydantic import BaseModel, ConfigDict, Field


class UserOut(BaseModel):
    """What the browser may know about the signed-in user (never the Google sub)."""

    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    email: str
    name: str | None
    picture: str | None
    role: str


class MobileExchangeIn(BaseModel):
    code: str = Field(min_length=1, max_length=200)
    # RFC 7636: 43-128 characters from the unreserved set. Checked here so a malformed request
    # is a clean 422 before the one-time code is touched (and burned).
    code_verifier: str = Field(pattern=r"^[A-Za-z0-9\-._~]{43,128}$")


class MobileTokenOut(BaseModel):
    token: str
    token_type: str = "bearer"
    expires_in: int  # seconds until the token stops working
    user: UserOut
