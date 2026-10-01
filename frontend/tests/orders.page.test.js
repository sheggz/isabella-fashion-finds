// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../src/api/orders.js', () => ({ listOrders: vi.fn(), getOrder: vi.fn() }));

import { listOrders } from '../src/api/orders.js';
import { renderOrders } from '../src/pages/orders.js';

const order = (over = {}) => ({
  id: 'o1', status: 'paid', currency: 'NGN', subtotal_kobo: 1800000, total_kobo: 1800000, item_count: 2,
  created_at: '2026-10-01T12:00:00Z', paid_at: '2026-10-01T12:05:00Z',
  items: [{ product_id: 'p1', product_name: 'Ankara Dress', size: 'M', image_url: 'https://cdn.test/a.png', quantity: 2,
    unit_price_kobo: 900000, base_price_kobo: 1000000, discount_name: 'Weekend sale', line_total_kobo: 1800000 }],
  ...over,
});

let view;
beforeEach(() => {
  document.body.innerHTML = '<div id="view"></div>';
  view = document.querySelector('#view');
  vi.resetAllMocks();
});

const open = async (orders) => {
  listOrders.mockResolvedValue(orders);
  renderOrders(view, {});
  await vi.waitFor(() => expect(view.querySelector('[data-loading]')).toBeNull());
};

describe('order history page', () => {
  it('shows a loading state first', () => {
    listOrders.mockReturnValue(new Promise(() => {}));
    renderOrders(view, {});
    expect(view.querySelector('[data-loading]')).not.toBeNull();
  });

  it('shows each order with its date, status and total', async () => {
    await open([order()]);
    const card = view.querySelector('article.order');
    expect(card.textContent).toMatch(/1 Oct 2026/);
    expect(card.querySelector('.badge.order-paid').textContent).toBe('Paid');
    expect(card.querySelector('.order-total').textContent).toBe('₦18,000');
  });

  it('lists the items as they were bought, with the discount that applied', async () => {
    await open([order()]);
    const item = view.querySelector('article.order li');
    expect(item.querySelector('img').getAttribute('src')).toBe('https://cdn.test/a.png');
    expect(item.textContent).toContain('Ankara Dress');
    expect(item.textContent).toContain('Size M × 2');
    expect(item.querySelector('s.was').textContent).toBe('₦10,000');
    expect(item.querySelector('.now').textContent).toBe('₦9,000');
    expect(item.textContent).toContain('Weekend sale');
  });

  it('does not show a struck-through price for items bought at full price', async () => {
    await open([order({ items: [{ ...order().items[0], base_price_kobo: 900000, discount_name: null }] })]);
    expect(view.querySelector('article.order s.was')).toBeNull();
  });

  it('links to the product while it still exists, and shows plain text once it is gone', async () => {
    await open([order({ items: [order().items[0], { ...order().items[0], product_id: null, product_name: 'Old piece' }] })]);
    const items = view.querySelectorAll('article.order li');
    expect(items[0].querySelector('a[href="/products/p1"]')).not.toBeNull();
    expect(items[1].querySelector('a')).toBeNull();
    expect(items[1].textContent).toContain('Old piece');
  });

  it('shows a pending order as awaiting payment', async () => {
    await open([order({ status: 'pending', paid_at: null })]);
    expect(view.querySelector('.badge.order-pending').textContent).toBe('Awaiting payment');
  });

  it('shows a friendly empty state with a way back to the shop', async () => {
    await open([]);
    expect(view.textContent).toContain('No orders yet');
    expect(view.querySelector('a[href="/"]')).not.toBeNull();
  });

  it('shows the error with retry', async () => {
    listOrders.mockRejectedValueOnce({ status: 0, code: 'network_error', message: 'Cannot reach the server.' });
    renderOrders(view, {});
    await vi.waitFor(() => expect(view.textContent).toContain('Cannot reach the server.'));
    listOrders.mockResolvedValue([order()]);
    view.querySelector('button[data-retry]').click();
    await vi.waitFor(() => expect(view.querySelector('article.order')).not.toBeNull());
  });

  it('renders hostile names as text', async () => {
    await open([order({ items: [{ ...order().items[0], product_name: '<img src=x onerror=1>' }] })]);
    expect(view.querySelector('article.order li a img')).toBeNull();
  });
});
