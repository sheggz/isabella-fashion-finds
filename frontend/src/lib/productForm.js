// Pure rules for the owner's product form: form values <-> API payload. No DOM in here, so
// every validation rule is unit-tested. Inputs are plain text exactly as typed.
import { koboToInput, nairaToKobo } from './money.js';

const MAX_MEASUREMENT = 300;

const blankSize = () => ({ enabled: false, stock: '', measurements: {} });

/** A fresh form: visible in the shop, every size switched off. */
export const emptyForm = (options) => ({
  name: '',
  description: '',
  price: '',
  isActive: true,
  sizes: Object.fromEntries(options.sizes.map((s) => [s.value, blankSize()])),
});

/** Fill the form from a saved product. Gives one row per fixed size so any can be switched on. */
export const productToForm = (product, options) => {
  const form = emptyForm(options);
  form.name = product.name;
  form.description = product.description ?? '';
  form.price = koboToInput(product.price_kobo);
  form.isActive = product.is_active;
  for (const variant of product.variants ?? []) {
    form.sizes[variant.size] = {
      enabled: true,
      stock: String(variant.stock),
      measurements: Object.fromEntries(Object.entries(variant.measurements ?? {}).map(([k, v]) => [k, String(v)])),
    };
  }
  return form;
};

/**
 * Validate the form and build the API payload.
 *
 * Returns `{ ok: true, value: { product, variants } }` or `{ ok: false, errors }`, where
 * `errors` maps a field key (`name`, `price`, `sizes`, `size.M.stock`, `size.M.bust`) to a
 * message. ALL problems are collected so the owner can fix them in one go.
 *
 * Only sizes that are switched on are looked at, so leftover text in a switched-off size
 * cannot block saving. Sizes are emitted in the store's order, not the order of the form.
 * The server validates again; this exists for instant, specific feedback.
 */
export const formToPayload = (form, options) => {
  const errors = {};

  const name = form.name.trim();
  if (!name) errors.name = 'Give the piece a name.';
  else if (name.length > 200) errors.name = 'The name is too long (200 characters at most).';

  const priceKobo = nairaToKobo(form.price);
  if (priceKobo === null) errors.price = 'Enter a valid price, like 15000 or 15,000.50.';

  const variants = [];
  for (const { value: size } of options.sizes) {
    const row = form.sizes[size];
    if (!row?.enabled) continue;

    const stockText = String(row.stock).trim();
    if (!/^\d+$/.test(stockText)) errors[`size.${size}.stock`] = 'Stock must be a whole number, 0 or more.';

    const measurements = {};
    for (const part of options.measurement_parts) {
      const text = String(row.measurements?.[part.value] ?? '').trim();
      if (text === '') continue;
      const number = /^\d+(\.\d+)?$/.test(text) ? Number(text) : NaN;
      if (!(number > 0 && number <= MAX_MEASUREMENT)) {
        errors[`size.${size}.${part.value}`] = `${part.label} must be a number between 0 and ${MAX_MEASUREMENT} ${options.unit ?? 'cm'}.`;
      } else {
        measurements[part.value] = number;
      }
    }
    variants.push({ size, stock: Number(stockText), measurements });
  }
  if (variants.length === 0) errors.sizes = 'Offer at least one size.';

  if (Object.keys(errors).length > 0) return { ok: false, errors };

  return {
    ok: true,
    value: {
      product: { name, description: form.description.trim() || null, price_kobo: priceKobo, is_active: form.isActive },
      variants,
    },
  };
};
