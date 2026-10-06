// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../src/api/products.js', () => ({ listProducts: vi.fn(), getProduct: vi.fn() }));

import { listProducts } from '../src/api/products.js';
import { renderHome } from '../src/pages/home.js';

const product = (n) => ({
  id: `p${n}`,
  name: `Piece ${n}`,
  pricing_mode: 'single',
  price_kobo: 1500000,
  price_varies: false,
  sale_price_kobo: null,
  discount: null,
  images: [],
  variants: [{ size: 'M', stock: 2, measurements: {} }],
});

let view;
beforeEach(() => {
  document.body.innerHTML = '<div id="view"></div>';
  view = document.querySelector('#view');
  vi.resetAllMocks();
});
const settle = () => new Promise((r) => setTimeout(r, 0));

describe('landing page', () => {
  it('shows the hero straight away with a call to action to the shop', () => {
    listProducts.mockReturnValue(new Promise(() => {}));
    renderHome(view);
    expect(view.querySelector('.hero h1').textContent).not.toBe('');
    expect(view.querySelector('.hero a[href="/shop"]')).not.toBeNull();
  });

  it('shows at most four of the newest pieces and a link to see them all', async () => {
    listProducts.mockResolvedValue([1, 2, 3, 4, 5, 6].map(product));
    renderHome(view);
    await settle();
    expect(view.querySelectorAll('.new-in .card')).toHaveLength(4);
    expect(view.querySelector('.new-in a[href="/shop"]')).not.toBeNull();
  });

  it('keeps the rest of the page when the catalogue cannot load, and offers a retry', async () => {
    listProducts.mockRejectedValue({ status: 0, code: 'network_error', message: 'Cannot reach the server.' });
    renderHome(view);
    await settle();
    expect(view.querySelector('.hero')).not.toBeNull();
    expect(view.querySelector('.new-in [role="alert"]').textContent).toContain('Cannot reach the server.');
    listProducts.mockResolvedValue([product(1)]);
    view.querySelector('[data-retry]').click();
    await settle();
    expect(view.querySelectorAll('.new-in .card')).toHaveLength(1);
  });

  it('links the collection tiles to the shop', () => {
    listProducts.mockReturnValue(new Promise(() => {}));
    renderHome(view);
    expect(view.querySelectorAll('.tiles a[href="/shop"]').length).toBeGreaterThan(0);
  });
});
