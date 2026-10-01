"""Catalogue business logic. Raises domain errors; knows nothing about HTTP."""
import uuid

from sqlalchemy.orm import Session

from app.core.errors import BadRequest, NotFound
from app.domain.pricing import check_prices
from app.integrations.storage import delete_quietly
from app.models.product import Product, ProductVariant
from app.repositories import products as repo
from app.schemas.product import ProductCreate, ProductUpdate, VariantIn


def create_product(session: Session, data: ProductCreate) -> Product:
    product = Product(
        name=data.name,
        description=data.description,
        pricing_mode=data.pricing_mode,
        price_kobo=data.price_kobo,
        is_active=data.is_active,
        variants=[
            ProductVariant(size=v.size, stock=v.stock, price_kobo=v.price_kobo, measurements=v.measurements)
            for v in data.variants
        ],
    )
    repo.add(session, product)
    session.commit()
    return product


def get_product(session: Session, product_id: uuid.UUID, *, include_inactive: bool = False) -> Product:
    product = repo.get(session, product_id)
    # Hidden products look exactly like missing ones to the public.
    if product is None or (not product.is_active and not include_inactive):
        raise NotFound("Product not found")
    return product


def list_products(
    session: Session, *, include_inactive: bool = False, limit: int = 50, offset: int = 0
) -> list[Product]:
    return repo.list_all(session, include_inactive=include_inactive, limit=limit, offset=offset)


def update_product(session: Session, product_id: uuid.UUID, data: ProductUpdate) -> Product:
    product = get_product(session, product_id, include_inactive=True)
    changes = data.model_dump(exclude_unset=True)
    if "price_kobo" in changes:
        # A partial update must not be able to create an inconsistent piece. Changing the
        # pricing mode, or prices per size, goes through replace_product / replace_variants.
        if product.pricing_mode != "single":
            raise BadRequest("This piece has a price per size; change the sizes' prices instead")
        if changes["price_kobo"] is None:
            raise BadRequest("The price cannot be empty")
    for field, value in changes.items():
        setattr(product, field, value)
    session.commit()
    return product


def replace_product(session: Session, product_id: uuid.UUID, data: ProductCreate) -> Product:
    """Replace everything about a piece in ONE transaction.

    Details, pricing mode, prices and sizes change together, so the piece is never left in a
    half-saved state (for example "per size" mode with no size prices yet). Fields the caller
    leaves out go back to their defaults: this is a full replacement, not a patch.
    """
    product = get_product(session, product_id, include_inactive=True)
    product.name = data.name
    product.description = data.description
    product.pricing_mode = data.pricing_mode
    product.price_kobo = data.price_kobo
    product.is_active = data.is_active
    _apply_variants(product, data.variants)
    session.commit()
    return product


def replace_variants(
    session: Session, product_id: uuid.UUID, variants: list[VariantIn]
) -> Product:
    """Upsert by size (stock, price and measurements); sizes not mentioned are removed."""
    product = get_product(session, product_id, include_inactive=True)
    try:
        check_prices(product.pricing_mode, product.price_kobo, [v.price_kobo for v in variants])
    except ValueError as exc:
        raise BadRequest(str(exc)) from None
    _apply_variants(product, variants)
    session.commit()
    return product


def _apply_variants(product: Product, variants: list[VariantIn]) -> None:
    wanted = {v.size: v for v in variants}  # sizes are unique: the schema guarantees it
    existing = {v.size: v for v in product.variants}

    for size, variant in existing.items():
        if size not in wanted:
            product.variants.remove(variant)  # delete-orphan cascade deletes the row
        else:
            variant.stock = wanted[size].stock
            variant.price_kobo = wanted[size].price_kobo
            variant.measurements = wanted[size].measurements  # replace, don't mutate in place
    for size, incoming in wanted.items():
        if size not in existing:
            product.variants.append(
                ProductVariant(
                    size=size,
                    stock=incoming.stock,
                    price_kobo=incoming.price_kobo,
                    measurements=incoming.measurements,
                )
            )


def delete_product(session: Session, product_id: uuid.UUID, storage=None) -> None:
    """Delete a product; its variant and image rows go with it (database cascade).

    When a storage adapter is given, the product's stored photos are removed afterwards on a
    best-effort basis: the product is already gone, so a storage failure is only logged.
    """
    product = get_product(session, product_id, include_inactive=True)
    paths = [image.path for image in product.images]
    repo.delete(session, product)
    session.commit()
    if storage is not None:
        delete_quietly(storage, paths)
