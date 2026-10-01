"""Owner-only photo endpoints. HTTP only: every rule lives in services/images.py."""
import uuid

from fastapi import APIRouter, Depends, UploadFile, status

from app.core.security import require_owner
from app.domain.images import MAX_IMAGE_BYTES
from app.routers.deps import DbSession, StorageDep
from app.schemas.product import ProductOut, ReorderIn
from app.services import catalogue, images
from app.services.presentation import present_one

router = APIRouter(prefix="/products", tags=["images"], dependencies=[Depends(require_owner)])


@router.post("/{product_id}/images", response_model=ProductOut, status_code=status.HTTP_201_CREATED)
def upload_image(product_id: uuid.UUID, file: UploadFile, session: DbSession, storage: StorageDep):
    """Plain `def` (not async) on purpose: the database and storage calls below block, and
    FastAPI runs sync endpoints in a worker thread so they don't stall the event loop.

    Reads at most limit+1 bytes: enough to know the file is too big without loading all of it.
    The client's filename and Content-Type are ignored; the service inspects the bytes.
    Note: the multipart body is still received in full before this runs, so a hard cap on
    request size also belongs at the hosting/proxy layer.
    """
    data = file.file.read(MAX_IMAGE_BYTES + 1)
    images.add_image(session, storage, product_id, data)
    return present_one(session, catalogue.get_product(session, product_id, include_inactive=True))


@router.put("/{product_id}/images/order", response_model=ProductOut)
def reorder_images(product_id: uuid.UUID, body: ReorderIn, session: DbSession):
    return present_one(session, images.reorder_images(session, product_id, body.image_ids))


@router.delete("/{product_id}/images/{image_id}", response_model=ProductOut)
def delete_image(product_id: uuid.UUID, image_id: uuid.UUID, session: DbSession, storage: StorageDep):
    return present_one(session, images.delete_image(session, storage, product_id, image_id))
