"""Turn stored pieces into what the API returns, including computed prices.

The database holds base prices; what a customer pays RIGHT NOW also depends on live discounts,
so responses are assembled here from the pure rules in `app/domain/pricing.py` and never read
straight off the ORM object.
"""
from datetime import datetime, timezone

from sqlalchemy.orm import Session

from app.domain.pricing import DiscountInfo, product_pricing, quote_variant
from app.models.product import Product
from app.schemas.product import ImageOut, ProductOut, VariantOut


def present_product(
    product: Product, discounts: list[DiscountInfo] | None = None, now: datetime | None = None
) -> ProductOut:
    """Build the API shape for one piece. `now` and `discounts` are inputs, not looked up here."""
    now = now or datetime.now(timezone.utc)
    discounts = discounts or []
    quotes = [
        quote_variant(product.pricing_mode, product.price_kobo, v.price_kobo, product.id, discounts, now)
        for v in product.variants
    ]
    summary = product_pricing(quotes)
    return ProductOut(
        id=product.id,
        name=product.name,
        description=product.description,
        pricing_mode=product.pricing_mode,
        price_kobo=summary.from_price_kobo,
        price_varies=summary.price_varies,
        is_active=product.is_active,
        created_at=product.created_at,
        variants=[
            VariantOut(size=v.size, stock=v.stock, measurements=v.measurements, price_kobo=q.base_kobo)
            for v, q in zip(product.variants, quotes, strict=True)
        ],
        images=[ImageOut.model_validate(image) for image in product.images],
    )


def present_one(session: Session, product: Product) -> ProductOut:
    return present_product(product, _live_discounts(session))


def present_many(session: Session, products: list[Product]) -> list[ProductOut]:
    discounts = _live_discounts(session)  # one query for the whole list, not one per piece
    return [present_product(p, discounts) for p in products]


def _live_discounts(session: Session) -> list[DiscountInfo]:
    return []  # discounts arrive in the next step
