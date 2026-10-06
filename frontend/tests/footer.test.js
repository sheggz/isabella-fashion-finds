// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import { renderFooter } from '../src/components/footer.js';
import { site } from '../src/content/site.js';

let host;
beforeEach(() => {
  document.body.innerHTML = '<footer id="f"></footer>';
  host = document.querySelector('#f');
});

describe('footer', () => {
  it('lists every column and link from the site content as in-app links', () => {
    renderFooter(host);
    for (const column of site.footerColumns) {
      expect(host.textContent).toContain(column.title);
      for (const item of column.links) {
        const a = host.querySelector(`a[href="${item.to}"]`);
        expect(a, item.to).not.toBeNull();
        expect(a.hasAttribute('data-link')).toBe(true);
      }
    }
  });

  it('shows the copyright with the current year passed in (no clock read inside)', () => {
    renderFooter(host, { year: 2031 });
    expect(host.textContent).toContain('2031');
    expect(host.textContent).toContain(site.copyright);
  });
});
