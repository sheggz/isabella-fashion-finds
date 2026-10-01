// Owner-only endpoints. The server enforces the owner role; these are just the calls.
import { api } from './client.js';

const id = encodeURIComponent;

// ---- pieces
export const listAdminProducts = () => api('/admin/products');

export const getAdminProduct = (productId) => api(`/admin/products/${id(productId)}`);

export const createProduct = (body) => api('/products', { method: 'POST', json: body });

/** Replace the whole piece (details, pricing mode, prices and sizes) in ONE atomic request. */
export const saveProduct = (productId, body) => api(`/products/${id(productId)}`, { method: 'PUT', json: body });

export const deleteProduct = (productId) => api(`/products/${id(productId)}`, { method: 'DELETE' });

// ---- photos
export const uploadImage = (productId, file) => {
  const body = new FormData();
  body.append('file', file);
  return api(`/products/${id(productId)}/images`, { method: 'POST', body });
};

export const deleteImage = (productId, imageId) =>
  api(`/products/${id(productId)}/images/${id(imageId)}`, { method: 'DELETE' });

export const reorderImages = (productId, imageIds) =>
  api(`/products/${id(productId)}/images/order`, { method: 'PUT', json: { image_ids: imageIds } });

// ---- discounts
export const listDiscounts = () => api('/admin/discounts');

export const createDiscount = (body) => api('/admin/discounts', { method: 'POST', json: body });

export const replaceDiscount = (discountId, body) => api(`/admin/discounts/${id(discountId)}`, { method: 'PUT', json: body });

export const deleteDiscount = (discountId) => api(`/admin/discounts/${id(discountId)}`, { method: 'DELETE' });
