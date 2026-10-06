import { listProducts } from '../api/products.js';
import { el, link } from '../components/dom.js';
import { productCard } from '../components/productCard.js';
import { emptyState, errorState, loading } from '../components/states.js';
import { site } from '../content/site.js';
import { keepFresh } from '../live.js';

const NEW_IN_COUNT = 4;

const hero = () => {
  const { title, subtitle, cta, image } = site.hero;
  const section = el(
    'section',
    { className: 'hero' },
    el('div', { className: 'hero-text' }, el('h1', { textContent: title }), el('p', { textContent: subtitle }), link('/shop', cta, 'button primary')),
  );
  // A photo, when one is configured; otherwise the CSS gradient. Set as a style property (not
  // markup), so the value is never interpreted as HTML.
  if (image) section.style.backgroundImage = `url("${image}")`;
  return section;
};

const tiles = () =>
  el(
    'section',
    { className: 'collection' },
    el('h2', { textContent: 'Collection' }),
    el(
      'div',
      { className: 'tiles' },
      ...site.tiles.map((t) => {
        const tile = link(t.to, t.label, 'tile');
        if (t.image) tile.style.backgroundImage = `linear-gradient(to top, var(--hero-overlay), transparent 60%), url("${t.image}")`;
        return tile;
      }),
    ),
  );

const banner = () =>
  el(
    'section',
    { className: 'banner' },
    el('h2', { textContent: site.banner.title }),
    el('p', { textContent: site.banner.text }),
    link(site.banner.to, site.banner.cta, 'button'),
  );

/** The landing page: brand first, then the newest pieces taken live from the catalogue. */
export const renderHome = (view) => {
  const newIn = el('section', { className: 'new-in' });
  let shown = null;

  const draw = (products) => {
    shown = JSON.stringify(products);
    const latest = products.slice(0, NEW_IN_COUNT);
    newIn.replaceChildren(
      el('div', { className: 'section-head' }, el('h2', { textContent: 'New in' }), link('/shop', 'View all')),
      latest.length ? el('div', { className: 'grid' }, ...latest.map(productCard)) : emptyState('No pieces yet', 'Check back soon for new arrivals.'),
    );
  };

  const load = async () => {
    newIn.replaceChildren(el('h2', { textContent: 'New in' }), loading());
    try {
      draw(await listProducts());
    } catch (error) {
      newIn.replaceChildren(el('h2', { textContent: 'New in' }), errorState(error, load));
    }
  };

  const refresh = async () => {
    const products = await listProducts();
    if (JSON.stringify(products) !== shown) draw(products);
  };

  view.replaceChildren(hero(), newIn, tiles(), banner());
  load();
  return keepFresh(refresh);
};
