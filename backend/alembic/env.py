"""Alembic environment: wires migrations to our settings and our models.

The database URL comes from DATABASE_URL (via app settings), never from alembic.ini,
so no credentials are ever written into a committed file.
"""
from logging.config import fileConfig

# Importing the model modules registers their tables on Base.metadata (needed for autogenerate).
import app.models.discount
import app.models.product
import app.models.user  # noqa: F401
from alembic import context
from app.db.base import Base
from app.db.url import build_engine

config = context.config
if config.config_file_name is not None:
    fileConfig(config.config_file_name)

target_metadata = Base.metadata


def run_migrations_online() -> None:
    from app.core.config import get_settings

    engine = build_engine(get_settings().database_url)
    with engine.connect() as connection:
        context.configure(
            connection=connection,
            target_metadata=target_metadata,
            compare_type=True,
        )
        with context.begin_transaction():
            context.run_migrations()


# Offline (SQL-script) mode is not used in this project.
run_migrations_online()
