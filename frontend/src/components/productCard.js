import { coverImage, isSoldOut, percentOff, priceDisplay } from '@isabella/core';
import { el } from './dom.js';
import { priceNode } from './price.js';

/** One product tile (photo, badges, name, price). Shared by the shop and the landing page. */
export const productCard = (product) => {
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
