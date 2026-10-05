// The shopper's cart as the page sees it. Every server call returns the WHOLE updated cart, so
// state is simply "the last cart the server sent": no client-side arithmetic that could drift
// from what the server will actually charge.
import { addToCart, clearCart, getCart, removeFromCart, setCartQuantity } from '../api/cart.js';
import { createStore } from '@isabella/core';

/** { status: 'idle' | 'loading' | 'ready' | 'error', data: cart | null, error: error | null } */
export const cart = createStore({ status: 'idle', data: null, error: null });

export const loadCart = async () => {
  // Keep showing the previous cart while reloading so the page does not flash empty.
  cart.set((s) => ({ ...s, status: 'loading', error: null }));
  try {
    cart.set({ status: 'ready', data: await getCart(), error: null });
  } catch (error) {
    cart.set((s) => ({ ...s, status: 'error', error }));
  }
};

/** Background sync: fetch quietly and replace the state ONLY if the server's cart differs
 *  (so an unchanged cart causes no redraw). Errors propagate to the poller, which just retries. */
export const refreshCart = async () => {
  const data = await getCart();
  if (JSON.stringify(data) !== JSON.stringify(cart.get().data)) cart.set({ status: 'ready', data, error: null });
};

// A refused change (out of stock, over the limit...) throws the normalised error for the caller
// to show, and leaves the stored cart exactly as it was.
const adopt = (data) => {
  cart.set({ status: 'ready', data, error: null });
  return data;
};

export const addItem = async (variantId, quantity) => adopt(await addToCart(variantId, quantity));

export const changeQuantity = async (variantId, quantity) => adopt(await setCartQuantity(variantId, quantity));

export const removeLine = async (variantId) => adopt(await removeFromCart(variantId));

export const emptyCart = async () => adopt(await clearCart());

/** Forget the cart (on sign-out). */
export const resetCart = () => cart.set({ status: 'idle', data: null, error: null });
