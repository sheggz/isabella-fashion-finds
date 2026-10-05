// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../src/api/cart.js', () => ({
  getCart: vi.fn(),
  addToCart: vi.fn(),
  setCartQuantity: vi.fn(),
  removeFromCart: vi.fn(),
  clearCart: vi.fn(),
}));

import * as api from '../src/api/cart.js';
import { addItem, cart, changeQuantity, emptyCart, loadCart, refreshCart, removeLine, resetCart } from '../src/state/cart.js';

const data = (n) => ({ lines: [], item_count: n, subtotal_kobo: 0, savings_kobo: 0, has_problems: false });

beforeEach(() => {
  vi.resetAllMocks();
  resetCart();
});

describe('cart state', () => {
  it('starts empty and idle', () => {
    expect(cart.get()).toEqual({ status: 'idle', data: null, error: null });
  });

  it('loads the cart from the server', async () => {
    api.getCart.mockResolvedValue(data(2));
    const pending = loadCart();
    expect(cart.get().status).toBe('loading');
    await pending;
    expect(cart.get()).toEqual({ status: 'ready', data: data(2), error: null });
  });

  it('keeps the old cart visible while reloading, so the page does not flash empty', async () => {
    api.getCart.mockResolvedValueOnce(data(2));
    await loadCart();
    let release;
    api.getCart.mockReturnValueOnce(new Promise((resolve) => { release = resolve; }));
    const pending = loadCart();
    expect(cart.get().data).toEqual(data(2));
    release(data(3));
    await pending;
    expect(cart.get().data).toEqual(data(3));
  });

  it('records a load failure with its message', async () => {
    api.getCart.mockRejectedValue({ status: 0, code: 'network_error', message: 'Cannot reach the server.' });
    await loadCart();
    expect(cart.get().status).toBe('error');
    expect(cart.get().error.message).toBe('Cannot reach the server.');
  });

  it('every change adopts the cart the server sends back', async () => {
    api.addToCart.mockResolvedValue(data(1));
    api.setCartQuantity.mockResolvedValue(data(4));
    api.removeFromCart.mockResolvedValue(data(3));
    api.clearCart.mockResolvedValue(data(0));
    await addItem('v1', 1);
    expect(cart.get().data.item_count).toBe(1);
    await changeQuantity('v1', 4);
    expect(cart.get().data.item_count).toBe(4);
    await removeLine('v1');
    expect(cart.get().data.item_count).toBe(3);
    await emptyCart();
    expect(cart.get().data.item_count).toBe(0);
    expect(api.addToCart).toHaveBeenCalledWith('v1', 1);
    expect(api.setCartQuantity).toHaveBeenCalledWith('v1', 4);
  });

  it('a refused change throws the normalised error and leaves the cart as it was', async () => {
    api.getCart.mockResolvedValue(data(2));
    await loadCart();
    api.addToCart.mockRejectedValue({ status: 409, code: 'out_of_stock', message: 'Only 3 left in this size', details: { allowed: 3, in_cart: 2 } });
    await expect(addItem('v1', 5)).rejects.toMatchObject({ code: 'out_of_stock' });
    expect(cart.get().data).toEqual(data(2));
  });

  it('resetCart forgets everything (used on sign-out)', async () => {
    api.getCart.mockResolvedValue(data(2));
    await loadCart();
    resetCart();
    expect(cart.get()).toEqual({ status: 'idle', data: null, error: null });
  });
});

describe('refreshCart (background sync)', () => {
  it('adopts a cart changed on another device and leaves state untouched when nothing changed', async () => {
    api.getCart.mockResolvedValueOnce(data(1));
    await refreshCart();
    expect(cart.get().data.item_count).toBe(1);
    const before = cart.get();
    api.getCart.mockResolvedValueOnce(data(1));
    await refreshCart();
    expect(cart.get()).toBe(before); // identical data: no new state object, so nothing redraws
  });
});
