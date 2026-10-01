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


def get_session() -> Iterator[Session]:
    """FastAPI dependency: one session per request, always closed afterwards."""
    factory = sessionmaker(bind=get_engine(), expire_on_commit=False)
    with factory() as session:
        yield session
