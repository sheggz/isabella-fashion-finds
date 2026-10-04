// The signed-in shopper's cart. Every call answers with the whole updated cart.
import { createCartApi } from '@isabella/core';
import { api } from './client.js';

export const { getCart, addToCart, setCartQuantity, removeFromCart, clearCart } = createCartApi(api);
