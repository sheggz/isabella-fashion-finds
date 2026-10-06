import { describe, it, expect, vi } from 'vitest';
import { createCartStore } from '../src/index.js';

const cartData = (n) => ({ lines: [], item_count: n, subtotal_kobo: 0, savings_kobo: 0, has_problems: false });
const make = (over = {}) => {
  const api = {
    getCart: vi.fn().mockResolvedValue(cartData(1)),
    addToCart: vi.fn().mockResolvedValue(cartData(2)),
    setCartQuantity: vi.fn().mockResolvedValue(cartData(3)),
    removeFromCart: vi.fn().mockResolvedValue(cartData(0)),
    clearCart: vi.fn().mockResolvedValue(cartData(0)),
    ...over,
  };
  return { api, ...createCartStore(api) };
};

describe('createCartStore', () => {
  it('starts idle with no cart', () => {
    expect(make().store.get()).toEqual({ status: 'idle', data: null, error: null });
  });

  it('load: fetches the cart and stores it', async () => {
    const { store, load } = make();
    await load();
    expect(store.get()).toEqual({ status: 'ready', data: cartData(1), error: null });
  });

  it('load: keeps the previous cart on screen while reloading and after a failure', async () => {
    const { store, load, api } = make();
    await load();
    api.getCart.mockRejectedValue({ status: 0, message: 'offline' });
    await load();
    expect(store.get().status).toBe('error');
    expect(store.get().data).toEqual(cartData(1));
    expect(store.get().error.message).toBe('offline');
  });

  it('add / change / remove / empty adopt the whole cart the server answers with', async () => {
    const { store, addItem, changeQuantity, removeLine, emptyCart, api } = make();
    await addItem('v1', 2);
    expect(api.addToCart).toHaveBeenCalledWith('v1', 2);
    expect(store.get().data.item_count).toBe(2);
    await changeQuantity('v1', 3);
    expect(api.setCartQuantity).toHaveBeenCalledWith('v1', 3);
    expect(store.get().data.item_count).toBe(3);
    await removeLine('v1');
    expect(store.get().data.item_count).toBe(0);
    await emptyCart();
    expect(api.clearCart).toHaveBeenCalled();
  });

  it('a refused change throws to the caller and leaves the cart untouched', async () => {
    const refusal = { status: 409, code: 'out_of_stock', message: 'Sold out' };
    const { store, load, addItem } = make({ addToCart: vi.fn().mockRejectedValue(refusal) });
    await load();
    const before = store.get();
    await expect(addItem('v1', 1)).rejects.toBe(refusal);
    expect(store.get()).toBe(before);
  });

  it('refresh: replaces the cart only when the server data differs (no needless redraw)', async () => {
    const { store, refresh, load } = make();
    await load();
    const before = store.get();
    await refresh();
    expect(store.get()).toBe(before);
    const { store: s2, refresh: r2, api } = make();
    await r2();
    api.getCart.mockResolvedValue(cartData(5));
    await r2();
    expect(s2.get().data.item_count).toBe(5);
  });

  it('reset forgets the cart (on sign-out)', async () => {
    const { store, load, reset } = make();
    await load();
    reset();
    expect(store.get()).toEqual({ status: 'idle', data: null, error: null });
  });
});
