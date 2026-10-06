// Owner-only endpoints. The server enforces the owner role; these are just the calls.
import { createAdminApi } from '@isabella/core';
import { api } from './client.js';

export const {
  getDashboard, listAdminProducts, getAdminProduct, createProduct, saveProduct, deleteProduct,
  uploadImage, deleteImage, reorderImages,
  listDiscounts, createDiscount, replaceDiscount, deleteDiscount,
} = createAdminApi(api);
