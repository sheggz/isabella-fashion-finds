from fastapi import APIRouter

from app.domain.images import ALLOWED_TYPES, MAX_IMAGE_BYTES, MAX_IMAGES_PER_PRODUCT
from app.domain.sizing import sizing_options

router = APIRouter(prefix="/catalogue", tags=["catalogue"])


@router.get("/options")
def options():
    """The fixed sizes, body parts and photo rules, so the frontend never keeps its own copy.

    The browser uses the photo rules only to give instant feedback; the server re-checks
    every upload, so these numbers are advice to the UI and not a security control.
    """
    return {
        **sizing_options(),
        "images": {
            "max_bytes": MAX_IMAGE_BYTES,
            "max_per_product": MAX_IMAGES_PER_PRODUCT,
            "types": list(ALLOWED_TYPES),
        },
    }
