// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { adminShell } from '../src/components/adminShell.js';

describe('admin shell', () => {
  it('lists the owner sections and marks the current one', () => {
    const { root } = adminShell('adminDiscounts');
    const labels = [...root.querySelectorAll('nav a')].map((a) => a.textContent);
    expect(labels).toEqual(['Dashboard', 'Products', 'Discounts']);
    const current = root.querySelectorAll('nav a[aria-current="page"]');
    expect(current).toHaveLength(1);
    expect(current[0].textContent).toBe('Discounts');
  });

  it('treats editing a piece as part of Products', () => {
    expect(adminShell('adminEdit').root.querySelector('a[aria-current="page"]').textContent).toBe('Products');
    expect(adminShell('adminNew').root.querySelector('a[aria-current="page"]').textContent).toBe('Products');
  });

  it('returns a content area for the page to render into', () => {
    const { root, content } = adminShell('admin');
    expect(root.contains(content)).toBe(true);
  });
});
