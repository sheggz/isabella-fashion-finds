import { el, link } from '../components/dom.js';
import { priceNode } from '../components/price.js';
import { emptyState, errorState, loading } from '../components/states.js';
import { checkoutBlocked, formatNaira, lineNotices, sizeText, stepperState } from '@isabella/core';
import { cart, changeQuantity, emptyCart, loadCart, removeLine } from '../state/cart.js';

/**
 * The cart page. It draws from the cart store and re-draws whenever the store changes, and it
 * returns a cleanup function so the router can stop the subscription when the shopper leaves.
 *
 * Every change goes to the server, which answers with the whole updated cart; nothing is
 * calculated here, so the totals shown always match what the server will charge.
 */
export const renderCart = (view) => {
  let busy = false;
  let message = '';

  // Ignore a second click while the first change is still being saved (no double changes).
  const act = async (change) => {
    if (busy) return;
    busy = true;
    message = '';
    try {
      await change();
    } catch (error) {
      message = error?.message ?? 'Something went wrong. Please try again.';
      draw();
    } finally {
      busy = false;
    }
  };

  const lineNode = (line) => {
    const { canDecrease, canIncrease } = stepperState(line);
    const button = (text, attr, enabled, onClick) => {
      const b = el('button', { type: 'button', textContent: text, disabled: !enabled, dataset: { [attr]: '' } });
      b.addEventListener('click', onClick);
      return b;
    };
    const original = line.base_price_kobo > line.unit_price_kobo ? line.base_price_kobo : null;

    return el(
      'li',
      { className: `cart-line${line.problem ? ' has-problem' : ''}` },
      line.image_url ? el('img', { src: line.image_url, alt: '' }) : el('div', { className: 'no-photo', textContent: 'No photo' }),
      el(
        'div',
        { className: 'line-info' },
        el('a', { href: `/products/${encodeURIComponent(line.product_id)}`, textContent: line.name, dataset: { link: '' } }),
        el('p', { className: 'hint', textContent: `Size ${sizeText(line.size)}` }),
        priceNode({ prefix: '', current: line.unit_price_kobo, original }, 'price'),
        ...lineNotices(line).map((n) => el('p', { className: `notice ${n.kind}`, textContent: n.text })),
        el(
          'div',
          { className: 'stepper' },
          button('−', 'decrease', canDecrease, () => act(() => changeQuantity(line.variant_id, line.quantity - 1))),
          el('span', { className: 'qty', textContent: String(line.quantity), attrs: { 'aria-label': 'Quantity' } }),
          button('+', 'increase', canIncrease, () => act(() => changeQuantity(line.variant_id, line.quantity + 1))),
          button('Remove', 'remove', true, () => act(() => removeLine(line.variant_id))),
        ),
      ),
      el('p', { className: 'line-total', textContent: formatNaira(line.line_total_kobo) }),
    );
  };

  const summary = (data) => {
    const blocked = checkoutBlocked(data);
    const clearButton = el('button', { type: 'button', textContent: 'Empty cart', dataset: { clear: '' } });
    clearButton.addEventListener('click', () => {
      if (window.confirm('Remove everything from your cart?')) act(() => emptyCart());
    });
    return el(
      'aside',
      { className: 'summary' },
      el('p', { textContent: `${data.item_count} ${data.item_count === 1 ? 'item' : 'items'}` }),
      el('p', { className: 'subtotal', textContent: `Subtotal ${formatNaira(data.subtotal_kobo)}` }),
      data.savings_kobo > 0 && el('p', { className: 'savings', textContent: `You save ${formatNaira(data.savings_kobo)}` }),
      // Checkout arrives with the payment milestone; until then the button stays closed and says why.
      el('button', { type: 'button', className: 'button primary checkout', textContent: 'Checkout', disabled: true }),
      el('p', { className: 'hint checkout-hint', textContent: data.has_problems ? 'Fix the items marked above to continue.' : (blocked ? '' : 'Checkout is not open yet.') }),
      clearButton,
    );
  };

  function draw() {
    const { status, data, error } = cart.get();
    const title = el('h1', { textContent: 'Your cart' });

    if (!data) {
      view.replaceChildren(title, status === 'error' ? errorState(error, () => loadCart()) : loading());
      return;
    }
    if (data.lines.length === 0) {
      view.replaceChildren(title, emptyState('Your cart is empty', 'Find something you love in the shop.'), link('/', 'Browse the shop'));
      return;
    }
    view.replaceChildren(
      title,
      el('p', { className: 'cart-alert form-alert', textContent: message, hidden: !message, attrs: { role: 'alert' } }),
      el('div', { className: 'cart-layout' }, el('ul', { className: 'cart-lines' }, ...data.lines.map(lineNode)), summary(data)),
    );
  }

  const unsubscribe = cart.subscribe(draw);
  draw();
  loadCart(); // always fetch fresh: prices and stock may have changed since the shopper last looked
  return unsubscribe;
};
