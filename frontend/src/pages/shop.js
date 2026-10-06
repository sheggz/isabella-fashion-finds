import { listProducts } from '../api/products.js';
import { el } from '../components/dom.js';
import { emptyState, errorState, loading } from '../components/states.js';
import { keepFresh } from '../live.js';
import { productCard } from '../components/productCard.js';

export const renderShop = (view) => {
  const title = el('h1', { textContent: 'Shop' });
  let shown = null; // the last list drawn, as text, so a refresh only redraws when something changed

  const draw = (products) => {
    shown = JSON.stringify(products);
    view.replaceChildren(
      title,
      products.length
        ? el('div', { className: 'grid' }, ...products.map(productCard))
        : emptyState('No pieces yet', 'Check back soon for new arrivals.'),
    );
  };

  const load = async () => {
    view.replaceChildren(title, loading());
    try {
      draw(await listProducts());
    } catch (error) {
      view.replaceChildren(title, errorState(error, load));
    }
  };

  // Background refresh: silent. Failure keeps what is on screen; no change means no redraw (no flicker).
  const refresh = async () => {
    const products = await listProducts();
    if (JSON.stringify(products) !== shown) draw(products);
  };

  load();
  return keepFresh(refresh);
};
