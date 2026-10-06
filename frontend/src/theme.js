// Web glue for the brand kit. The colours themselves live in @isabella/core (theme.js) so the
// mobile app uses the very same values; this file only knows how to put them on a web page.
import { defaultTheme, findThemeProblems, themeToCss } from '@isabella/core';

/**
 * Inject the theme as a <style id="brand-theme"> tag. Calling it again replaces the old tag
 * (so a future "change theme" feature is one call). A broken theme throws: it is a mistake by
 * whoever edited the brand kit, and a loud failure in the tests beats a half-styled site.
 */
export const applyTheme = (doc = document, theme = defaultTheme) => {
  const problems = findThemeProblems(theme);
  if (problems.length) throw new Error(`Invalid theme: ${problems.join('; ')}`);
  let style = doc.getElementById('brand-theme');
  if (!style) {
    style = doc.createElement('style');
    style.id = 'brand-theme';
    doc.head.append(style);
  }
  style.textContent = themeToCss(theme);
};
