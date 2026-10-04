// Pure rules for the owner's discount form: form values <-> API payload. No DOM in here, so
// every rule is unit-tested. Times are typed in the owner's local time; the zone offset is passed
// in (minutes behind UTC) so the conversion to the UTC instants the API stores is exact.
import { formatNaira, koboToInput, nairaToKobo } from './money.js';
import { formatWhen, fromLocalInputValue, toLocalInputValue } from './time.js';

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

export const STATUS_LABELS = { live: 'Live', scheduled: 'Scheduled', ended: 'Ended', disabled: 'Disabled' };

/** A fresh form: a percentage off every piece, starting now and running for a week. */
export const emptyDiscountForm = (nowMs, tzOffsetMinutes) => ({
  name: '',
  kind: 'percent',
  value: '',
  scope: 'all',
  productIds: [],
  startsAt: toLocalInputValue(new Date(nowMs).toISOString(), tzOffsetMinutes),
  endsAt: toLocalInputValue(new Date(nowMs + WEEK_MS).toISOString(), tzOffsetMinutes),
  isEnabled: true,
});

/** Fill the form from a saved discount (as the API returns it). */
export const discountToForm = (d, tzOffsetMinutes) => ({
  name: d.name,
  kind: d.kind,
  value: d.kind === 'percent' ? String(d.percent) : koboToInput(d.amount_kobo),
  scope: d.applies_to_all ? 'all' : 'selected',
  productIds: [...d.product_ids],
  startsAt: toLocalInputValue(d.starts_at, tzOffsetMinutes),
  endsAt: toLocalInputValue(d.ends_at, tzOffsetMinutes),
  isEnabled: d.is_enabled,
});

/**
 * Validate the form and build the API payload, or collect every problem per field:
 * `{ ok: true, value }` or `{ ok: false, errors }` (keys: name, value, products, startsAt, endsAt).
 *
 * Only the value that matches the kind is sent (a percentage OR an amount), and the pieces are
 * sent only when the discount is not for every piece. The server validates again.
 */
export const formToDiscountPayload = (form, tzOffsetMinutes) => {
  const errors = {};

  const name = form.name.trim();
  if (!name) errors.name = 'Give the discount a name; customers see it.';
  else if (name.length > 100) errors.name = 'The name is too long (100 characters at most).';

  let percent = null;
  let amountKobo = null;
  if (form.kind === 'percent') {
    const text = form.value.trim();
    percent = /^\d+(\.\d{1,2})?$/.test(text) ? Number(text) : NaN;
    if (!(percent > 0 && percent < 100)) errors.value = 'Enter a percentage above 0 and below 100, with at most two decimals.';
  } else {
    amountKobo = nairaToKobo(form.value);
    if (amountKobo === null || amountKobo <= 0) errors.value = 'Enter an amount in naira above zero, like 2000 or 2,500.50.';
  }

  const selected = form.scope === 'selected';
  if (selected && form.productIds.length === 0) {
    errors.products = 'Choose at least one piece, or apply the discount to every piece.';
  }

  const startsAt = fromLocalInputValue(form.startsAt, tzOffsetMinutes);
  const endsAt = fromLocalInputValue(form.endsAt, tzOffsetMinutes);
  if (startsAt === null) errors.startsAt = 'Choose a date and time.';
  if (endsAt === null) errors.endsAt = 'Choose a date and time.';
  if (startsAt !== null && endsAt !== null && Date.parse(endsAt) <= Date.parse(startsAt)) {
    errors.endsAt = 'The end must be after the start.';
  }

  if (Object.keys(errors).length > 0) return { ok: false, errors };

  return {
    ok: true,
    value: {
      name,
      kind: form.kind,
      ...(form.kind === 'percent' ? { percent } : { amount_kobo: amountKobo }),
      applies_to_all: !selected,
      product_ids: selected ? [...form.productIds] : [],
      starts_at: startsAt,
      ends_at: endsAt,
      is_enabled: form.isEnabled,
    },
  };
};

/** "10% off" / "₦2,500 off". */
export const describeDiscount = (d) => (d.kind === 'percent' ? `${d.percent}% off` : `${formatNaira(d.amount_kobo)} off`);

/** "Every piece" / "1 piece" / "3 pieces". */
export const appliesText = (d) => {
  if (d.applies_to_all) return 'Every piece';
  const n = d.product_ids.length;
  return `${n} ${n === 1 ? 'piece' : 'pieces'}`;
};

/** "1 Oct 2026, 1:00 pm → 8 Oct 2026, 1:00 pm" in the owner's zone. */
export const scheduleText = (d, tzOffsetMinutes) =>
  `${formatWhen(d.starts_at, tzOffsetMinutes)} → ${formatWhen(d.ends_at, tzOffsetMinutes)}`;
