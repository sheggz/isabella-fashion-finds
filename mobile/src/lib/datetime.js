// The phone's date pickers deal in Date objects; the shared discount form (@isabella/core) deals
// in "YYYY-MM-DDTHH:mm" text in the owner's local time. These two convert between them using the
// device's own clock (the same wall-clock numbers the owner sees on the picker).
const pad = (n) => String(n).padStart(2, '0');

export const dateToLocalInput = (d) =>
  `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;

export const localInputToDate = (text) => {
  const m = typeof text === 'string' ? /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(text) : null;
  if (!m) return null;
  const [y, mo, d, h, mi] = m.slice(1).map(Number);
  const date = new Date(y, mo - 1, d, h, mi);
  // `new Date` rolls month 13 / day 45 over into a different real date; refuse that instead.
  const same = date.getFullYear() === y && date.getMonth() === mo - 1 && date.getDate() === d && date.getHours() === h && date.getMinutes() === mi;
  return same ? date : null;
};
