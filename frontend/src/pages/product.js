import { BASE_URL } from '../api/client.js';
import { getCatalogueOptions } from '../api/catalogue.js';
import { getProduct } from '../api/products.js';
import { el, link } from '../components/dom.js';
import { errorState, loading } from '../components/states.js';
import { priceNode } from '../components/price.js';
import { addToCartState } from '../lib/cart.js';
import { discountNote, percentOff, priceDisplay, variantPriceDisplay } from '../lib/pricing.js';
import { formatMeasurements, isSoldOut, sizeLabel, sortedImages, sortVariants } from '../lib/products.js';
import { addItem } from '../state/cart.js';
import { session } from '../state/session.js';

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

const sizePicker = (product, options, onChange) => {
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
    onChange(current ?? null); // the price shown depends on which size is chosen
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

/**
 * The "Add to cart" area. It follows two things: which size is chosen (`update`) and who is
 * signed in (the session store), and redraws itself when either changes.
 */
const addToCartArea = (product, ceiling) => {
  const area = el('div', { className: 'add-to-cart' });
  let variant = null;
  let quantity = 1;
  let busy = false;
  let confirmation = false;
  let problem = '';

  const draw = () => {
    const { status, user } = session.get();
    const state = addToCartState({
      signedIn: status === 'ready' ? Boolean(user) : null,
      product,
      variant,
      ceiling,
      soldOut: isSoldOut(product),
    });

    if (state.kind === 'wait') { area.replaceChildren(); return; }
    if (state.kind === 'signin') {
      area.replaceChildren(el('a', { className: 'button primary sign-in-prompt', href: `${BASE_URL}/auth/google/login`, textContent: 'Sign in to add to cart' }));
      return;
    }
    if (state.kind !== 'ready') {
      area.replaceChildren(el('button', { type: 'button', className: 'button', disabled: true, textContent: state.kind === 'sold_out' ? 'Sold out' : 'Choose a size' }));
      return;
    }

    quantity = Math.min(Math.max(quantity, 1), state.max);
    const select = el('select', { name: 'quantity' }, ...Array.from({ length: state.max }, (_, i) => el('option', { value: String(i + 1), textContent: String(i + 1), selected: i + 1 === quantity })));
    select.addEventListener('change', () => { quantity = Number(select.value); });

    const add = el('button', { type: 'button', className: 'button primary add-to-cart', textContent: busy ? 'Adding…' : 'Add to cart', disabled: busy });
    add.addEventListener('click', async () => {
      if (busy) return; // ignore a second click while the first is still being added
      busy = true; confirmation = false; problem = '';
      draw();
      try {
        await addItem(variant.id, quantity);
        confirmation = true;
        quantity = 1;
      } catch (error) {
        problem = error?.message ?? 'Could not add that to your cart.';
      } finally {
        busy = false;
        draw();
      }
    });

    area.replaceChildren(
      el('div', { className: 'add-row' }, el('label', {}, 'Quantity ', select), add),
      product.max_per_order && el('p', { className: 'hint limit-note', textContent: `Limited to ${product.max_per_order} per order` }),
      confirmation && el('p', { className: 'cart-status', attrs: { role: 'status' } }, 'Added to cart ✓ ', link('/cart', 'View cart')),
      problem && el('p', { className: 'cart-error field-error', textContent: problem, attrs: { role: 'alert' } }),
    );
  };

  draw();
  return {
    node: area,
    update(next) { variant = next; confirmation = false; problem = ''; draw(); },
    stop: session.subscribe(draw),
  };
};

const missing = () =>
  el('div', { className: 'state' }, el('h1', { textContent: 'Piece not found' }), el('p', { textContent: 'This piece could not be found. It may have been removed.' }), link('/', 'Back to the shop'));

export const renderProduct = (view, { params }) => {
  let stopWatching = () => {};
  let left = false; // set when the shopper leaves, so a page still loading does not start watching afterwards

  const load = async () => {
    stopWatching();
    view.replaceChildren(loading());
    try {
      // The size list only improves labels and ordering, so its failure must not hide the piece.
      const [product, options] = await Promise.all([getProduct(params.id), getCatalogueOptions().catch(() => null)]);
      if (left) return;
      // The price is its own block because it changes with the selected size (sizes can be
      // priced separately) and shows the sale while a discount is live.
      const priceBlock = el('div', { className: 'price-block' });
      const drawPrice = (variant) => {
        const display = variant ? { prefix: '', ...variantPriceDisplay(variant) } : priceDisplay(product);
        const off = display.original === null ? 0 : percentOff(display.original, display.current);
        priceBlock.replaceChildren(
          el('div', { className: 'price-line' }, priceNode(display, 'price big'), off > 0 && el('span', { className: 'badge sale', textContent: `-${off}%` })),
          product.discount && el('p', { className: 'discount-note', textContent: discountNote(product.discount, new Date().getTimezoneOffset()) }),
        );
      };
      const addArea = addToCartArea(product, options?.cart?.max_per_line);
      stopWatching = addArea.stop;
      const picker = sizePicker(product, options, (variant) => {
        drawPrice(variant);
        addArea.update(variant);
      });

      view.replaceChildren(
        el(
          'article',
          { className: 'product' },
          gallery(product),
          el(
            'div',
            { className: 'info' },
            el('h1', { textContent: product.name }),
            priceBlock,
            isSoldOut(product) && el('p', { className: 'badge', textContent: 'Sold out' }),
            product.description && el('p', { className: 'description', textContent: product.description }),
            picker,
            addArea.node,
          ),
        ),
      );
    } catch (error) {
      view.replaceChildren(error?.code === 'not_found' ? missing() : errorState(error, load));
    }
  };

  load();
  return () => { // the router calls this when the shopper leaves the page
    left = true;
    stopWatching();
  };
};
