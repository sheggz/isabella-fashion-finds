// The shopper's cart as a screen sees it, shared by the website and the phone app. Every server
// call answers with the WHOLE updated cart, so state is simply "the last cart the server sent":
// no client-side arithmetic that could drift from what the server will actually charge.
import { createStore } from './lib/store.js';

/**
 * @param {{getCart: Function, addToCart: Function, setCartQuantity: Function, removeFromCart: Function, clearCart: Function}} api
 *   the cart endpoints (createCartApi) bound to a client; passed in so each platform uses its own
 *   transport (cookie vs bearer token) and tests use fakes.
 */
export const createCartStore = (api) => {
  /** { status: 'idle' | 'loading' | 'ready' | 'error', data: cart | null, error: error | null } */
  const store = createStore({ status: 'idle', data: null, error: null });

  // A refused change (out of stock, over the limit...) throws the normalised error for the caller
  // to show, and leaves the stored cart exactly as it was.
  const adopt = (data) => {
    store.set({ status: 'ready', data, error: null });
    return data;
  };

  return {
    store,

    async load() {
      // Keep showing the previous cart while reloading so a screen does not flash empty.
      store.set((s) => ({ ...s, status: 'loading', error: null }));
      try {
        adopt(await api.getCart());
      } catch (error) {
        store.set((s) => ({ ...s, status: 'error', error }));
      }
    },

    /** Background sync: replace the state ONLY if the server's cart differs. Errors propagate to the poller. */
    async refresh() {
      const data = await api.getCart();
      if (JSON.stringify(data) !== JSON.stringify(store.get().data)) adopt(data);
    },

    addItem: async (variantId, quantity) => adopt(await api.addToCart(variantId, quantity)),
    changeQuantity: async (variantId, quantity) => adopt(await api.setCartQuantity(variantId, quantity)),
    removeLine: async (variantId) => adopt(await api.removeFromCart(variantId)),
    emptyCart: async () => adopt(await api.clearCart()),

    /** Forget the cart (on sign-out). */
    reset: () => store.set({ status: 'idle', data: null, error: null }),
  };
};
