import { BASE_URL } from '../api/client.js';
import { el, link } from './dom.js';

/**
 * Draw the site header into `host` from the current session. Called again whenever the
 * session changes, so it replaces its whole contents each time (simple and always consistent).
 *
 * While the session is still loading neither "Sign in" nor "Sign out" is shown, otherwise a
 * signed-in user would see the sign-in link flash for a moment on every page load.
 */
export const renderHeader = (host, { status, user }, { onSignOut } = {}) => {
  const nav = el('nav', { className: 'account', attrs: { 'aria-label': 'Account' } });

  if (status === 'ready' && user) {
    if (user.role === 'owner') nav.append(link('/admin', 'Manage shop'), link('/admin/discounts', 'Discounts'));
    const signOut = el('button', { type: 'button', className: 'sign-out', textContent: 'Sign out' });
    signOut.addEventListener('click', () => onSignOut?.());
    nav.append(el('span', { className: 'who', textContent: user.name || user.email }), signOut);
  } else if (status === 'ready') {
    // A normal link, not fetch: the browser has to navigate to Google and come back.
    nav.append(el('a', { className: 'sign-in', href: `${BASE_URL}/auth/google/login`, textContent: 'Sign in with Google' }));
  }

  host.replaceChildren(el('div', { className: 'bar' }, link('/', 'Isabella Fashion Finds', 'brand'), nav));
};
