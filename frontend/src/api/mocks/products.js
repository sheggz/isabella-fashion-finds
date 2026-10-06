// Fake backend for the product endpoints. Same function names and same data shape as
// ../products.js, so a page cannot tell the difference. Used when VITE_USE_MOCKS=true.
// The shape mirrors the backend's `ProductOut` (backend/app/schemas/product.py); if that
// schema changes, update this file too (tests/products.mock.test.js checks the keys).
import { networkError } from '@isabella/core';

const photo = (seed) => `https://picsum.photos/seed/${seed}/600/800`;

const PRODUCTS = [
  {
    id: 'mock-1',
    name: 'Ankara Wrap Dress',
    description: 'Hand-cut Ankara wrap dress.',
    pricing_mode: 'single', // one price for every size
    price_kobo: 1500000, // ₦15,000: integer kobo, never a float
    price_varies: false,
    sale_price_kobo: null,
    discount: null,
    max_per_order: null,
    is_active: true,
    created_at: '2026-09-01T10:00:00Z',
    variants: [
      { id: 'mock-v1', size: 'S', stock: 2, price_kobo: 1500000, sale_price_kobo: null, measurements: { bust: 86 } },
      { id: 'mock-v2', size: 'M', stock: 5, price_kobo: 1500000, sale_price_kobo: null, measurements: { bust: 92 } },
    ],
    images: [{ id: 'mock-i1', position: 0, url: photo('ankara') }],
  },
  {
    id: 'mock-2',
    name: 'Sold-out Gown', // lets you see the "Sold out" badge
    description: null,
    pricing_mode: 'single',
    price_kobo: 2500050,
    price_varies: false,
    sale_price_kobo: null,
    discount: null,
    max_per_order: null,
    is_active: true,
    created_at: '2026-09-02T10:00:00Z',
    variants: [{ id: 'mock-v3', size: 'M', stock: 0, price_kobo: 2500050, sale_price_kobo: null, measurements: {} }],
    images: [{ id: 'mock-i2', position: 0, url: photo('gown') }],
  },
  {
    id: 'mock-3',
    name: 'Piece With No Photo Yet', // lets you see the placeholder
    description: null,
    pricing_mode: 'single',
    price_kobo: 900000,
    price_varies: false,
    sale_price_kobo: null,
    discount: null,
    max_per_order: null,
    is_active: true,
    created_at: '2026-09-03T10:00:00Z',
    variants: [{ id: 'mock-v4', size: 'ONE_SIZE', stock: 3, price_kobo: 900000, sale_price_kobo: null, measurements: {} }],
    images: [],
  },
  {
    id: 'mock-4',
    name: 'Lace Gown (price per size)', // lets you see "From" and size-dependent prices
    description: 'Each size is priced separately.',
    pricing_mode: 'per_size',
    price_kobo: 1800000, // the "from" price: the cheapest size
    price_varies: true,
    sale_price_kobo: null,
    discount: null,
    max_per_order: null,
    is_active: true,
    created_at: '2026-09-04T10:00:00Z',
    variants: [
      { id: 'mock-v5', size: 'S', stock: 1, price_kobo: 1800000, sale_price_kobo: null, measurements: {} },
      { id: 'mock-v6', size: 'L', stock: 2, price_kobo: 2200000, sale_price_kobo: null, measurements: {} },
    ],
    images: [{ id: 'mock-i4', position: 0, url: photo('lace') }],
  },
  {
    id: 'mock-5',
    name: 'Adire Skirt (on sale)', // lets you see struck-through prices and the sale note
    description: 'Hand-dyed adire.',
    pricing_mode: 'single',
    price_kobo: 1000000,
    price_varies: false,
    sale_price_kobo: 800000,
    discount: { name: 'Weekend sale', ends_at: '2030-01-01T12:00:00Z' },
    max_per_order: 2, // lets you see the limit note
    is_active: true,
    created_at: '2026-09-05T10:00:00Z',
    variants: [{ id: 'mock-v7', size: 'M', stock: 4, price_kobo: 1000000, sale_price_kobo: 800000, measurements: {} }],
    images: [{ id: 'mock-i5', position: 0, url: photo('adire') }],
  },
];

// Filler pieces so the landing page and shop look full while previewing. Generated, not hand
// written: names, prices and photos come from small lists, so adding more is changing a number.
const FILLER_NAMES = ['Linen Wrap Top', 'Tailored Trousers', 'Silk Slip Dress', 'Cotton Shirt Dress', 'Pleated Midi Skirt', 'Cropped Blazer', 'Knit Cardigan', 'Satin Camisole'];
const fillerPiece = (name, index) => ({
  id: `mock-f${index + 1}`,
  name,
  description: 'Soft, easy to style and made to last. (Filler text for previewing.)',
  pricing_mode: 'single',
  price_kobo: (800 + index * 175) * 1000,
  price_varies: false,
  sale_price_kobo: null,
  discount: null,
  max_per_order: null,
  is_active: true,
  created_at: `2026-09-${String(10 + index).padStart(2, '0')}T10:00:00Z`,
  variants: ['S', 'M', 'L'].map((size, n) => ({ id: `mock-fv${index}-${n}`, size, stock: 1 + ((index + n) % 4), price_kobo: (800 + index * 175) * 1000, sale_price_kobo: null, measurements: {} })),
  images: [{ id: `mock-fi${index + 1}`, position: 0, url: photo(`filler-${index + 1}`) }],
});
PRODUCTS.push(...FILLER_NAMES.map(fillerPiece));

/** Pretend the network takes a moment, so loading states are actually visible. */
const later = (value, ms = 400) => new Promise((resolve) => setTimeout(() => resolve(value), ms));

// structuredClone: hand out copies so a page that mutates its data cannot corrupt the fake "database".
export const listProducts = () => later(structuredClone(PRODUCTS));

export const getProduct = async (id) => {
  const found = PRODUCTS.find((p) => p.id === id);
  if (!found) {
    // Reject with the same normalised shape the real client throws (see @isabella/core, api/apiError.js).
    await later(null);
    throw { status: 404, code: 'not_found', message: 'Product not found', details: null, requestId: null };
  }
  return later(structuredClone(found));
};

// Handy for trying the error screen: import and call from the console, or swap into listProducts.
export const failingListProducts = () => Promise.reject(networkError());
