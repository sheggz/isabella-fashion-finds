// The website's cart state: the shared cart store (@isabella/core) bound to the website's API.
import { createCartStore } from '@isabella/core';
import { addToCart, clearCart, getCart, removeFromCart, setCartQuantity } from '../api/cart.js';

const shared = createCartStore({ getCart, addToCart, setCartQuantity, removeFromCart, clearCart });

/** { status: 'idle' | 'loading' | 'ready' | 'error', data: cart | null, error: error | null } */
export const cart = shared.store;
export const loadCart = shared.load;
export const refreshCart = shared.refresh;
export const addItem = shared.addItem;
export const changeQuantity = shared.changeQuantity;
export const removeLine = shared.removeLine;
export const emptyCart = shared.emptyCart;
export const resetCart = shared.reset;
