import { deleteProduct, listAdminProducts } from '../../api/admin.js';
import { getCatalogueOptions } from '../../api/catalogue.js';
import { el, link } from '../../components/dom.js';
import { keepFresh } from '../../live.js';
import { emptyState, errorState, loading } from '../../components/states.js';
import { formatNaira, stockSummary } from '@isabella/core';

export const renderAdminList = (view) => {
  let shown = null; // last data drawn, so a background refresh only redraws on change
  const heading = el(
    'div',
    { className: 'page-head' },
    el('h1', { textContent: 'Your pieces' }),
    link('/admin/products/new', 'Add a piece', 'button primary'),
  );
  const notice = el('div', { className: 'form-alert', hidden: true, attrs: { role: 'alert' } });

  const remove = async (product) => {
    if (!window.confirm(`Delete "${product.name}"? This also removes its photos and cannot be undone.`)) return;
    notice.hidden = true;
    try {
      await deleteProduct(product.id);
      await load();
    } catch (error) {
      notice.textContent = error?.message ?? 'Could not delete that piece.';
      notice.hidden = false;
    }
  };

  const row = (product, options) => {
    const del = el('button', { type: 'button', textContent: 'Delete', className: 'danger', dataset: { delete: '' } });
    del.addEventListener('click', () => remove(product));
    return el(
      'tr',
      {},
      el('td', {}, link(`/admin/products/${encodeURIComponent(product.id)}`, product.name)),
      el('td', { textContent: formatNaira(product.price_kobo) }),
      el('td', { textContent: stockSummary(product, options) }),
      el('td', {}, el('span', { className: `badge${product.is_active ? '' : ' muted'}`, textContent: product.is_active ? 'Visible' : 'Hidden' })),
      el('td', { className: 'actions' }, link(`/admin/products/${encodeURIComponent(product.id)}`, 'Edit'), del),
    );
  };

  const table = (products, options) =>
    el(
      'div',
      { className: 'table-wrap' },
      el(
        'table',
        { className: 'admin-table' },
        el('thead', {}, el('tr', {}, ...['Piece', 'Price', 'Stock by size', 'Status', ''].map((h) => el('th', { scope: 'col', textContent: h })))),
        el('tbody', {}, ...products.map((p) => row(p, options))),
      ),
    );

  const draw = ([products, options]) => {
    shown = JSON.stringify([products, options]);
    view.replaceChildren(
      heading,
      notice,
      products.length ? table(products, options) : emptyState('No pieces yet', 'Add your first piece to start selling.'),
    );
  };

  // The size list only improves the stock labels, so its failure must not block the page.
  const fetchAll = () => Promise.all([listAdminProducts(), getCatalogueOptions().catch(() => null)]);

  async function load() {
    view.replaceChildren(heading, loading());
    try {
      draw(await fetchAll());
    } catch (error) {
      view.replaceChildren(heading, errorState(error, load));
    }
  }

  const refresh = async () => {
    const data = await fetchAll();
    if (JSON.stringify(data) !== shown) draw(data);
  };

  load();
  return keepFresh(refresh);
};
