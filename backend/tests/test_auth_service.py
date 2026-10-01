import pytest
from sqlalchemy import create_engine, select
from sqlalchemy.orm import Session
from sqlalchemy.pool import StaticPool

from app.db.base import Base
from app.integrations.google import GoogleProfile
from app.models.user import User
from app.services import auth


@pytest.fixture
def session():
    engine = create_engine(
        "sqlite://", poolclass=StaticPool, connect_args={"check_same_thread": False}
    )
    Base.metadata.create_all(engine)
    with Session(engine) as s:
        yield s


def profile(**over):
    return GoogleProfile(
        **{"sub": "g-1", "email": "ada@example.com", "name": "Ada", "picture": None, **over}
    )


# --- pure helpers ---

def test_listed_email_becomes_owner_case_insensitively():
    assert auth.role_for_email("Boss@X.com", ["boss@x.com"], "customer") == "owner"


def test_unlisted_email_keeps_its_current_role():
    assert auth.role_for_email("a@x.com", ["boss@x.com"], "customer") == "customer"


def test_an_owner_is_never_demoted_by_the_env_list():
    assert auth.role_for_email("a@x.com", [], "owner") == "owner"


def test_states_match_only_when_present_and_equal():
    assert auth.states_match("abc", "abc") is True
    assert auth.states_match("abc", "abd") is False
    assert auth.states_match(None, "abc") is False
    assert auth.states_match("abc", None) is False
    assert auth.states_match("", "") is False


# --- sign-in service ---

def test_first_login_creates_a_customer(session):
    user = auth.sign_in_with_google(session, profile(), owner_emails=[])
    assert user.id is not None and user.role == "customer"
    assert user.email == "ada@example.com"


def test_listed_email_is_created_as_owner(session):
    user = auth.sign_in_with_google(session, profile(), owner_emails=["ada@example.com"])
    assert user.role == "owner"


def test_second_login_reuses_the_user_and_refreshes_details(session):
    first = auth.sign_in_with_google(session, profile(name="Ada"), owner_emails=[])
    second = auth.sign_in_with_google(session, profile(name="Ada L."), owner_emails=[])
    assert first.id == second.id
    assert second.name == "Ada L."
    assert len(session.scalars(select(User)).all()) == 1


def test_adding_an_email_to_the_owner_list_upgrades_an_existing_customer(session):
    auth.sign_in_with_google(session, profile(), owner_emails=[])
    again = auth.sign_in_with_google(session, profile(), owner_emails=["ada@example.com"])
    assert again.role == "owner"


def test_removing_an_email_from_the_list_does_not_demote(session):
    auth.sign_in_with_google(session, profile(), owner_emails=["ada@example.com"])
    again = auth.sign_in_with_google(session, profile(), owner_emails=[])
    assert again.role == "owner"
