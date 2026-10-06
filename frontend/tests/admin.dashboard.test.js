// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../src/api/admin.js', () => ({ getDashboard: vi.fn() }));

import { getDashboard } from '../src/api/admin.js';
import { renderAdminDashboard } from '../src/pages/admin/dashboard.js';

const data = (over = {}) => ({
  stock: {
    pieces: 5, visible_pieces: 4, units_in_stock: 42, low_stock_threshold: 3,
    low_stock: [{ product_id: 'p1', name: 'Ankara Dress', size: 'M', stock: 1 }],
    sold_out: [{ product_id: 'p2', name: 'Lace Gown' }],
  },
  sales: {
    days: 7, revenue_kobo: 4500000, orders: 3, items_sold: 5, average_order_kobo: 1500000,
    by_day: [{ date: '2026-10-09', revenue_kobo: 0, orders: 0 }, { date: '2026-10-10', revenue_kobo: 4500000, orders: 3 }],
    top_products: [{ product_id: 'p1', name: 'Ankara Dress', units: 4, revenue_kobo: 3600000 }],
  },
  ...over,
});

let view;
beforeEach(() => {
  document.body.innerHTML = '<div id="view"></div>';
  view = document.querySelector('#view');
  vi.resetAllMocks();
});
const settle = () => new Promise((r) => setTimeout(r, 0));

describe('owner dashboard', () => {
  it('shows loading, then the figures in naira', async () => {
    getDashboard.mockResolvedValue(data());
    renderAdminDashboard(view);
    expect(view.querySelector('[data-loading]')).not.toBeNull();
    await settle();
    expect(view.textContent).toContain('₦45,000');
    expect(view.textContent).toContain('42');
  });

  it('links low-stock sizes and sold-out pieces to their edit pages', async () => {
    getDashboard.mockResolvedValue(data());
    renderAdminDashboard(view);
    await settle();
    expect(view.querySelector('a[href="/admin/products/p1"]')).not.toBeNull();
    expect(view.querySelector('a[href="/admin/products/p2"]')).not.toBeNull();
  });

  it('draws one bar per day with an accessible label', async () => {
    getDashboard.mockResolvedValue(data());
    renderAdminDashboard(view);
    await settle();
    const bars = view.querySelectorAll('.bar-chart .bar');
    expect(bars).toHaveLength(2);
    expect(bars[1].getAttribute('aria-label')).toContain('10 Oct');
    expect(bars[1].getAttribute('aria-label')).toContain('₦45,000');
  });

  it('explains empty sales instead of showing a blank chart', async () => {
    const empty = data();
    empty.sales = { ...empty.sales, revenue_kobo: 0, orders: 0, items_sold: 0, average_order_kobo: 0, top_products: [], by_day: [] };
    getDashboard.mockResolvedValue(empty);
    renderAdminDashboard(view);
    await settle();
    expect(view.textContent).toMatch(/no paid orders yet/i);
  });

  it('reports all-clear when nothing is low or sold out', async () => {
    const calm = data();
    calm.stock = { ...calm.stock, low_stock: [], sold_out: [] };
    getDashboard.mockResolvedValue(calm);
    renderAdminDashboard(view);
    await settle();
    expect(view.textContent).toMatch(/nothing is running low/i);
  });

  it('shows the error with a retry when the server fails', async () => {
    getDashboard.mockRejectedValue({ status: 500, message: 'Something went wrong.' });
    renderAdminDashboard(view);
    await settle();
    expect(view.querySelector('[role="alert"]').textContent).toContain('Something went wrong.');
    getDashboard.mockResolvedValue(data());
    view.querySelector('[data-retry]').click();
    await settle();
    expect(view.textContent).toContain('₦45,000');
  });

  it('renders a hostile product name as text', async () => {
    const bad = data();
    bad.stock.low_stock[0].name = '<img src=x onerror=1>';
    getDashboard.mockResolvedValue(bad);
    renderAdminDashboard(view);
    await settle();
    expect(view.querySelector('img')).toBeNull();
  });
});
