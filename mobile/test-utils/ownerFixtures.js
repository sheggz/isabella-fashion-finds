// Shared fixtures for the owner-screen tests (not a test file itself).
export const options = {
  sizes: [{ value: 'S', label: 'S' }, { value: 'M', label: 'M' }],
  measurement_parts: [{ value: 'bust', label: 'Bust' }],
  unit: 'cm',
  images: { max_bytes: 5 * 1024 * 1024, types: ['image/jpeg', 'image/png', 'image/webp'], max_per_product: 3 },
  cart: { max_per_line: 10 },
};

export const product = (over = {}) => ({
  id: 'p1', name: 'Ankara Dress', description: 'Nice', pricing_mode: 'single', price_kobo: 1500000, price_varies: false,
  sale_price_kobo: null, discount: null, max_per_order: null, is_active: true,
  variants: [{ id: 'v1', size: 'M', stock: 4, price_kobo: 1500000, sale_price_kobo: null, measurements: { bust: 90 } }],
  images: [{ id: 'i1', position: 0, url: 'https://cdn.test/1.png' }, { id: 'i2', position: 1, url: 'https://cdn.test/2.png' }],
  ...over,
});
