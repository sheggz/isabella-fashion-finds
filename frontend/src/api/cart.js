// The signed-in shopper's cart. Every call answers with the whole updated cart.
import { api } from './client.js';

const id = encodeURIComponent;

export const getCart = () => api('/cart');

export const addToCart = (variantId, quantity) => api('/cart/items', { method: 'POST', json: { variant_id: variantId, quantity } });

export const setCartQuantity = (variantId, quantity) => api(`/cart/items/${id(variantId)}`, { method: 'PATCH', json: { quantity } });

export const removeFromCart = (variantId) => api(`/cart/items/${id(variantId)}`, { method: 'DELETE' });

export const clearCart = () => api('/cart', { method: 'DELETE' });
