// Pure display rules for the cart. The server decides what is allowed and what things cost;
// these only turn its answers into messages and button states.
import { formatNaira } from './money.js';

const DEFAULT_CEILING = 10;

/**
 * Messages to show under a cart line: a problem the server found (sold out, stock dropped, a
 * lowered limit) and/or a price that changed since the shopper last saw it.
 *
 * @returns {{kind: 'problem' | 'price', text: string}[]} problems first
 */
export const lineNotices = (line) => {
  const notices = [];
  if (line.problem) notices.push({ kind: 'problem', text: line.problem_message ?? 'This item needs your attention.' });
  if (line.price_changed_from_kobo !== null && line.price_changed_from_kobo !== undefined) {
    notices.push({
      kind: 'price',
      text: `Price changed from ${formatNaira(line.price_changed_from_kobo)} to ${formatNaira(line.unit_price_kobo)} since you added it.`,
    });
  }
  return notices;
};

/** Which of the - / + buttons work. A line holding too many can always be reduced. */
export const stepperState = (line) => ({
  canDecrease: line.quantity > 1,
  canIncrease: line.quantity < line.available_quantity,
});

/** Checkout is closed for a missing or empty cart, or while any line has a problem. */
export const checkoutBlocked = (cart) => !cart || cart.lines.length === 0 || cart.has_problems;

/**
 * The most of this size the shopper can ask for on the product page: the smallest of the stock,
 * the owner's per-order limit and the per-line ceiling (published by the server). This only
 * sizes the quantity picker; the server re-checks everything, including what is already held.
 */
export const maxQuantityFor = (product, variant, ceiling) =>
  Math.max(0, Math.min(variant.stock, product.max_per_order ?? Infinity, ceiling ?? DEFAULT_CEILING));

/**
 * What the product page's add-to-cart area should be doing.
 * `signedIn` is true / false, or null while the session is still loading.
 *
 * @returns {{kind: 'wait' | 'signin' | 'sold_out' | 'choose_size'} | {kind: 'ready', max: number}}
 */
export const addToCartState = ({ signedIn, product, variant, ceiling, soldOut = false }) => {
  if (signedIn === null) return { kind: 'wait' };
  if (!signedIn) return { kind: 'signin' };
  if (!variant) return { kind: soldOut ? 'sold_out' : 'choose_size' };
  const max = maxQuantityFor(product, variant, ceiling);
  return max === 0 ? { kind: 'sold_out' } : { kind: 'ready', max };
};

/** "ONE_SIZE" -> "One size"; other size codes are already readable ("M", "XL"). */
export const sizeText = (size) => (size === 'ONE_SIZE' ? 'One size' : size);
