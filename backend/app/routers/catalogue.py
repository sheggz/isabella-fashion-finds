from fastapi import APIRouter

from app.domain.sizing import sizing_options

router = APIRouter(prefix="/catalogue", tags=["catalogue"])


@router.get("/options")
def options():
    """The fixed sizes and measurement body parts, so the frontend never keeps its own copy."""
    return sizing_options()
