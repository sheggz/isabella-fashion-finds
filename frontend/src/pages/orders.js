import { listOrders } from '../api/orders.js';
import { el, link } from '../components/dom.js';
import { priceNode } from '../components/price.js';
import { emptyState, errorState, loading } from '../components/states.js';
import { formatNaira, formatWhen, orderStatusLabel, sizeText } from '@isabella/core';

const itemNode = (item) => {
  const original = item.base_price_kobo > item.unit_price_kobo ? item.base_price_kobo : null;
  // The product may have been deleted since; the order line is a copy, so it still reads fine.
  const name = item.product_id
    ? link(`/products/${encodeURIComponent(item.product_id)}`, item.product_name)
    : el('span', { textContent: item.product_name });
  return el(
    'li',
    {},
    item.image_url ? el('img', { src: item.image_url, alt: '' }) : el('div', { className: 'no-photo', textContent: 'No photo' }),
    el(
      'div',
      {},
      name,
      el('p', { className: 'hint', textContent: `Size ${sizeText(item.size)} × ${item.quantity}` }),
      priceNode({ prefix: '', current: item.unit_price_kobo, original }, 'price'),
      item.discount_name && el('p', { className: 'discount-note', textContent: item.discount_name }),
    ),
    el('p', { className: 'line-total', textContent: formatNaira(item.line_total_kobo) }),
  );
};

const orderNode = (order, tzOffset) =>
  el(
    'article',
    { className: 'order' },
    el(
      'header',
      {},
      el('p', { className: 'order-date', textContent: formatWhen(order.created_at, tzOffset) }),
      el('span', { className: `badge order-${order.status}`, textContent: orderStatusLabel(order.status) }),
      el('p', { className: 'order-total', textContent: formatNaira(order.total_kobo) }),
    ),
    el('ul', { className: 'order-items' }, ...order.items.map(itemNode)),
  );

export const renderOrders = (view) => {
  const title = el('h1', { textContent: 'My orders' });

  const load = async () => {
    view.replaceChildren(title, loading());
    try {
      const orders = await listOrders();
      const tz = new Date().getTimezoneOffset();
      view.replaceChildren(
        title,
        orders.length
          ? el('div', { className: 'orders' }, ...orders.map((o) => orderNode(o, tz)))
          : el('div', {}, emptyState('No orders yet', 'When you buy something it will show up here.'), link('/', 'Browse the shop')),
      );
    } catch (error) {
      view.replaceChildren(title, errorState(error, load));
    }
  };

  load();
};
