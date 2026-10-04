import { createCatalogueApi } from '@isabella/core';
import { api } from './client.js';

/** The fixed sizes, body parts, photo rules and cart ceiling, published by the backend. */
export const { getCatalogueOptions } = createCatalogueApi(api);
