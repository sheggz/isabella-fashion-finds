import { api, BASE_URL } from './api/client.js';

const statusEl = document.querySelector('#api-status');
const accountEl = document.querySelector('#account');
const noticeEl = document.querySelector('#notice');

const el = (tag, props = {}, ...children) => {
  const node = Object.assign(document.createElement(tag), props);
  node.append(...children);
  return node;
};

api('/health')
  .then(() => { statusEl.textContent = 'API is up ✅'; })
  .catch((err) => { statusEl.textContent = `API problem: ${err.message}`; });

const showSignedOut = () => {
  // A normal link, not fetch: the browser must navigate to Google and back.
  accountEl.replaceChildren(el('a', { href: `${BASE_URL}/auth/google/login`, textContent: 'Sign in with Google' }));
};

const showSignedIn = (user) => {
  const logout = el('button', { type: 'button', textContent: 'Sign out' });
  logout.addEventListener('click', async () => {
    try {
      await api('/auth/logout', { method: 'POST' });
    } catch (err) {
      noticeEl.textContent = err.message;
    }
    showSignedOut();
  });
  // textContent (never innerHTML) so a hostile display name can't inject markup.
  accountEl.replaceChildren(
    el('p', { textContent: `Signed in as ${user.name ?? user.email} (${user.role})` }),
    logout,
  );
};

// 401 simply means "not signed in" and is the normal case, not an error to show.
api('/auth/me')
  .then(showSignedIn)
  .catch((err) => {
    if (err.status === 401) showSignedOut();
    else { showSignedOut(); noticeEl.textContent = err.message; }
  });

if (new URLSearchParams(window.location.search).get('login') === 'cancelled') {
  noticeEl.textContent = 'Sign-in was cancelled.';
}
