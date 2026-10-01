// One function per backend endpoint. Pages call these, never `fetch` directly.
import { api } from './client.js';
import * as mocks from './mocks/products.js';

// `VITE_USE_MOCKS=true npm run dev` runs the UI against fake data, with no backend needed.
// Vite replaces `import.meta.env.X` at build time, so this is decided once, not per call.
const useMocks = import.meta.env?.VITE_USE_MOCKS === 'true';

export const listProducts = () => (useMocks ? mocks.listProducts() : api('/products'));

export const getProduct = (id) => (useMocks ? mocks.getProduct(id) : api(`/products/${encodeURIComponent(id)}`));
