import { getDashboard } from '../../api/admin.js';
import { el, link } from '../../components/dom.js';
import { emptyState, errorState, loading } from '../../components/states.js';
import { keepFresh } from '../../live.js';
import { barHeights, formatNaira, shortDayLabel } from '@isabella/core';

const DAYS = 30;

const tile = (label, value) =>
  el('div', { className: 'stat' }, el('p', { className: 'stat-value', textContent: value }), el('p', { className: 'stat-label', textContent: label }));

const salesChart = (byDay) => {
  const heights = barHeights(byDay.map((d) => d.revenue_kobo));
  return el(
    'div',
    { className: 'bar-chart', attrs: { role: 'img', 'aria-label': `Daily sales, last ${byDay.length} days` } },
    ...byDay.map((day, i) => {
      const bar = el('div', {
        className: 'bar',
        attrs: { 'aria-label': `${shortDayLabel(day.date)}: ${formatNaira(day.revenue_kobo)}, ${day.orders} orders`, title: `${shortDayLabel(day.date)}: ${formatNaira(day.revenue_kobo)}` },
      });
      bar.style.height = `${heights[i]}%`;
      return bar;
    }),
  );
};

const salesSection = (sales) => {
  if (sales.orders === 0) {
    return el('section', { className: 'panel' }, el('h2', { textContent: `Sales, last ${sales.days} days` }), emptyState('No paid orders yet', 'Sales appear here once customers can pay online.'));
  }
  return el(
    'section',
    { className: 'panel' },
    el('h2', { textContent: `Sales, last ${sales.days} days` }),
    el('div', { className: 'stats' }, tile('Revenue', formatNaira(sales.revenue_kobo)), tile('Orders', String(sales.orders)), tile('Items sold', String(sales.items_sold)), tile('Average order', formatNaira(sales.average_order_kobo))),
    salesChart(sales.by_day),
    el('h3', { textContent: 'Best sellers' }),
    el(
      'ol',
      { className: 'ranked' },
      ...sales.top_products.map((p) => el('li', {}, p.product_id ? link(`/admin/products/${encodeURIComponent(p.product_id)}`, p.name) : el('span', { textContent: p.name }), el('span', { className: 'hint', textContent: ` ${p.units} sold · ${formatNaira(p.revenue_kobo)}` }))),
    ),
  );
};

const stockSection = (stock) => {
  const calm = stock.low_stock.length === 0 && stock.sold_out.length === 0;
  return el(
    'section',
    { className: 'panel' },
    el('h2', { textContent: 'Stock' }),
    el('div', { className: 'stats' }, tile('Units in stock', String(stock.units_in_stock)), tile('Pieces on sale', String(stock.visible_pieces)), tile('Pieces in total', String(stock.pieces))),
    calm && el('p', { className: 'state', textContent: 'Nothing is running low. Good.' }),
    stock.sold_out.length > 0 && el('h3', { textContent: 'Sold out' }),
    stock.sold_out.length > 0 && el('ul', { className: 'ranked' }, ...stock.sold_out.map((p) => el('li', {}, link(`/admin/products/${encodeURIComponent(p.product_id)}`, p.name)))),
    stock.low_stock.length > 0 && el('h3', { textContent: `Running low (${stock.low_stock_threshold} or fewer)` }),
    stock.low_stock.length > 0 &&
      el(
        'ul',
        { className: 'ranked' },
        ...stock.low_stock.map((r) => el('li', {}, link(`/admin/products/${encodeURIComponent(r.product_id)}`, `${r.name} (${r.size})`), el('span', { className: 'hint', textContent: ` ${r.stock} left` }))),
      ),
  );
};

/** The owner's home screen: how the shop is doing, and what needs attention. Refreshes itself. */
export const renderAdminDashboard = (view) => {
  const heading = el('div', { className: 'page-head' }, el('h1', { textContent: 'Dashboard' }));
  let shown = null;

  const draw = (data) => {
    shown = JSON.stringify(data);
    view.replaceChildren(heading, el('div', { className: 'dashboard' }, stockSection(data.stock), salesSection(data.sales)));
  };

  const load = async () => {
    view.replaceChildren(heading, loading());
    try {
      draw(await getDashboard({ days: DAYS }));
    } catch (error) {
      view.replaceChildren(heading, errorState(error, load));
    }
  };

  const refresh = async () => {
    const data = await getDashboard({ days: DAYS });
    if (JSON.stringify(data) !== shown) draw(data);
  };

  load();
  return keepFresh(refresh);
};
