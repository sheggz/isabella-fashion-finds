// Pure rules for the owner's product form: form values <-> API payload. No DOM in here, so
// every validation rule is unit-tested. Inputs are plain text exactly as typed.
import { koboToInput, nairaToKobo } from './money.js';

const MAX_MEASUREMENT = 300;

const blankSize = () => ({ enabled: false, stock: '', price: '', measurements: {} });

/** A fresh form: visible in the shop, one price for every size, every size switched off. */
export const emptyForm = (options) => ({
  name: '',
  description: '',
  pricingMode: 'single',
  price: '',
  maxPerOrder: '',
  isActive: true,
  sizes: Object.fromEntries(options.sizes.map((s) => [s.value, blankSize()])),
});

/** Fill the form from a saved product. Gives one row per fixed size so any can be switched on. */
export const productToForm = (product, options) => {
  const form = emptyForm(options);
  const perSize = product.pricing_mode === 'per_size';
  form.name = product.name;
  form.description = product.description ?? '';
  form.pricingMode = perSize ? 'per_size' : 'single';
  form.price = perSize ? '' : koboToInput(product.price_kobo);
  form.maxPerOrder = product.max_per_order === null || product.max_per_order === undefined ? '' : String(product.max_per_order);
  form.isActive = product.is_active;
  for (const variant of product.variants ?? []) {
    form.sizes[variant.size] = {
      enabled: true,
      stock: String(variant.stock),
      price: perSize ? koboToInput(variant.price_kobo) : '',
      measurements: Object.fromEntries(Object.entries(variant.measurements ?? {}).map(([k, v]) => [k, String(v)])),
    };
  }
  return form;
};

/**
 * Validate the form and build the API payload (the same shape for create and for "save piece").
 *
 * Returns `{ ok: true, value }` or `{ ok: false, errors }`, where `errors` maps a field key
 * (`name`, `price`, `maxPerOrder`, `sizes`, `size.M.stock`, `size.M.price`, `size.M.bust`) to a message. ALL
 * problems are collected so the owner can fix them in one go.
 *
 * Pricing: in "single" mode only the piece price is read and size prices are ignored; in
 * "per_size" mode only the size prices are read and the piece price is sent as null. Whatever
 * is typed in the box that is not in use can therefore never block saving or leak into the
 * payload. Only sizes that are switched on are looked at, and sizes are emitted in the store's
 * order. The server validates again; this exists for instant, specific feedback.
 */
export const formToPayload = (form, options) => {
  const errors = {};
  const perSize = form.pricingMode === 'per_size';

  const name = form.name.trim();
  if (!name) errors.name = 'Give the piece a name.';
  else if (name.length > 200) errors.name = 'The name is too long (200 characters at most).';

  let pieceKobo = null;
  if (!perSize) {
    pieceKobo = nairaToKobo(form.price);
    if (pieceKobo === null) errors.price = 'Enter a valid price, like 15000 or 15,000.50.';
  }

  // Optional: how many of this piece (all sizes together) one order may contain.
  let maxPerOrder = null;
  const limitText = String(form.maxPerOrder ?? '').trim();
  if (limitText !== '') {
    maxPerOrder = /^\d+$/.test(limitText) ? Number(limitText) : NaN;
    if (!(maxPerOrder >= 1 && maxPerOrder <= 100)) {
      errors.maxPerOrder = 'The limit per order must be a whole number from 1 to 100, or blank for no limit.';
    }
  }

  const variants = [];
  for (const { value: size, label } of options.sizes) {
    const row = form.sizes[size];
    if (!row?.enabled) continue;

    const stockText = String(row.stock).trim();
    if (!/^\d+$/.test(stockText)) errors[`size.${size}.stock`] = 'Stock must be a whole number, 0 or more.';

    let sizeKobo = null;
    if (perSize) {
      sizeKobo = nairaToKobo(row.price ?? '');
      if (sizeKobo === null) errors[`size.${size}.price`] = `Enter a valid price for ${label}, like 15000 or 15,000.50.`;
    }

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
    variants.push({ size, stock: Number(stockText), ...(perSize ? { price_kobo: sizeKobo } : {}), measurements });
  }
  if (variants.length === 0) errors.sizes = 'Offer at least one size.';

  if (Object.keys(errors).length > 0) return { ok: false, errors };

  return {
    ok: true,
    value: {
      name,
      description: form.description.trim() || null,
      pricing_mode: perSize ? 'per_size' : 'single',
      price_kobo: perSize ? null : pieceKobo,
      max_per_order: maxPerOrder,
      is_active: form.isActive,
      variants,
    },
  };
};
