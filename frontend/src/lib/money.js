// Pure money helpers. The backend stores prices as integer kobo (1 naira = 100 kobo) and the
// browser only ever DISPLAYS prices; the server computes every real price.

const group = (n) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ',');

/**
 * Format integer kobo for display: 150000 -> "₦1,500", 150050 -> "₦1,500.50".
 * Anything that is not a non-negative integer returns "—" rather than inventing a price.
 *
 * @param {number} kobo
 * @returns {string}
 */
export const formatNaira = (kobo) => {
  if (!Number.isInteger(kobo) || kobo < 0) return '—';
  const naira = Math.floor(kobo / 100);
  const rest = kobo % 100;
  return rest === 0 ? `₦${group(naira)}` : `₦${group(naira)}.${String(rest).padStart(2, '0')}`;
};

/**
 * Convert what an owner types ("1,500.50") into integer kobo, or null if it is not a plain
 * amount with at most two decimals.
 *
 * Why the text is split instead of doing `parseFloat(text) * 100`: floating point cannot
 * represent most decimals exactly, so 19.99 * 100 is 1998.9999999999998 and rounding errors
 * would silently change a price. Working on the digits as integers avoids that entirely.
 *
 * @param {string} text
 * @returns {number | null}
 */
export const nairaToKobo = (text) => {
  if (typeof text !== 'string') return null;
  const cleaned = text.replace(/[,\s]/g, '');
  if (!/^\d+(\.\d{1,2})?$/.test(cleaned)) return null;
  const [naira, decimals = ''] = cleaned.split('.');
  return Number(naira) * 100 + Number(decimals.padEnd(2, '0'));
};
