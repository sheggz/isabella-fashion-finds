// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../src/api/products.js', () => ({
  listProducts: vi.fn(),
  getProduct: vi.fn(),
}));

import { listProducts } from '../src/api/products.js';
import { renderHome } from '../src/pages/home.js';

const product = (over = {}) => ({
  id: 'p1',
  name: 'Ankara Dress',
  price_kobo: 1500000,
  images: [{ id: 'i1', position: 0, url: 'https://cdn.test/a.png' }],
  variants: [{ size: 'M', stock: 2, measurements: {} }],
  ...over,
});

let view;
beforeEach(() => {
  document.body.innerHTML = '<div id="view"></div>';
  view = document.querySelector('#view');
  vi.resetAllMocks();
});

const settle = () => vi.waitFor(() => expect(view.querySelector('[data-loading]')).toBeNull());

describe('home page', () => {
  it('shows a loading state first', () => {
    listProducts.mockReturnValue(new Promise(() => {}));
    renderHome(view, {});
    expect(view.querySelector('[data-loading]')).not.toBeNull();
  });

  it('renders a card per product with name, price, photo and a link to its page', async () => {
    listProducts.mockResolvedValue([product(), product({ id: 'p2', name: 'Gown', price_kobo: 250050 })]);
    renderHome(view, {});
    await settle();

    const cards = view.querySelectorAll('a.card');
    expect(cards).toHaveLength(2);
    expect(cards[0].getAttribute('href')).toBe('/products/p1');
    expect(cards[0].hasAttribute('data-link')).toBe(true);
    expect(cards[0].textContent).toContain('Ankara Dress');
    expect(cards[0].textContent).toContain('₦15,000');
    expect(cards[0].querySelector('img').getAttribute('src')).toBe('https://cdn.test/a.png');
    expect(cards[1].textContent).toContain('₦2,500.50');
  });

  it('marks pieces with no stock as sold out', async () => {
    listProducts.mockResolvedValue([product({ variants: [{ size: 'M', stock: 0, measurements: {} }] })]);
    renderHome(view, {});
    await settle();
    expect(view.querySelector('a.card').textContent).toContain('Sold out');
  });

  it('shows a placeholder when a piece has no photo yet', async () => {
    listProducts.mockResolvedValue([product({ images: [] })]);
    renderHome(view, {});
    await settle();
    expect(view.querySelector('a.card img')).toBeNull();
    expect(view.querySelector('a.card .no-photo')).not.toBeNull();
  });

  it('shows a friendly empty state', async () => {
    listProducts.mockResolvedValue([]);
    renderHome(view, {});
    await settle();
    expect(view.textContent).toContain('No pieces yet');
  });

  it('shows the server message on failure and retries on request', async () => {
    listProducts.mockRejectedValueOnce({ code: 'network_error', message: 'Cannot reach the server.' });
    renderHome(view, {});
    await vi.waitFor(() => expect(view.textContent).toContain('Cannot reach the server.'));

    listProducts.mockResolvedValueOnce([product()]);
    view.querySelector('button[data-retry]').click();
    await vi.waitFor(() => expect(view.querySelectorAll('a.card')).toHaveLength(1));
  });

  it('renders hostile product names as text, never as markup', async () => {
    listProducts.mockResolvedValue([product({ name: '<img src=x onerror="window.pwned=1">' })]);
    renderHome(view, {});
    await settle();
    expect(view.querySelectorAll('img[src="x"]')).toHaveLength(0);
    expect(view.querySelector('a.card').textContent).toContain('<img src=x onerror="window.pwned=1">');
  });
});
