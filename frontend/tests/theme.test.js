// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import { applyTheme } from '../src/theme.js';
import { defaultTheme } from '@isabella/core';

beforeEach(() => {
  document.head.innerHTML = '';
});

describe('applyTheme', () => {
  it('injects the theme as CSS custom properties', () => {
    applyTheme(document, defaultTheme);
    const style = document.getElementById('brand-theme');
    expect(style.textContent).toContain(`--accent: ${defaultTheme.light.accent};`);
  });

  it('replaces the previous theme instead of stacking a second style tag', () => {
    applyTheme(document, defaultTheme);
    applyTheme(document, { ...defaultTheme, light: { ...defaultTheme.light, accent: '#123456' } });
    expect(document.querySelectorAll('#brand-theme')).toHaveLength(1);
    expect(document.getElementById('brand-theme').textContent).toContain('--accent: #123456;');
  });

  it('refuses a broken theme loudly rather than painting a half-styled site', () => {
    const broken = structuredClone(defaultTheme);
    delete broken.light.text;
    expect(() => applyTheme(document, broken)).toThrow(/light\.text is missing/);
  });
});
