import { site } from '../content/site.js';
import { el, link } from './dom.js';

/**
 * Draw the footer into `host`. `year` is a parameter (default: this year) so the output is the
 * same for the same input and tests do not depend on the clock.
 */
export const renderFooter = (host, { year = new Date().getFullYear() } = {}) => {
  const columns = site.footerColumns.map((column) =>
    el(
      'nav',
      { className: 'footer-column', attrs: { 'aria-label': column.title } },
      el('h2', { textContent: column.title }),
      el('ul', {}, ...column.links.map((item) => el('li', {}, link(item.to, item.label)))),
    ),
  );
  host.replaceChildren(
    el(
      'div',
      { className: 'footer-inner' },
      el('div', { className: 'footer-brand' }, el('p', { className: 'footer-name', textContent: site.brandName })),
      ...columns,
    ),
    el('p', { className: 'footer-legal', textContent: `© ${year} ${site.copyright}` }),
  );
};
