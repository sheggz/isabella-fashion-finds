// One function per backend endpoint, grouped by area. Each factory takes the `request` function
// from createApiClient, so the same endpoint list serves the website (cookies) and the phone
// app (bearer token). Pages call these and never build URLs themselves.

const enc = encodeURIComponent;

export const createProductsApi = (request) => ({
  listProducts: () => request('/products'),
  getProduct: (id) => request(`/products/${enc(id)}`),
});

/** The fixed sizes, body parts, photo rules and cart ceiling, published by the backend. */
export const createCatalogueApi = (request) => ({
  getCatalogueOptions: () => request('/catalogue/options'),
});

export const createAuthApi = (request) => ({
  getMe: () => request('/auth/me'),
  logout: () => request('/auth/logout', { method: 'POST' }),
});

/** The signed-in shopper's cart. Every call answers with the whole updated cart. */
export const createCartApi = (request) => ({
  getCart: () => request('/cart'),
  addToCart: (variantId, quantity) => request('/cart/items', { method: 'POST', json: { variant_id: variantId, quantity } }),
  setCartQuantity: (variantId, quantity) => request(`/cart/items/${enc(variantId)}`, { method: 'PATCH', json: { quantity } }),
  removeFromCart: (variantId) => request(`/cart/items/${enc(variantId)}`, { method: 'DELETE' }),
  clearCart: () => request('/cart', { method: 'DELETE' }),
});

export const createOrdersApi = (request) => ({
  listOrders: () => request('/orders'),
  getOrder: (orderId) => request(`/orders/${enc(orderId)}`),
});

/** Owner-only endpoints. The server enforces the owner role; these are just the calls. */
export const createAdminApi = (request) => ({
  /** Stock levels and sales. `days` = sales window (1-90), `lowStock` = alert threshold. */
  getDashboard: ({ days, lowStock } = {}) => {
    const query = new URLSearchParams();
    if (days !== undefined) query.set('days', String(days));
    if (lowStock !== undefined) query.set('low_stock', String(lowStock));
    const text = query.toString();
    return request(`/admin/dashboard${text ? `?${text}` : ''}`);
  },

  // pieces
  listAdminProducts: () => request('/admin/products'),
  getAdminProduct: (productId) => request(`/admin/products/${enc(productId)}`),
  createProduct: (body) => request('/products', { method: 'POST', json: body }),
  /** Replace the whole piece (details, pricing mode, prices and sizes) in ONE atomic request. */
  saveProduct: (productId, body) => request(`/products/${enc(productId)}`, { method: 'PUT', json: body }),
  deleteProduct: (productId) => request(`/products/${enc(productId)}`, { method: 'DELETE' }),

  // photos. `file` is a File/Blob in a browser, or a { uri, name, type } object from the phone's
  // image picker (React Native's FormData understands that shape).
  uploadImage: (productId, file) => {
    const body = new FormData();
    body.append('file', file);
    return request(`/products/${enc(productId)}/images`, { method: 'POST', body });
  },
  deleteImage: (productId, imageId) => request(`/products/${enc(productId)}/images/${enc(imageId)}`, { method: 'DELETE' }),
  reorderImages: (productId, imageIds) =>
    request(`/products/${enc(productId)}/images/order`, { method: 'PUT', json: { image_ids: imageIds } }),

  // discounts
  listDiscounts: () => request('/admin/discounts'),
  createDiscount: (body) => request('/admin/discounts', { method: 'POST', json: body }),
  replaceDiscount: (discountId, body) => request(`/admin/discounts/${enc(discountId)}`, { method: 'PUT', json: body }),
  deleteDiscount: (discountId) => request(`/admin/discounts/${enc(discountId)}`, { method: 'DELETE' }),
});
