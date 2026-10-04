import { describe, it, expect, vi } from 'vitest';
import {
  createAdminApi, createAuthApi, createCartApi, createCatalogueApi, createOrdersApi, createProductsApi,
} from '../src/api/endpoints.js';

// Each factory takes a `request(path, options)` function. A fake one shows exactly what would be sent.
const fake = () => vi.fn().mockResolvedValue('ok');

describe('products and catalogue', () => {
  it('lists and reads products, encoding ids', async () => {
    const request = fake();
    const api = createProductsApi(request);
    await api.listProducts();
    await api.getProduct('a b/c');
    expect(request).toHaveBeenNthCalledWith(1, '/products');
    expect(request).toHaveBeenNthCalledWith(2, '/products/a%20b%2Fc');
  });

  it('reads the catalogue options', async () => {
    const request = fake();
    await createCatalogueApi(request).getCatalogueOptions();
    expect(request).toHaveBeenCalledWith('/catalogue/options');
  });
});

describe('auth', () => {
  it('reads who is signed in and signs out', async () => {
    const request = fake();
    const api = createAuthApi(request);
    await api.getMe();
    await api.logout();
    expect(request).toHaveBeenNthCalledWith(1, '/auth/me');
    expect(request).toHaveBeenNthCalledWith(2, '/auth/logout', { method: 'POST' });
  });
});

describe('cart', () => {
  it('has one call per cart action, each with the right method and body', async () => {
    const request = fake();
    const api = createCartApi(request);
    await api.getCart();
    await api.addToCart('v1', 2);
    await api.setCartQuantity('v 1', 3);
    await api.removeFromCart('v1');
    await api.clearCart();
    expect(request.mock.calls).toEqual([
      ['/cart'],
      ['/cart/items', { method: 'POST', json: { variant_id: 'v1', quantity: 2 } }],
      ['/cart/items/v%201', { method: 'PATCH', json: { quantity: 3 } }],
      ['/cart/items/v1', { method: 'DELETE' }],
      ['/cart', { method: 'DELETE' }],
    ]);
  });
});

describe('orders', () => {
  it('lists orders and reads one', async () => {
    const request = fake();
    const api = createOrdersApi(request);
    await api.listOrders();
    await api.getOrder('o 1');
    expect(request.mock.calls).toEqual([['/orders'], ['/orders/o%201']]);
  });
});

describe('admin', () => {
  it('manages pieces', async () => {
    const request = fake();
    const api = createAdminApi(request);
    await api.listAdminProducts();
    await api.getAdminProduct('p1');
    await api.createProduct({ name: 'x' });
    await api.saveProduct('p1', { name: 'y' });
    await api.deleteProduct('p1');
    expect(request.mock.calls).toEqual([
      ['/admin/products'],
      ['/admin/products/p1'],
      ['/products', { method: 'POST', json: { name: 'x' } }],
      ['/products/p1', { method: 'PUT', json: { name: 'y' } }],
      ['/products/p1', { method: 'DELETE' }],
    ]);
  });

  it('manages photos; an upload sends the file as multipart form data', async () => {
    const request = fake();
    const api = createAdminApi(request);
    const file = new Blob(['x'], { type: 'image/png' });
    await api.uploadImage('p1', file);
    await api.deleteImage('p1', 'i1');
    await api.reorderImages('p1', ['i2', 'i1']);
    const [uploadPath, uploadOptions] = request.mock.calls[0];
    expect(uploadPath).toBe('/products/p1/images');
    expect(uploadOptions.method).toBe('POST');
    expect(uploadOptions.body).toBeInstanceOf(FormData);
    expect(uploadOptions.body.get('file')).toBeInstanceOf(Blob);
    expect(request.mock.calls.slice(1)).toEqual([
      ['/products/p1/images/i1', { method: 'DELETE' }],
      ['/products/p1/images/order', { method: 'PUT', json: { image_ids: ['i2', 'i1'] } }],
    ]);
  });

  it('manages discounts', async () => {
    const request = fake();
    const api = createAdminApi(request);
    await api.listDiscounts();
    await api.createDiscount({ name: 'a' });
    await api.replaceDiscount('d1', { name: 'b' });
    await api.deleteDiscount('d1');
    expect(request.mock.calls).toEqual([
      ['/admin/discounts'],
      ['/admin/discounts', { method: 'POST', json: { name: 'a' } }],
      ['/admin/discounts/d1', { method: 'PUT', json: { name: 'b' } }],
      ['/admin/discounts/d1', { method: 'DELETE' }],
    ]);
  });
});
