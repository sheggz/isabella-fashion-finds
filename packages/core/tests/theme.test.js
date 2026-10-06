import { describe, it, expect } from 'vitest';
import { COLOR_KEYS, defaultTheme, findThemeProblems, themeToCss } from '../src/index.js';

const tiny = {
  fonts: { body: 'Body, sans-serif', heading: 'Head, serif' },
  radius: '4px',
  light: { bg: '#ffffff', accentText: '#000000' },
  dark: { bg: '#000000', accentText: '#ffffff' },
};

describe('themeToCss', () => {
  it('turns camelCase colour names into CSS custom properties', () => {
    const css = themeToCss(tiny);
    expect(css).toContain('--bg: #ffffff;');
    expect(css).toContain('--accent-text: #000000;');
  });

  it('puts fonts and radius in the base block and dark colours in a dark-mode media query', () => {
    const css = themeToCss(tiny);
    expect(css).toContain('--font-body: Body, sans-serif;');
    expect(css).toContain('--font-heading: Head, serif;');
    expect(css).toContain('--radius: 4px;');
    expect(css).toMatch(/@media \(prefers-color-scheme: dark\)\s*{\s*:root[^{]*{[^}]*--bg: #000000;/);
  });

  it('can force a scheme (for a manual toggle later) with data-theme selectors', () => {
    const css = themeToCss(tiny);
    expect(css).toContain(':root[data-theme="dark"]');
    expect(css).toContain(':root[data-theme="light"]');
  });

  it('is pure: same theme, same text, and the input is not changed', () => {
    const copy = JSON.parse(JSON.stringify(tiny));
    expect(themeToCss(tiny)).toBe(themeToCss(tiny));
    expect(tiny).toEqual(copy);
  });
});

describe('findThemeProblems (catches typos when the brand colours are changed)', () => {
  it('accepts the default theme', () => {
    expect(findThemeProblems(defaultTheme)).toEqual([]);
  });

  it('reports a colour missing from light or dark', () => {
    const broken = structuredClone(defaultTheme);
    delete broken.dark.accent;
    expect(findThemeProblems(broken)).toContain('dark.accent is missing');
  });

  it('reports a value that is not a hex colour', () => {
    const broken = structuredClone(defaultTheme);
    broken.light.text = 'blackish';
    expect(findThemeProblems(broken)).toContain('light.text must be a hex colour like #1a1a1a (got "blackish")');
  });

  it('reports unknown colour names (probably a typo)', () => {
    const broken = structuredClone(defaultTheme);
    broken.light.acent = '#ffffff';
    expect(findThemeProblems(broken)).toContain('light.acent is not a known colour name');
  });

  it('every required colour key is defined in both schemes of the default theme', () => {
    for (const key of COLOR_KEYS) {
      expect(defaultTheme.light[key]).toBeDefined();
      expect(defaultTheme.dark[key]).toBeDefined();
    }
  });
});
