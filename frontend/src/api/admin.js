// Owner-only endpoints. The server enforces the owner role; these are just the calls.
import { api } from './client.js';

const id = encodeURIComponent;

export const listAdminProducts = () => api('/admin/products');

export const getAdminProduct = (productId) => api(`/admin/products/${id(productId)}`);

export const createProduct = (body) => api('/products', { method: 'POST', json: body });

export const updateProduct = (productId, patch) => api(`/products/${id(productId)}`, { method: 'PATCH', json: patch });

export const replaceVariants = (productId, variants) =>
  api(`/products/${id(productId)}/variants`, { method: 'PUT', json: variants });

export const deleteProduct = (productId) => api(`/products/${id(productId)}`, { method: 'DELETE' });

export const uploadImage = (productId, file) => {
  const body = new FormData();
  body.append('file', file);
  return api(`/products/${id(productId)}/images`, { method: 'POST', body });
};

export const deleteImage = (productId, imageId) =>
  api(`/products/${id(productId)}/images/${id(imageId)}`, { method: 'DELETE' });

export const reorderImages = (productId, imageIds) =>
  api(`/products/${id(productId)}/images/order`, { method: 'PUT', json: { image_ids: imageIds } });
