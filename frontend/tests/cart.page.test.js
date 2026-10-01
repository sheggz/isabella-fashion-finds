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
import { resetCart } from '../src/state/cart.js';
import { renderCart } from '../src/pages/cart.js';

const line = (over = {}) => ({
  variant_id: 'v1', product_id: 'p1', name: 'Ankara Dress', size: 'M', image_url: 'https://cdn.test/a.png',
  quantity: 2, unit_price_kobo: 900000, base_price_kobo: 1000000, line_total_kobo: 1800000, discount_name: 'Weekend sale',
  price_changed_from_kobo: null, problem: null, problem_message: null, available_quantity: 5, max_per_order: null, ...over,
});
const cartOf = (lines, over = {}) => ({
  lines, item_count: lines.reduce((n, l) => n + l.quantity, 0),
  subtotal_kobo: lines.filter((l) => !l.problem).reduce((n, l) => n + l.line_total_kobo, 0),
  savings_kobo: 0, has_problems: lines.some((l) => l.problem), ...over,
});

let view;
let navigate;
beforeEach(() => {
  document.body.innerHTML = '<div id="view"></div>';
  view = document.querySelector('#view');
  navigate = vi.fn();
  vi.resetAllMocks();
  resetCart();
  window.confirm = vi.fn(() => true);
});

const open = async (cart) => {
  api.getCart.mockResolvedValue(cart);
  const cleanup = renderCart(view, { navigate });
  await vi.waitFor(() => expect(view.querySelector('[data-loading]')).toBeNull());
  return cleanup;
};

describe('cart page', () => {
  it('shows a loading state, then the lines', async () => {
    api.getCart.mockReturnValue(new Promise(() => {}));
    renderCart(view, { navigate });
    expect(view.querySelector('[data-loading]')).not.toBeNull();
  });

  it('shows each line with photo, name link, size, quantity, unit price and line total', async () => {
    await open(cartOf([line()], { savings_kobo: 200000 }));
    const row = view.querySelector('li.cart-line');
    expect(row.querySelector('img').getAttribute('src')).toBe('https://cdn.test/a.png');
    const name = row.querySelector('a[href="/products/p1"]');
    expect(name.textContent).toBe('Ankara Dress');
    expect(name.hasAttribute('data-link')).toBe(true);
    expect(row.textContent).toContain('Size M');
    expect(row.querySelector('.qty').textContent).toBe('2');
    expect(row.querySelector('s.was').textContent).toBe('₦10,000');
    expect(row.querySelector('.now').textContent).toBe('₦9,000');
    expect(row.querySelector('.line-total').textContent).toBe('₦18,000');
  });

  it('shows a placeholder when the piece has no photo', async () => {
    await open(cartOf([line({ image_url: null })]));
    expect(view.querySelector('li.cart-line img')).toBeNull();
    expect(view.querySelector('li.cart-line .no-photo')).not.toBeNull();
  });

  it('summarises items, subtotal and savings', async () => {
    await open(cartOf([line()], { savings_kobo: 200000 }));
    const summary = view.querySelector('.summary').textContent;
    expect(summary).toContain('2 items');
    expect(summary).toContain('₦18,000');
    expect(summary).toContain('You save ₦2,000');
  });

  it('does not mention savings when there are none', async () => {
    await open(cartOf([line({ discount_name: null, unit_price_kobo: 1000000, line_total_kobo: 2000000 })]));
    expect(view.querySelector('.summary').textContent).not.toContain('You save');
  });

  it('says so when the cart is empty and offers the way back to the shop', async () => {
    await open(cartOf([]));
    expect(view.textContent).toContain('Your cart is empty');
    expect(view.querySelector('a[href="/"]')).not.toBeNull();
    expect(view.querySelector('.summary')).toBeNull();
  });

  it('shows the load error with a retry', async () => {
    api.getCart.mockRejectedValueOnce({ status: 0, code: 'network_error', message: 'Cannot reach the server.' });
    renderCart(view, { navigate });
    await vi.waitFor(() => expect(view.textContent).toContain('Cannot reach the server.'));
    api.getCart.mockResolvedValue(cartOf([line()]));
    view.querySelector('button[data-retry]').click();
    await vi.waitFor(() => expect(view.querySelector('li.cart-line')).not.toBeNull());
  });
});

describe('changing the cart', () => {
  it('+ and - change the quantity through the server and show what it answers', async () => {
    await open(cartOf([line({ quantity: 2 })]));
    api.setCartQuantity.mockResolvedValue(cartOf([line({ quantity: 3, line_total_kobo: 2700000 })]));
    view.querySelector('button[data-increase]').click();
    await vi.waitFor(() => expect(api.setCartQuantity).toHaveBeenCalledWith('v1', 3));
    await vi.waitFor(() => expect(view.querySelector('.qty').textContent).toBe('3'));

    api.setCartQuantity.mockResolvedValue(cartOf([line({ quantity: 2 })]));
    view.querySelector('button[data-decrease]').click();
    await vi.waitFor(() => expect(api.setCartQuantity).toHaveBeenLastCalledWith('v1', 2));
  });

  it('disables the buttons that would go out of bounds', async () => {
    await open(cartOf([line({ quantity: 1, available_quantity: 1 })]));
    expect(view.querySelector('button[data-decrease]').disabled).toBe(true);
    expect(view.querySelector('button[data-increase]').disabled).toBe(true);
  });

  it('shows the server message when a change is refused and keeps the cart as it was', async () => {
    await open(cartOf([line({ quantity: 2 })]));
    api.setCartQuantity.mockRejectedValue({ status: 409, code: 'out_of_stock', message: 'Only 2 left in this size' });
    view.querySelector('button[data-increase]').click();
    await vi.waitFor(() => expect(view.querySelector('.cart-alert').textContent).toContain('Only 2 left in this size'));
    expect(view.querySelector('.qty').textContent).toBe('2');
  });

  it('removes a line', async () => {
    await open(cartOf([line()]));
    api.removeFromCart.mockResolvedValue(cartOf([]));
    view.querySelector('button[data-remove]').click();
    await vi.waitFor(() => expect(api.removeFromCart).toHaveBeenCalledWith('v1'));
    await vi.waitFor(() => expect(view.textContent).toContain('Your cart is empty'));
  });

  it('empties the whole cart only after confirmation', async () => {
    await open(cartOf([line(), line({ variant_id: 'v2', size: 'S' })]));
    window.confirm.mockReturnValueOnce(false);
    view.querySelector('button[data-clear]').click();
    expect(api.clearCart).not.toHaveBeenCalled();

    api.clearCart.mockResolvedValue(cartOf([]));
    view.querySelector('button[data-clear]').click();
    await vi.waitFor(() => expect(api.clearCart).toHaveBeenCalledTimes(1));
    await vi.waitFor(() => expect(view.textContent).toContain('Your cart is empty'));
  });

  it('ignores a second click while the first change is still being saved', async () => {
    await open(cartOf([line({ quantity: 2 })]));
    let finish;
    api.setCartQuantity.mockReturnValue(new Promise((resolve) => { finish = resolve; }));
    const plus = view.querySelector('button[data-increase]');
    plus.click();
    plus.click();
    expect(api.setCartQuantity).toHaveBeenCalledTimes(1);
    finish(cartOf([line({ quantity: 3 })]));
  });
});

describe('notices and checkout', () => {
  it('shows a price change next to the line', async () => {
    await open(cartOf([line({ price_changed_from_kobo: 1000000, unit_price_kobo: 900000 })]));
    expect(view.querySelector('li.cart-line .notice.price').textContent).toContain('Price changed from ₦10,000 to ₦9,000');
  });

  it('shows a problem on the line, dims it, and blocks checkout with an explanation', async () => {
    await open(cartOf([line({ problem: 'out_of_stock', problem_message: 'Sold out', available_quantity: 0 })]));
    const row = view.querySelector('li.cart-line');
    expect(row.querySelector('.notice.problem').textContent).toBe('Sold out');
    expect(row.classList.contains('has-problem')).toBe(true);
    expect(view.querySelector('button.checkout').disabled).toBe(true);
    expect(view.querySelector('.checkout-hint').textContent).toMatch(/items marked/i);
    expect(row.querySelector('button[data-increase]').disabled).toBe(true);
    expect(row.querySelector('button[data-remove]')).not.toBeNull();   // it can always be removed
  });

  it('keeps checkout closed for now, saying why', async () => {
    await open(cartOf([line()]));
    expect(view.querySelector('button.checkout').disabled).toBe(true);
    expect(view.querySelector('.checkout-hint').textContent).toMatch(/not open yet/i);
  });

  it('renders hostile names as text', async () => {
    await open(cartOf([line({ name: '<img src=x onerror=1>' })]));
    expect(view.querySelector('li.cart-line a img')).toBeNull();
    expect(view.querySelector('li.cart-line a').textContent).toBe('<img src=x onerror=1>');
  });

  it('stops listening to the cart when the page is left', async () => {
    const cleanup = await open(cartOf([line()]));
    cleanup();
    api.getCart.mockResolvedValue(cartOf([]));
    const before = view.innerHTML;
    const { loadCart } = await import('../src/state/cart.js');
    await loadCart();
    expect(view.innerHTML).toBe(before);
  });
});
