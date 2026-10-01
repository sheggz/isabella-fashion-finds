from sqlalchemy import Engine, create_engine

from app.core.errors import ServiceUnavailable

_DRIVER = "postgresql+psycopg://"


def normalize_database_url(url: str) -> str:
    """Pure: make a provider-style Postgres URL use the psycopg 3 driver.

    Supabase hands out `postgresql://...`; SQLAlchemy would then look for the old psycopg2
    driver. Anything that isn't a plain Postgres URL is returned untouched.
    """
    for prefix in ("postgresql://", "postgres://"):
        if url.startswith(prefix):
            return _DRIVER + url[len(prefix):]
    return url


def build_engine(url: str) -> Engine:
    """Create an engine (lazy: no connection is opened until first use)."""
    if not url:
        raise ServiceUnavailable("Database is not configured")
    # pool_pre_ping drops dead connections the pooler may have closed while we were idle.
    return create_engine(normalize_database_url(url), pool_pre_ping=True)
