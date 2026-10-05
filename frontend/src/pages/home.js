import { listProducts } from '../api/products.js';
import { el } from '../components/dom.js';
import { emptyState, errorState, loading } from '../components/states.js';
import { keepFresh } from '../live.js';
import { priceNode } from '../components/price.js';
import { coverImage, isSoldOut, percentOff, priceDisplay } from '@isabella/core';

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
  let shown = null; // the last list drawn, as text, so a refresh only redraws when something changed

  const draw = (products) => {
    shown = JSON.stringify(products);
    view.replaceChildren(
      title,
      products.length
        ? el('div', { className: 'grid' }, ...products.map(card))
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
