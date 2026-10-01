"""Sign-in rules. Pure helpers first, then the one function that touches the database."""
import secrets
from datetime import datetime, timezone

from sqlalchemy.orm import Session

from app.integrations.google import GoogleProfile
from app.models.user import User
from app.repositories import users as users_repo


def role_for_email(email: str, owner_emails: list[str], current_role: str) -> str:
    """Pure. OWNER_EMAILS can grant the owner role but never takes it away."""
    if current_role == "owner" or email.strip().lower() in owner_emails:
        return "owner"
    return current_role


def states_match(expected: str | None, received: str | None) -> bool:
    """Pure. Constant-time comparison of the OAuth `state` (anti-CSRF) values."""
    if not expected or not received:
        return False
    return secrets.compare_digest(expected, received)


def sign_in_with_google(
    session: Session,
    profile: GoogleProfile,
    owner_emails: list[str],
    now: datetime | None = None,
) -> User:
    """Find the user by Google's permanent id (or create them) and refresh their details."""
    now = now or datetime.now(timezone.utc)
    user = users_repo.get_by_google_sub(session, profile.sub)
    if user is None:
        user = users_repo.add(
            session,
            User(google_sub=profile.sub, email=profile.email, role="customer"),
        )
    user.email = profile.email
    user.name = profile.name
    user.picture = profile.picture
    user.role = role_for_email(profile.email, owner_emails, user.role)
    user.last_login_at = now
    session.commit()
    return user
