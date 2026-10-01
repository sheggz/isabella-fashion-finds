import uuid

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.user import User


def get(session: Session, user_id: uuid.UUID) -> User | None:
    return session.get(User, user_id)


def get_by_google_sub(session: Session, sub: str) -> User | None:
    return session.scalar(select(User).where(User.google_sub == sub))


def add(session: Session, user: User) -> User:
    session.add(user)
    session.flush()
    return user
