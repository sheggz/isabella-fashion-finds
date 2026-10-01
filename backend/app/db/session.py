from collections.abc import Iterator
from functools import lru_cache

from sqlalchemy import Engine
from sqlalchemy.orm import Session, sessionmaker

from app.core.config import get_settings
from app.db.url import build_engine


@lru_cache
def get_engine() -> Engine:
    """Return the one shared engine for this process, creating it on first use.

    The engine owns the connection pool, so it must be created ONCE and reused: building one
    per request would open a new connection to Supabase every time and quickly exhaust its
    connection limit. `@lru_cache` on a no-argument function gives a lazy singleton.

    Lazy matters: nothing is read or built at import time, so importing the app (tests,
    Alembic) works without a configured database, and settings are read when first needed
    rather than before anything had a chance to override them. Tests that override
    `get_session` never reach this function at all. A test that changes DATABASE_URL must call
    `get_engine.cache_clear()` or it will keep seeing the old engine.
    """
    return build_engine(get_settings().database_url)


def make_session_factory(engine: Engine) -> sessionmaker:
    """The one place that decides how sessions behave. Tests use it too, on purpose.

    `expire_on_commit=False` keeps objects readable after a commit, so a response can be built
    from them without another query. The catch: objects are then NOT refreshed after a commit,
    so code must keep in-memory relationships in sync itself (append to `product.images`,
    don't just insert a row that points at the product). Sessions with the default setting
    hide that class of bug, which is why the tests build their sessions through this function.
    """
    return sessionmaker(bind=engine, expire_on_commit=False)


def get_session() -> Iterator[Session]:
    """FastAPI dependency: one session per request, always closed afterwards."""
    with make_session_factory(get_engine())() as session:
        yield session
