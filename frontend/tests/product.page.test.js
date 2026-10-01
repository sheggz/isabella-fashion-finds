// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../src/api/products.js', () => ({
  listProducts: vi.fn(),
  getProduct: vi.fn(),
}));
vi.mock('../src/api/catalogue.js', () => ({
  getCatalogueOptions: vi.fn(),
}));

import { getProduct } from '../src/api/products.js';
import { getCatalogueOptions } from '../src/api/catalogue.js';
import { renderProduct } from '../src/pages/product.js';

const OPTIONS = {
  sizes: [
    { value: 'S', label: 'S' },
    { value: 'M', label: 'M' },
    { value: 'ONE_SIZE', label: 'One size' },
  ],
  measurement_parts: [
    { value: 'bust', label: 'Bust' },
    { value: 'waist', label: 'Waist' },
  ],
  unit: 'cm',
};

const product = (over = {}) => ({
  id: 'p1',
  name: 'Ankara Dress',
  description: 'Hand-sewn in Lagos.',
  price_kobo: 1500000,
  images: [
    { id: 'i2', position: 1, url: 'https://cdn.test/b.png' },
    { id: 'i1', position: 0, url: 'https://cdn.test/a.png' },
  ],
  variants: [
    { size: 'S', stock: 0, measurements: { bust: 88 } },
    { size: 'M', stock: 2, measurements: { bust: 92, waist: 74.3 } },
    { size: 'ONE_SIZE', stock: 5, measurements: {} },
  ],
  ...over,
});

let view;
beforeEach(() => {
  document.body.innerHTML = '<div id="view"></div>';
  view = document.querySelector('#view');
  vi.resetAllMocks();
  getCatalogueOptions.mockResolvedValue(OPTIONS);
});

const open = async (p = product()) => {
  getProduct.mockResolvedValue(p);
  renderProduct(view, { params: { id: p.id } });
  await vi.waitFor(() => expect(view.querySelector('h1')).not.toBeNull());
};

describe('product page', () => {
  it('shows the name, formatted price and description', async () => {
    await open();
    expect(view.querySelector('h1').textContent).toBe('Ankara Dress');
    expect(view.textContent).toContain('₦15,000');
    expect(view.textContent).toContain('Hand-sewn in Lagos.');
  });

  it('leaves the description out entirely when the owner did not write one', async () => {
    await open(product({ description: null }));
    expect(view.querySelector('.description')).toBeNull();
  });

  it('shows the cover photo first and lets you switch photos via the thumbnails', async () => {
    await open();
    const main = view.querySelector('img.main-photo');
    expect(main.getAttribute('src')).toBe('https://cdn.test/a.png');
    const thumbs = view.querySelectorAll('button.thumb');
    expect(thumbs).toHaveLength(2);
    thumbs[1].click();
    expect(view.querySelector('img.main-photo').getAttribute('src')).toBe('https://cdn.test/b.png');
  });

  it('shows a placeholder when there is no photo', async () => {
    await open(product({ images: [] }));
    expect(view.querySelector('img.main-photo')).toBeNull();
    expect(view.querySelector('.no-photo')).not.toBeNull();
  });

  it('lists sizes with friendly labels and disables the ones with no stock', async () => {
    await open();
    const buttons = [...view.querySelectorAll('button.size')];
    expect(buttons.map((b) => b.textContent)).toEqual(expect.arrayContaining([expect.stringContaining('One size')]));
    const small = buttons.find((b) => b.dataset.size === 'S');
    expect(small.disabled).toBe(true);
    expect(small.textContent).toContain('Sold out');
  });

  it('pre-selects the first size that is in stock and shows its measurements', async () => {
    await open();
    expect(view.querySelector('button.size[aria-pressed="true"]').dataset.size).toBe('M');
    const rows = [...view.querySelectorAll('.measurements tr')].map((r) => r.textContent);
    expect(rows).toEqual(['Bust92 cm', 'Waist74.3 cm']);
  });

  it('updates the measurements when another size is chosen', async () => {
    await open();
    view.querySelector('button.size[data-size="ONE_SIZE"]').click();
    expect(view.querySelector('button.size[aria-pressed="true"]').dataset.size).toBe('ONE_SIZE');
    expect(view.querySelector('.measurements').textContent).toContain('No measurements provided');
  });

  it('warns when stock is low', async () => {
    await open();
    expect(view.querySelector('.stock-note').textContent).toContain('Only 2 left');
  });

  it('says so when everything is sold out', async () => {
    const soldOut = product({ variants: [{ size: 'M', stock: 0, measurements: {} }] });
    await open(soldOut);
    expect(view.textContent).toContain('Sold out');
    expect(view.querySelector('button.size[aria-pressed="true"]')).toBeNull();
  });

  it('still works when the size labels cannot be loaded', async () => {
    getCatalogueOptions.mockRejectedValue({ code: 'network_error', message: 'x' });
    await open();
    expect(view.querySelector('button.size[data-size="ONE_SIZE"]').textContent).toContain('ONE_SIZE');
  });

  it('shows a friendly not-found message for a missing piece', async () => {
    getProduct.mockRejectedValue({ status: 404, code: 'not_found', message: 'Product not found' });
    renderProduct(view, { params: { id: 'nope' } });
    await vi.waitFor(() => expect(view.textContent).toContain('could not be found'));
    expect(view.querySelector('a[href="/"]')).not.toBeNull();
  });

  it('shows other errors with a retry button', async () => {
    getProduct.mockRejectedValue({ status: 0, code: 'network_error', message: 'Cannot reach the server.' });
    renderProduct(view, { params: { id: 'p1' } });
    await vi.waitFor(() => expect(view.textContent).toContain('Cannot reach the server.'));
    expect(view.querySelector('button[data-retry]')).not.toBeNull();
  });

  it('renders hostile text safely', async () => {
    await open(product({ name: '<b onclick="x()">Bold</b>', description: '<script>window.pwned=1</script>' }));
    expect(view.querySelector('h1 b')).toBeNull();
    expect(view.querySelector('script')).toBeNull();
    expect(view.querySelector('h1').textContent).toBe('<b onclick="x()">Bold</b>');
  });
});
