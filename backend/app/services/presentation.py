"""Turn stored pieces and discounts into what the API returns, including computed prices.

The database holds base prices; what a customer pays RIGHT NOW also depends on live discounts,
so responses are assembled here from the pure rules in `app/domain/pricing.py` and never read
straight off the ORM object.
"""
from datetime import datetime, timezone

from sqlalchemy.orm import Session

from app.domain.pricing import DiscountInfo, product_pricing, quote_variant, status_of
from app.models.discount import Discount
from app.models.product import Product
from app.schemas.discount import DiscountOut
from app.schemas.product import DiscountBadge, ImageOut, ProductOut, VariantOut
from app.services import discounts as discounts_service


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
        sale_price_kobo=summary.sale_price_kobo,
        discount=(
            DiscountBadge(name=summary.discount.name, ends_at=summary.discount.ends_at)
            if summary.discount
            else None
        ),
        is_active=product.is_active,
        created_at=product.created_at,
        variants=[
            VariantOut(
                size=v.size,
                stock=v.stock,
                measurements=v.measurements,
                price_kobo=q.base_kobo,
                sale_price_kobo=q.final_kobo if q.discount else None,
            )
            for v, q in zip(product.variants, quotes, strict=True)
        ],
        images=[ImageOut.model_validate(image) for image in product.images],
    )


def present_one(session: Session, product: Product) -> ProductOut:
    now = datetime.now(timezone.utc)
    return present_product(product, discounts_service.live_candidates(session, now), now)


def present_many(session: Session, products: list[Product]) -> list[ProductOut]:
    # One clock reading and one discount query for the whole list, so every card in it is priced
    # consistently and the page does not make a query per piece.
    now = datetime.now(timezone.utc)
    discounts = discounts_service.live_candidates(session, now)
    return [present_product(p, discounts, now) for p in products]


def present_discount(discount: Discount, now: datetime | None = None) -> DiscountOut:
    now = now or datetime.now(timezone.utc)
    info = discounts_service.to_info(discount)
    return DiscountOut(
        id=discount.id,
        name=discount.name,
        kind=discount.kind,
        percent=discount.percent_bp / 100 if discount.percent_bp is not None else None,
        amount_kobo=discount.amount_kobo,
        applies_to_all=discount.applies_to_all,
        product_ids=[p.id for p in discount.products],
        starts_at=info.starts_at,
        ends_at=info.ends_at,
        is_enabled=discount.is_enabled,
        status=status_of(info, now),
        created_at=discounts_service.as_utc(discount.created_at),
    )
