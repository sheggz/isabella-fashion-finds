// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import { pages } from '../src/content/pages.js';
import { renderInfoPage } from '../src/pages/info.js';
import { routes } from '../src/app.js';

let view;
beforeEach(() => {
  document.body.innerHTML = '<div id="view"></div>';
  view = document.querySelector('#view');
});

describe('info pages', () => {
  it('renders the title and every section of a page from the content file', () => {
    renderInfoPage('faq')(view);
    expect(view.querySelector('h1').textContent).toBe(pages.faq.title);
    expect(view.querySelectorAll('section')).toHaveLength(pages.faq.sections.length);
  });

  it('renders text as text, never as HTML', () => {
    pages.__hostile = { title: 'x', sections: [{ heading: '<img src=x onerror=1>', body: ['<b>hi</b>'] }] };
    renderInfoPage('__hostile')(view);
    expect(view.querySelector('img')).toBeNull();
    expect(view.querySelector('b')).toBeNull();
    delete pages.__hostile;
  });

  it('has a route for every page the footer and header link to', async () => {
    const { site } = await import('../src/content/site.js');
    const paths = routes.map((r) => r.pattern);
    const targets = [...site.nav, ...site.footerColumns.flatMap((c) => c.links)].map((l) => l.to);
    for (const to of targets) expect(paths, to).toContain(to);
  });
});
