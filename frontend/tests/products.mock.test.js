import { describe, it, expect } from 'vitest';
import { getProduct, listProducts } from '../src/api/mocks/products.js';

// These tests guard the CONTRACT: the mock must look exactly like the backend's ProductOut,
// otherwise the UI would work against fake data and then break against the real API.
const PRODUCT_KEYS = [
  'created_at', 'description', 'discount', 'id', 'images', 'is_active', 'name',
  'price_kobo', 'price_varies', 'pricing_mode', 'sale_price_kobo', 'variants',
];

describe('mock products api', () => {
  it('lists products shaped like the backend ProductOut', async () => {
    const products = await listProducts();
    expect(products.length).toBeGreaterThan(0);
    for (const p of products) {
      expect(Object.keys(p).sort()).toEqual(PRODUCT_KEYS);
      expect(Number.isInteger(p.price_kobo)).toBe(true); // money is integer kobo, never floats
      for (const v of p.variants) expect(Object.keys(v).sort()).toEqual(['measurements', 'price_kobo', 'sale_price_kobo', 'size', 'stock']);
      for (const i of p.images) expect(Object.keys(i).sort()).toEqual(['id', 'position', 'url']);
    }
  });

  it('includes a sold-out piece and a piece with no photo so those states can be seen', async () => {
    const products = await listProducts();
    expect(products.some((p) => p.variants.every((v) => v.stock === 0))).toBe(true);
    expect(products.some((p) => p.images.length === 0)).toBe(true);
  });

  it('includes a per-size piece and a piece on sale so those displays can be seen', async () => {
    const products = await listProducts();
    expect(products.some((p) => p.pricing_mode === 'per_size' && p.price_varies)).toBe(true);
    expect(products.some((p) => p.sale_price_kobo !== null && p.discount !== null)).toBe(true);
  });

  it('uses the same size codes the backend does (ONE_SIZE, not "One size")', async () => {
    const sizes = (await listProducts()).flatMap((p) => p.variants.map((v) => v.size));
    expect(sizes.every((s) => /^[A-Z_]+$/.test(s))).toBe(true);
  });

  it('gets one product by id', async () => {
    const [first] = await listProducts();
    expect(await getProduct(first.id)).toEqual(first);
  });

  it('rejects an unknown id with the same normalised error the real client throws', async () => {
    await expect(getProduct('nope')).rejects.toMatchObject({ status: 404, code: 'not_found' });
  });
});
