import { pages } from '../content/pages.js';
import { el } from '../components/dom.js';

/**
 * Build a page renderer for one entry of content/pages.js. A function that RETURNS a function
 * (a "factory") because the router wants `render(view)`, while each route needs a different key.
 * All text goes through `el`/textContent, so content can never inject HTML.
 */
export const renderInfoPage = (key) => (view) => {
  const page = pages[key];
  view.replaceChildren(
    el(
      'article',
      { className: 'info-page' },
      el('h1', { textContent: page.title }),
      ...page.sections.map((section) =>
        el('section', {}, el('h2', { textContent: section.heading }), ...section.body.map((text) => el('p', { textContent: text }))),
      ),
    ),
  );
};
