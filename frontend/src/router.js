// A tiny router built on the History API: it changes the address bar and the page content
// WITHOUT a full page reload. Matching itself is the pure `matchRoute` in lib/route.js.
import { matchRoute } from './lib/route.js';
import { BASE_URL } from './api/client.js';
import { el, link } from './components/dom.js';

const allowed = (requires, user) => {
  if (requires === 'owner') return user?.role === 'owner';
  if (requires === 'user') return Boolean(user);
  return true;
};

const notFoundPage = (view) => {
  view.replaceChildren(
    el('h1', { textContent: 'Page not found' }),
    el('p', { textContent: 'That page does not exist.' }),
    link('/', 'Back to the shop'),
  );
};

const signInPage = (view) => {
  view.replaceChildren(
    el('h1', { textContent: 'Please sign in' }),
    el('p', { textContent: 'Sign in to see this page.' }),
    el('a', { className: 'sign-in', href: `${BASE_URL}/auth/google/login`, textContent: 'Sign in with Google' }),
  );
};

const forbiddenPage = (view, user) => {
  view.replaceChildren(
    el('h1', { textContent: 'Store owner only' }),
    el('p', { textContent: 'This page is for the store owner.' }),
    user ? link('/', 'Back to the shop') : el('p', { textContent: 'Sign in with the owner account to continue.' }),
  );
};

/**
 * @param {{routes: {name: string, pattern: string, requires?: string,
 *   render: (view: HTMLElement, ctx: object) => void | (() => void) | Promise<void | (() => void)>}[],
 *   container: HTMLElement, getUser: () => object | null,
 *   shells?: Record<string, (activeRouteName: string) => {root: HTMLElement, content: HTMLElement}>}} options
 */
export const createRouter = ({ routes, container, getUser, shells = {} }) => {
  let cleanup = null;
  let renderId = 0;

  const runCleanup = () => {
    if (typeof cleanup === 'function') cleanup();
    cleanup = null;
  };

  const render = () => {
    runCleanup();
    renderId += 1;
    const myId = renderId;

    // Every navigation gets its OWN fresh container. A slow page that finishes loading after
    // the user has already moved on writes into a node that is no longer on screen, so it can
    // never overwrite the page they are looking at.
    const view = el('div', { className: 'view' });
    container.replaceChildren(view);

    const match = matchRoute(routes, window.location.pathname);
    if (!match) return notFoundPage(view);

    const route = routes.find((r) => r.name === match.name);
    const user = getUser();
    if (!allowed(route.requires, user)) return route.requires === 'user' ? signInPage(view) : forbiddenPage(view, user);

    // A route may ask for a "shell": a frame (e.g. the owner's sidebar) built once per navigation
    // that the page renders INTO. Placed after the access check, so a visitor never sees the frame.
    let target = view;
    if (route.shell && shells[route.shell]) {
      const shell = shells[route.shell](route.name);
      view.replaceChildren(shell.root);
      target = shell.content;
    }
    const result = route.render(target, { params: match.params, navigate });
    // A page may return its cleanup function directly, or a promise that resolves to one.
    // A direct function must be registered immediately: waiting even one microtask would let a
    // fast navigation away skip it. A promised one is registered when it arrives, unless the
    // user has already left, in which case it is run straight away.
    if (typeof result === 'function') {
      cleanup = result;
    } else {
      Promise.resolve(result).then((maybeCleanup) => {
        if (typeof maybeCleanup !== 'function') return;
        if (myId === renderId) cleanup = maybeCleanup;
        else maybeCleanup();
      });
    }
    return undefined;
  };

  function navigate(path, { replace = false } = {}) {
    const current = window.location.pathname + window.location.search;
    if (path !== current) window.history[replace ? 'replaceState' : 'pushState']({}, '', path);
    render();
  }

  const onClick = (event) => {
    if (event.defaultPrevented || event.button !== 0) return;
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return; // new-tab clicks etc.
    const anchor = event.target.closest?.('a[data-link]');
    if (!anchor || anchor.target === '_blank') return;
    const href = anchor.getAttribute('href');
    if (!href?.startsWith('/')) return; // only same-site paths are handled here
    event.preventDefault();
    navigate(href);
  };

  const onPop = () => render();

  return {
    start() {
      document.addEventListener('click', onClick);
      window.addEventListener('popstate', onPop);
      render();
    },
    stop() {
      document.removeEventListener('click', onClick);
      window.removeEventListener('popstate', onPop);
      runCleanup();
    },
    navigate,
    refresh: render,
  };
};
