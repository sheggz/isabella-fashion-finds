// One function per backend endpoint. Pages call these, never `fetch` directly.
import { api } from './client.js';

export const listProducts = () => api('/products');

export const getProduct = (id) => api(`/products/${encodeURIComponent(id)}`);
