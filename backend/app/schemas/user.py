import uuid

from pydantic import BaseModel, ConfigDict


class UserOut(BaseModel):
    """What the browser may know about the signed-in user (never the Google sub)."""

    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    email: str
    name: str | None
    picture: str | None
    role: str
