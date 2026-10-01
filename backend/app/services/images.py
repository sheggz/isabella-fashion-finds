"""Product photo business rules. The storage adapter is passed in, so tests use a fake."""
import uuid

from sqlalchemy.orm import Session

from app.core.errors import BadRequest, Conflict, NotFound, PayloadTooLarge, UnsupportedMediaType
from app.domain.images import (
    MAX_IMAGE_BYTES,
    MAX_IMAGES_PER_PRODUCT,
    detect_image_type,
    object_path,
    plan_reorder,
)
from app.integrations.storage import delete_quietly
from app.models.product import Product, ProductImage
from app.services import catalogue


def add_image(
    session: Session,
    storage,
    product_id: uuid.UUID,
    data: bytes,
    image_id: uuid.UUID | None = None,
) -> ProductImage:
    """Validate, upload, then record a photo.

    Order matters. Everything that can be refused without side effects is checked first
    (size, real file type, photo limit). Then the file is uploaded BEFORE the database row is
    written: if the upload fails nothing is recorded, and if the row cannot be saved we delete
    the file again, so a failure halfway never leaves a row pointing at nothing or a file
    nobody knows about.
    """
    product = catalogue.get_product(session, product_id, include_inactive=True)
    if len(data) > MAX_IMAGE_BYTES:
        raise PayloadTooLarge("Photos can be at most 5 MB")
    content_type = detect_image_type(data)
    if content_type is None:
        raise UnsupportedMediaType("Only JPEG, PNG or WebP photos are accepted")
    if len(product.images) >= MAX_IMAGES_PER_PRODUCT:
        raise Conflict(f"A piece can have at most {MAX_IMAGES_PER_PRODUCT} photos")

    image_id = image_id or uuid.uuid4()
    path = object_path(product.id, image_id, content_type)
    storage.upload(path, data, content_type)
    try:
        position = max((i.position for i in product.images), default=-1) + 1
        image = ProductImage(id=image_id, path=path, position=position)
        # Append through the relationship (not session.add with a product_id): sessions keep
        # loaded objects after a commit, so the product's in-memory `images` list must be
        # updated too, or the next read would not see this photo. See make_session_factory.
        product.images.append(image)
        session.commit()
    except Exception:
        session.rollback()
        delete_quietly(storage, [path])
        raise
    return image


def delete_image(session: Session, storage, product_id: uuid.UUID, image_id: uuid.UUID) -> Product:
    product = catalogue.get_product(session, product_id, include_inactive=True)
    image = next((i for i in product.images if i.id == image_id), None)
    if image is None:
        raise NotFound("Photo not found")
    path = image.path
    product.images.remove(image)  # delete-orphan cascade deletes the row
    _renumber(product)
    session.commit()
    # After the commit: the user's request has succeeded even if the file cleanup fails.
    delete_quietly(storage, [path])
    return product


def reorder_images(session: Session, product_id: uuid.UUID, image_ids: list[uuid.UUID]) -> Product:
    product = catalogue.get_product(session, product_id, include_inactive=True)
    try:
        order = plan_reorder([i.id for i in product.images], image_ids)
    except ValueError as exc:
        raise BadRequest(str(exc)) from None
    by_id = {i.id: i for i in product.images}
    for position, image_id in enumerate(order):
        by_id[image_id].position = position
    product.images.sort(key=lambda i: i.position)  # keep the in-memory list in the new order
    session.commit()
    return product


def _renumber(product: Product) -> None:
    """Close gaps after a deletion so positions are always 0, 1, 2, ..."""
    for position, image in enumerate(sorted(product.images, key=lambda i: i.position)):
        image.position = position
