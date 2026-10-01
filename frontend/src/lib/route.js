// Pure route matching: no window, no history, so it can be tested without a browser.

const clean = (path) => path.split('#')[0].split('?')[0].replace(/\/+$/, '') || '/';

/**
 * Find the route whose pattern matches `path` and extract its `:named` parameters.
 * Query strings, fragments and trailing slashes are ignored.
 *
 * Returns null (instead of throwing) for unknown paths and for malformed percent-escapes:
 * `decodeURIComponent` throws on input like "%E0%A4%A", and a user can type anything into the
 * address bar, so an unguarded call would crash the whole page.
 *
 * @param {{name: string, pattern: string}[]} routes
 * @param {string} path
 * @returns {{name: string, params: Record<string, string>} | null}
 */
export const matchRoute = (routes, path) => {
  const parts = clean(path).split('/').filter(Boolean);
  for (const route of routes) {
    const patternParts = clean(route.pattern).split('/').filter(Boolean);
    if (patternParts.length !== parts.length) continue;

    const params = {};
    let matched = true;
    for (let i = 0; i < patternParts.length; i += 1) {
      if (patternParts[i].startsWith(':')) {
        try {
          params[patternParts[i].slice(1)] = decodeURIComponent(parts[i]);
        } catch {
          return null;
        }
      } else if (patternParts[i] !== parts[i]) {
        matched = false;
        break;
      }
    }
    if (matched) return { name: route.name, params };
  }
  return null;
};
