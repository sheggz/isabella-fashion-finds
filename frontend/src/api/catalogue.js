import { api } from './client.js';

/** The fixed sizes and measurement body parts, published by the backend (single source of truth). */
export const getCatalogueOptions = () => api('/catalogue/options');
