import { getCatalogueOptions } from '../api/catalogue.js';
import { getProduct } from '../api/products.js';
import { el, link } from '../components/dom.js';
import { errorState, loading } from '../components/states.js';
import { formatNaira } from '../lib/money.js';
import { formatMeasurements, isSoldOut, sizeLabel, sortedImages, sortVariants } from '../lib/products.js';

const LOW_STOCK = 3;

const gallery = (product) => {
  const images = sortedImages(product);
  if (images.length === 0) return el('div', { className: 'gallery' }, el('div', { className: 'no-photo', textContent: 'No photo yet' }));

  const main = el('img', { className: 'main-photo', src: images[0].url, alt: product.name });
  const thumbs = images.length > 1
    ? el('div', { className: 'thumbs' }, ...images.map((image, i) => {
        const button = el('button', { type: 'button', className: 'thumb', attrs: { 'aria-label': `Show photo ${i + 1}` } }, el('img', { src: image.url, alt: '' }));
        button.addEventListener('click', () => { main.src = image.url; });
        return button;
      }))
    : null;
  return el('div', { className: 'gallery' }, main, thumbs);
};

const sizePicker = (product, options) => {
  const variants = sortVariants(product.variants, options);
  let selected = variants.find((v) => v.stock > 0)?.size ?? null;

  const sizes = el('div', { className: 'sizes', attrs: { role: 'group', 'aria-label': 'Sizes' } });
  const details = el('div', { className: 'size-details' });

  const draw = () => {
    sizes.replaceChildren(...variants.map((variant) => {
      const out = variant.stock <= 0;
      const button = el(
        'button',
        { type: 'button', className: 'size', disabled: out, dataset: { size: variant.size }, attrs: { 'aria-pressed': String(variant.size === selected) } },
        sizeLabel(options, variant.size),
        out && el('small', { textContent: ' · Sold out' }),
      );
      button.addEventListener('click', () => { selected = variant.size; draw(); });
      return button;
    }));

    const current = variants.find((v) => v.size === selected);
    if (!current) { details.replaceChildren(); return; }

    const rows = formatMeasurements(current.measurements, options);
    details.replaceChildren(
      current.stock <= LOW_STOCK && el('p', { className: 'stock-note', textContent: `Only ${current.stock} left` }),
      el(
        'div',
        { className: 'measurements' },
        el('h3', { textContent: `Measurements for ${sizeLabel(options, current.size)}` }),
        rows.length
          ? el('table', {}, el('tbody', {}, ...rows.map((r) => el('tr', {}, el('th', { scope: 'row', textContent: r.label }), el('td', { textContent: r.text })))))
          : el('p', { textContent: 'No measurements provided for this size.' }),
      ),
    );
  };

  draw();
  return el('div', {}, sizes, details);
};

const missing = () =>
  el('div', { className: 'state' }, el('h1', { textContent: 'Piece not found' }), el('p', { textContent: 'This piece could not be found. It may have been removed.' }), link('/', 'Back to the shop'));

export const renderProduct = (view, { params }) => {
  const load = async () => {
    view.replaceChildren(loading());
    try {
      // The size list only improves labels and ordering, so its failure must not hide the piece.
      const [product, options] = await Promise.all([getProduct(params.id), getCatalogueOptions().catch(() => null)]);
      view.replaceChildren(
        el(
          'article',
          { className: 'product' },
          gallery(product),
          el(
            'div',
            { className: 'info' },
            el('h1', { textContent: product.name }),
            el('p', { className: 'price', textContent: formatNaira(product.price_kobo) }),
            isSoldOut(product) && el('p', { className: 'badge', textContent: 'Sold out' }),
            product.description && el('p', { className: 'description', textContent: product.description }),
            sizePicker(product, options),
          ),
        ),
      );
    } catch (error) {
      view.replaceChildren(error?.code === 'not_found' ? missing() : errorState(error, load));
    }
  };

  load();
};
