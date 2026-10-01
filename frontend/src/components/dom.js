/**
 * Build a DOM element safely.
 *
 * Everything goes in through `textContent` and `append` with plain strings, which the browser
 * treats as TEXT. Never use `innerHTML` with data: a product named `<img onerror=...>` would
 * then run as code (XSS). Here it just shows up as visible text.
 *
 * Special props: `dataset` (object -> data-* attributes) and `attrs` (object -> setAttribute,
 * for things like `aria-*` that are not plain properties). Everything else is assigned as a
 * property (className, textContent, href, type, disabled, ...). Falsy children are skipped.
 *
 * @param {string} tag
 * @param {Record<string, any>} [props]
 * @param {...(Node | string | null | false | undefined)} children
 * @returns {HTMLElement}
 */
export const el = (tag, props = {}, ...children) => {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(props)) {
    if (key === 'dataset') Object.assign(node.dataset, value);
    else if (key === 'attrs') Object.entries(value).forEach(([k, v]) => node.setAttribute(k, v));
    else node[key] = value;
  }
  node.append(...children.filter((c) => c !== null && c !== undefined && c !== false));
  return node;
};

/** An in-app link: the router intercepts clicks on `[data-link]` and navigates without a reload. */
export const link = (href, text, className = '') =>
  el('a', { href, textContent: text, className, dataset: { link: '' } });
