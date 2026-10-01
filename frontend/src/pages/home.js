import { listProducts } from '../api/products.js';
import { el } from '../components/dom.js';
import { emptyState, errorState, loading } from '../components/states.js';
import { priceNode } from '../components/price.js';
import { percentOff, priceDisplay } from '../lib/pricing.js';
import { coverImage, isSoldOut } from '../lib/products.js';

const card = (product) => {
  const cover = coverImage(product);
  const photo = cover
    ? el('img', { src: cover.url, alt: '', loading: 'lazy' }) // alt is empty: the name is right below
    : el('div', { className: 'no-photo', textContent: 'No photo yet' });

  const display = priceDisplay(product);
  const off = display.original === null ? 0 : percentOff(display.original, display.current);

  return el(
    'a',
    { className: 'card', href: `/products/${encodeURIComponent(product.id)}`, dataset: { link: '' } },
    el(
      'div',
      { className: 'photo' },
      photo,
      isSoldOut(product) && el('span', { className: 'badge', textContent: 'Sold out' }),
      off > 0 && el('span', { className: 'badge sale', textContent: `-${off}%` }),
    ),
    el('h2', { textContent: product.name }),
    priceNode(display),
  );
};

export const renderHome = (view) => {
  const title = el('h1', { textContent: 'New in' });

  const load = async () => {
    view.replaceChildren(title, loading());
    try {
      const products = await listProducts();
      view.replaceChildren(
        title,
        products.length
          ? el('div', { className: 'grid' }, ...products.map(card))
          : emptyState('No pieces yet', 'Check back soon for new arrivals.'),
      );
    } catch (error) {
      view.replaceChildren(title, errorState(error, load));
    }
  };

  load();
};
