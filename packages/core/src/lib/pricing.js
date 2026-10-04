// Pure display rules for prices. They only DISPLAY what the server computed (the server is the
// authority on every price): the browser never works out a discount itself.
import { formatWhen } from './time.js';

/**
 * What a card or listing should show for a piece.
 * `prefix` is "From " when sizes cost different amounts; `original` is set only during a sale
 * and is the price to strike through.
 *
 * @returns {{prefix: string, current: number | null, original: number | null}}
 */
export const priceDisplay = (product) => {
  const onSale = product.sale_price_kobo !== null && product.sale_price_kobo !== undefined;
  return {
    prefix: product.price_varies ? 'From ' : '',
    current: onSale ? product.sale_price_kobo : (product.price_kobo ?? null),
    original: onSale ? (product.price_kobo ?? null) : null,
  };
};

/** The same for one size. */
export const variantPriceDisplay = (variant) => {
  const onSale = variant.sale_price_kobo !== null && variant.sale_price_kobo !== undefined;
  return { current: onSale ? variant.sale_price_kobo : variant.price_kobo, original: onSale ? variant.price_kobo : null };
};

/** Whole-percent saving for a "-10%" badge; 0 when there is nothing worth announcing. */
export const percentOff = (base, sale) => {
  if (!Number.isInteger(base) || !Number.isInteger(sale) || base <= 0 || sale >= base) return 0;
  return Math.round(((base - sale) / base) * 100);
};

/** "Weekend sale · ends 3 Oct 2026, 6:00 pm" in the shopper's zone ("" when no discount). */
export const discountNote = (discount, tzOffsetMinutes) =>
  discount ? `${discount.name} · ends ${formatWhen(discount.ends_at, tzOffsetMinutes)}` : '';
