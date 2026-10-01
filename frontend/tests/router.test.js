// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createRouter } from '../src/router.js';

let container;
let router;
let user;

const routes = [
  { name: 'home', pattern: '/', render: (view) => { view.textContent = 'HOME'; } },
  { name: 'product', pattern: '/products/:id', render: (view, ctx) => { view.textContent = `PRODUCT ${ctx.params.id}`; } },
  { name: 'admin', pattern: '/admin', requires: 'owner', render: (view) => { view.textContent = 'ADMIN'; } },
];

const make = () => {
  router = createRouter({ routes, container, getUser: () => user });
  router.start();
};

beforeEach(() => {
  document.body.innerHTML = '<div id="app"></div>';
  container = document.querySelector('#app');
  user = null;
  window.history.replaceState({}, '', '/');
});

afterEach(() => router?.stop());

describe('router', () => {
  it('renders the route for the current address on start', () => {
    window.history.replaceState({}, '', '/products/42');
    make();
    expect(container.textContent).toBe('PRODUCT 42');
  });

  it('navigate() updates the address bar and the page without a reload', () => {
    make();
    router.navigate('/products/7');
    expect(window.location.pathname).toBe('/products/7');
    expect(container.textContent).toBe('PRODUCT 7');
  });

  it('shows a not-found page for unknown paths', () => {
    window.history.replaceState({}, '', '/nope');
    make();
    expect(container.textContent).toContain('Page not found');
  });

  it('handles clicks on in-app links itself', () => {
    make();
    container.innerHTML = '<a id="l" href="/products/9" data-link>go</a>';
    const event = new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 });
    container.querySelector('#l').dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
    expect(container.textContent).toBe('PRODUCT 9');
  });

  it('leaves modified clicks and external links to the browser', () => {
    make();
    container.innerHTML = '<a id="l" href="/products/9" data-link>go</a>';
    const ctrl = new MouseEvent('click', { bubbles: true, cancelable: true, button: 0, ctrlKey: true });
    container.querySelector('#l').dispatchEvent(ctrl);
    expect(ctrl.defaultPrevented).toBe(false);

    container.innerHTML = '<a id="e" href="https://example.com">out</a>';
    const external = new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 });
    container.querySelector('#e').dispatchEvent(external);
    expect(external.defaultPrevented).toBe(false);
  });

  it('re-renders on back/forward', () => {
    make();
    router.navigate('/products/1');
    window.history.replaceState({}, '', '/');
    window.dispatchEvent(new PopStateEvent('popstate'));
    expect(container.textContent).toBe('HOME');
  });

  it('keeps owner-only pages closed to everyone else', () => {
    window.history.replaceState({}, '', '/admin');
    make();
    expect(container.textContent).not.toContain('ADMIN');
    expect(container.textContent).toContain('store owner');

    router.stop();
    user = { role: 'customer' };
    make();
    expect(container.textContent).not.toContain('ADMIN');
  });

  it('lets the owner in', () => {
    user = { role: 'owner' };
    window.history.replaceState({}, '', '/admin');
    make();
    expect(container.textContent).toBe('ADMIN');
  });

  it('ignores a slow page that finishes after the user has moved on', async () => {
    let finish;
    const slow = {
      name: 'slow',
      pattern: '/slow',
      render: (view) => new Promise((resolve) => { finish = () => { view.textContent = 'SLOW'; resolve(); }; }),
    };
    router = createRouter({ routes: [...routes, slow], container, getUser: () => user });
    router.start();
    router.navigate('/slow');
    router.navigate('/');
    finish();
    await Promise.resolve();
    expect(container.textContent).toBe('HOME');
  });

  it('runs a page cleanup function when leaving the page', () => {
    const cleanup = vi.fn();
    const withCleanup = { name: 'c', pattern: '/c', render: () => cleanup };
    router = createRouter({ routes: [...routes, withCleanup], container, getUser: () => user });
    router.start();
    router.navigate('/c');
    router.navigate('/');
    expect(cleanup).toHaveBeenCalledTimes(1);
  });
});
