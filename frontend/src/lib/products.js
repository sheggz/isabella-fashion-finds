// Pure display rules for products. They read the API's product shape and never change it.

/** Photos in display order. Copies first: `Array.prototype.sort` sorts IN PLACE. */
export const sortedImages = (product) => [...(product.images ?? [])].sort((a, b) => a.position - b.position);

/** The cover photo (first by position), or null when the piece has none. */
export const coverImage = (product) => sortedImages(product)[0] ?? null;

/**
 * Sold out = it has sizes and every one of them has no stock. A piece with no sizes yet is NOT
 * reported as sold out: "nothing to buy" and "all gone" are different messages for a customer.
 */
export const isSoldOut = (product) => {
  const variants = product.variants ?? [];
  return variants.length > 0 && variants.every((v) => v.stock <= 0);
};

/**
 * Order sizes the way the store lists them (XS, S, M, ... One size). The database returns
 * variants in no promised order, so without this a size picker could show "M, XS, L, S".
 * Unknown sizes go last; if the list is unavailable the original order is kept.
 * Returns a new array.
 */
export const sortVariants = (variants, options) => {
  const order = options?.sizes?.map((s) => s.value);
  if (!order) return [...variants];
  const rank = (v) => {
    const i = order.indexOf(v.size);
    return i === -1 ? order.length : i;
  };
  return [...variants].sort((a, b) => rank(a) - rank(b));
};

/** The human label for a size code, using the options the backend published. */
export const sizeLabel = (options, value) =>
  options?.sizes?.find((s) => s.value === value)?.label ?? value;

const trimNumber = (n) => String(Number.isInteger(n) ? n : Number(n.toFixed(1)));

/**
 * Turn `{bust: 92, waist: 74.3}` into rows for display, in the order the backend lists the
 * body parts (not the order the owner happened to type them), skipping parts not provided.
 *
 * @returns {{label: string, text: string}[]}
 */
export const formatMeasurements = (measurements, options) => {
  const parts = options?.measurement_parts;
  if (!measurements || !parts) return [];
  const unit = options.unit ?? 'cm';
  return parts
    .filter((part) => measurements[part.value] !== undefined)
    .map((part) => ({ label: part.label, text: `${trimNumber(measurements[part.value])} ${unit}` }));
};
