from typing import Annotated

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.db.session import get_session
from app.services.health import check_database

router = APIRouter()

DbSession = Annotated[Session, Depends(get_session)]


@router.get("/health")
def health():
    return {"status": "ok"}


@router.get("/health/db")
def health_db(session: DbSession):
    check_database(session)
    return {"status": "ok", "database": "up"}
