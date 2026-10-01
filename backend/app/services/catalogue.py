"""Catalogue business logic. Raises domain errors; knows nothing about HTTP."""
import uuid

from sqlalchemy.orm import Session

from app.core.errors import NotFound
from app.models.product import Product, ProductVariant
from app.repositories import products as repo
from app.schemas.product import ProductCreate, ProductUpdate, VariantIn


def create_product(session: Session, data: ProductCreate) -> Product:
    product = Product(
        name=data.name,
        description=data.description,
        price_kobo=data.price_kobo,
        is_active=data.is_active,
        variants=[
            ProductVariant(size=v.size, stock=v.stock, measurements=v.measurements)
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
    for field, value in data.model_dump(exclude_unset=True).items():
        setattr(product, field, value)
    session.commit()
    return product


def replace_variants(
    session: Session, product_id: uuid.UUID, variants: list[VariantIn]
) -> Product:
    """Upsert by size (stock and measurements); sizes not mentioned are removed."""
    product = get_product(session, product_id, include_inactive=True)
    wanted = {v.size: v for v in variants}  # sizes are unique: the schema guarantees it
    existing = {v.size: v for v in product.variants}

    for size, variant in existing.items():
        if size not in wanted:
            product.variants.remove(variant)  # delete-orphan cascade deletes the row
        else:
            variant.stock = wanted[size].stock
            variant.measurements = wanted[size].measurements  # replace, don't mutate in place
    for size, incoming in wanted.items():
        if size not in existing:
            product.variants.append(
                ProductVariant(size=size, stock=incoming.stock, measurements=incoming.measurements)
            )
    session.commit()
    return product


def delete_product(session: Session, product_id: uuid.UUID) -> None:
    product = get_product(session, product_id, include_inactive=True)
    repo.delete(session, product)
    session.commit()
