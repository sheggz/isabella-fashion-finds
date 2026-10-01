// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../src/api/admin.js', () => ({
  listAdminProducts: vi.fn(),
  deleteProduct: vi.fn(),
}));
vi.mock('../src/api/catalogue.js', () => ({ getCatalogueOptions: vi.fn() }));

import { deleteProduct, listAdminProducts } from '../src/api/admin.js';
import { getCatalogueOptions } from '../src/api/catalogue.js';
import { renderAdminList } from '../src/pages/admin/list.js';

const OPTIONS = { sizes: [{ value: 'S', label: 'S' }, { value: 'M', label: 'M' }, { value: 'ONE_SIZE', label: 'One size' }] };

const piece = (over = {}) => ({
  id: 'p1',
  name: 'Ankara Dress',
  price_kobo: 1500000,
  is_active: true,
  images: [],
  variants: [{ size: 'M', stock: 2 }, { size: 'S', stock: 0 }],
  ...over,
});

let view;
beforeEach(() => {
  document.body.innerHTML = '<div id="view"></div>';
  view = document.querySelector('#view');
  vi.resetAllMocks();
  getCatalogueOptions.mockResolvedValue(OPTIONS);
  window.confirm = vi.fn(() => true);
});

const ready = () => vi.waitFor(() => expect(view.querySelector('[data-loading]')).toBeNull());

describe('admin list', () => {
  it('always offers a way to add a piece', async () => {
    listAdminProducts.mockResolvedValue([]);
    renderAdminList(view, {});
    await ready();
    const add = view.querySelector('a[href="/admin/products/new"]');
    expect(add).not.toBeNull();
    expect(add.hasAttribute('data-link')).toBe(true);
  });

  it('shows each piece with price, stock per size, visibility and an edit link', async () => {
    listAdminProducts.mockResolvedValue([piece(), piece({ id: 'p2', name: 'Hidden gown', is_active: false })]);
    renderAdminList(view, {});
    await ready();

    const rows = view.querySelectorAll('tbody tr');
    expect(rows).toHaveLength(2);
    expect(rows[0].textContent).toContain('Ankara Dress');
    expect(rows[0].textContent).toContain('₦15,000');
    expect(rows[0].textContent).toContain('S 0 · M 2');
    expect(rows[0].textContent).toContain('Visible');
    expect(rows[0].querySelector('a[href="/admin/products/p1"]')).not.toBeNull();
    expect(rows[1].textContent).toContain('Hidden');
  });

  it('shows an empty state when there are no pieces', async () => {
    listAdminProducts.mockResolvedValue([]);
    renderAdminList(view, {});
    await ready();
    expect(view.textContent).toContain('No pieces yet');
    expect(view.querySelector('table')).toBeNull();
  });

  it('deletes only after the owner confirms, then refreshes the list', async () => {
    listAdminProducts.mockResolvedValueOnce([piece()]).mockResolvedValueOnce([]);
    deleteProduct.mockResolvedValue(null);
    renderAdminList(view, {});
    await ready();

    window.confirm.mockReturnValueOnce(false);
    view.querySelector('button[data-delete]').click();
    expect(deleteProduct).not.toHaveBeenCalled();

    view.querySelector('button[data-delete]').click();
    await vi.waitFor(() => expect(deleteProduct).toHaveBeenCalledWith('p1'));
    await vi.waitFor(() => expect(view.textContent).toContain('No pieces yet'));
  });

  it('names the piece in the confirmation so the right one is deleted', async () => {
    listAdminProducts.mockResolvedValue([piece()]);
    renderAdminList(view, {});
    await ready();
    window.confirm.mockReturnValue(false);
    view.querySelector('button[data-delete]').click();
    expect(window.confirm.mock.calls[0][0]).toContain('Ankara Dress');
  });

  it('shows a failed delete and keeps the list', async () => {
    listAdminProducts.mockResolvedValue([piece()]);
    deleteProduct.mockRejectedValue({ status: 503, code: 'service_unavailable', message: 'Image storage is unavailable' });
    renderAdminList(view, {});
    await ready();
    view.querySelector('button[data-delete]').click();
    await vi.waitFor(() => expect(view.querySelector('[role="alert"]').textContent).toContain('Image storage is unavailable'));
    expect(view.querySelectorAll('tbody tr')).toHaveLength(1);
  });

  it('shows an error state with retry when loading fails', async () => {
    listAdminProducts.mockRejectedValueOnce({ status: 0, code: 'network_error', message: 'Cannot reach the server.' });
    renderAdminList(view, {});
    await vi.waitFor(() => expect(view.textContent).toContain('Cannot reach the server.'));
    listAdminProducts.mockResolvedValueOnce([piece()]);
    view.querySelector('button[data-retry]').click();
    await vi.waitFor(() => expect(view.querySelectorAll('tbody tr')).toHaveLength(1));
  });

  it('renders hostile names as text', async () => {
    listAdminProducts.mockResolvedValue([piece({ name: '<img src=x onerror=1>' })]);
    renderAdminList(view, {});
    await ready();
    expect(view.querySelector('tbody img')).toBeNull();
  });
});
