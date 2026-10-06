// THE BRAND KIT, in one place.
//
// To rebrand the whole product (website now, mobile app next), edit the values in
// `defaultTheme` below and nothing else: colours, fonts and corner roundness. Everything else
// reads these as CSS variables (web) or as plain values (mobile). `findThemeProblems` is run in
// the tests, so a typo (missing colour, bad hex) fails the build instead of reaching users.
//
// The colours here are PLACEHOLDERS until the real brand kit is decided.

/** Every colour the interface may use. Add a name here only when a new role is needed. */
export const COLOR_KEYS = [
  'bg', // page background
  'surface', // cards, forms, panels
  'text', // main text
  'muted', // secondary text
  'accent', // brand colour: buttons, links, highlights
  'accentText', // text on top of `accent`
  'border',
  'danger',
  'success',
  'info',
  'warning',
  'topbarBg', // the thin announcement strip above the header
  'topbarText',
  'footerBg',
  'footerText',
  'heroOverlay', // translucent layer that keeps text readable over photos (any CSS colour)
  'onImage', // text drawn directly over photos
];

export const defaultTheme = {
  fonts: {
    body: "'Montserrat', system-ui, -apple-system, 'Segoe UI', sans-serif",
    heading: "'Montserrat', system-ui, -apple-system, 'Segoe UI', sans-serif",
  },
  radius: '4px',
  light: {
    bg: '#ffffff',
    surface: '#ffffff',
    text: '#1f1f1f',
    muted: '#6b6b6b',
    accent: '#5f6f55',
    accentText: '#ffffff',
    border: '#e4e4e0',
    danger: '#b3261e',
    success: '#1d7a46',
    info: '#1b5fa8',
    warning: '#b26a00',
    topbarBg: '#5f6f55',
    topbarText: '#ffffff',
    footerBg: '#444444',
    footerText: '#f2f2f0',
    heroOverlay: 'rgba(0, 0, 0, 0.35)',
    onImage: '#ffffff',
  },
  dark: {
    bg: '#141414',
    surface: '#1d1d1d',
    text: '#f0f0ec',
    muted: '#a3a3a0',
    accent: '#93a688',
    accentText: '#141414',
    border: '#343434',
    danger: '#ff8a80',
    success: '#5fc48a',
    info: '#7ab4f0',
    warning: '#e0a24a',
    topbarBg: '#2f372a',
    topbarText: '#f0f0ec',
    footerBg: '#0e0e0e',
    footerText: '#d8d8d4',
    heroOverlay: 'rgba(0, 0, 0, 0.45)',
    onImage: '#ffffff',
  },
};

const HEX = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i;
// `heroOverlay` is the one colour that needs transparency, so it may be any CSS colour function.
const FREE_FORM = new Set(['heroOverlay']);

const kebab = (name) => name.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`);
const declarations = (colors) =>
  Object.entries(colors)
    .map(([name, value]) => `  --${kebab(name)}: ${value};`)
    .join('\n');

/**
 * Check a theme for mistakes. Returns a list of plain-language problems (empty = fine).
 * @param {typeof defaultTheme} theme
 * @returns {string[]}
 */
export const findThemeProblems = (theme) => {
  const problems = [];
  for (const scheme of ['light', 'dark']) {
    const colors = theme[scheme] ?? {};
    for (const key of COLOR_KEYS) {
      if (!(key in colors)) problems.push(`${scheme}.${key} is missing`);
    }
    for (const [key, value] of Object.entries(colors)) {
      if (!COLOR_KEYS.includes(key)) problems.push(`${scheme}.${key} is not a known colour name`);
      else if (!FREE_FORM.has(key) && !HEX.test(String(value))) {
        problems.push(`${scheme}.${key} must be a hex colour like #1a1a1a (got "${value}")`);
      }
    }
  }
  return problems;
};

/**
 * Turn a theme into CSS text: custom properties on `:root` for light, the dark set inside
 * `prefers-color-scheme: dark` (follows the device), and `data-theme` overrides so a manual
 * light/dark switch can be added later without touching any component.
 *
 * Pure: no document access here; the web app injects the returned text (see frontend/src/theme.js).
 * @param {typeof defaultTheme} theme
 * @returns {string}
 */
export const themeToCss = (theme) =>
  [
    ':root {',
    `  --font-body: ${theme.fonts.body};`,
    `  --font-heading: ${theme.fonts.heading};`,
    `  --radius: ${theme.radius};`,
    declarations(theme.light),
    '}',
    '@media (prefers-color-scheme: dark) {',
    '  :root:not([data-theme="light"]) {',
    declarations(theme.dark).replace(/^/gm, '  '),
    '  }',
    '}',
    ':root[data-theme="dark"] {',
    declarations(theme.dark),
    '}',
    ':root[data-theme="light"] {',
    declarations(theme.light),
    '}',
  ].join('\n');
