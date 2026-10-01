// Pure time helpers. The timezone offset is always passed IN (minutes behind UTC, exactly what
// `new Date().getTimezoneOffset()` returns), so these give the same answer on every machine
// and can be tested without depending on where the tests run.

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const pad = (n) => String(n).padStart(2, '0');

/** Shift a UTC instant to the viewer's wall clock. Returns a Date whose *UTC* fields read as local time. */
const toWall = (iso, tzOffsetMinutes) => {
  const ms = typeof iso === 'string' ? Date.parse(iso) : NaN;
  return Number.isNaN(ms) ? null : new Date(ms - tzOffsetMinutes * 60000);
};

/**
 * UTC ISO string -> the value an `<input type="datetime-local">` expects ("2026-10-01T13:00").
 * @returns {string} "" for anything that is not a valid date
 */
export const toLocalInputValue = (iso, tzOffsetMinutes) => {
  const d = toWall(iso, tzOffsetMinutes);
  if (!d) return '';
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}T${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`;
};

/**
 * The value of a datetime-local box -> a UTC ISO string for the API, or null if invalid.
 *
 * The check that the pieces survive a round trip matters: `Date.UTC` silently "rolls over"
 * nonsense like month 13 or day 45 into a later real date, so without it a typo would turn into
 * a different, valid-looking moment instead of being refused.
 */
export const fromLocalInputValue = (value, tzOffsetMinutes) => {
  const m = typeof value === 'string' ? /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(value) : null;
  if (!m) return null;
  const [y, mo, d, h, mi] = m.slice(1).map(Number);
  const wall = new Date(Date.UTC(y, mo - 1, d, h, mi));
  const same = wall.getUTCFullYear() === y && wall.getUTCMonth() === mo - 1 && wall.getUTCDate() === d
    && wall.getUTCHours() === h && wall.getUTCMinutes() === mi;
  if (!same) return null;
  return new Date(wall.getTime() + tzOffsetMinutes * 60000).toISOString();
};

/** "3 Oct 2026, 5:05 pm" in the viewer's zone ("" for invalid input). 12 am is midnight, 12 pm noon. */
export const formatWhen = (iso, tzOffsetMinutes) => {
  const d = toWall(iso, tzOffsetMinutes);
  if (!d) return '';
  const hours = d.getUTCHours();
  const clock = `${hours % 12 || 12}:${pad(d.getUTCMinutes())} ${hours < 12 ? 'am' : 'pm'}`;
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}, ${clock}`;
};
