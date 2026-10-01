import logging

from sqlalchemy import text
from sqlalchemy.exc import SQLAlchemyError

from app.core.errors import ServiceUnavailable

logger = logging.getLogger(__name__)


def check_database(session) -> None:
    """Prove the database answers. Boundary: driver errors are logged, then translated."""
    try:
        session.execute(text("SELECT 1"))
    except SQLAlchemyError:
        # The driver message can contain hostnames or credentials, so it only goes to the logs.
        logger.exception("Database health check failed")
        raise ServiceUnavailable("Database is unavailable") from None
