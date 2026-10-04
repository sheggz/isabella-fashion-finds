import { formatNaira } from '@isabella/core';
import { el } from './dom.js';

/**
 * A price line from the display rules in @isabella/core (lib/pricing.js): optional "From " prefix, the original
 * price struck through during a sale, then the price to pay.
 *
 * @param {{prefix: string, current: number | null, original: number | null}} display
 */
export const priceNode = ({ prefix, current, original }, className = 'price') =>
  el(
    'p',
    { className },
    prefix,
    original !== null && el('s', { className: 'was', textContent: formatNaira(original) }),
    original !== null && ' ',
    el('span', { className: 'now', textContent: formatNaira(current) }),
  );
