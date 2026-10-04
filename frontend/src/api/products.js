// The product endpoints, bound to the website's client. Pages call these, never `fetch` directly.
import { createProductsApi } from '@isabella/core';
import { api } from './client.js';
import * as mocks from './mocks/products.js';

// `VITE_USE_MOCKS=true npm run dev` runs the UI against fake data, with no backend needed.
// Vite replaces `import.meta.env.X` at build time, so this is decided once, not per call.
const useMocks = import.meta.env?.VITE_USE_MOCKS === 'true';
const real = createProductsApi(api);

export const listProducts = () => (useMocks ? mocks.listProducts() : real.listProducts());

export const getProduct = (id) => (useMocks ? mocks.getProduct(id) : real.getProduct(id));
