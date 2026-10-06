// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHeader } from '../src/components/header.js';

let host;
beforeEach(() => {
  document.body.innerHTML = '<header id="h"></header>';
  host = document.querySelector('#h');
});

describe('header', () => {
  it('always links the store name to the home page', () => {
    renderHeader(host, { status: 'ready', user: null }, {});
    const brand = host.querySelector('a.brand');
    expect(brand.textContent).toBe('Isabella Fashion Finds');
    expect(brand.getAttribute('href')).toBe('/');
    expect(brand.hasAttribute('data-link')).toBe(true);
  });

  it('offers Sign in with Google when signed out', () => {
    renderHeader(host, { status: 'ready', user: null }, {});
    const link = host.querySelector('a.sign-in');
    expect(link.textContent).toBe('Sign in with Google');
    expect(link.getAttribute('href')).toContain('/auth/google/login');
    expect(host.querySelector('button.sign-out')).toBeNull();
  });

  it('shows who is signed in with a sign-out button', () => {
    const onSignOut = vi.fn();
    renderHeader(host, { status: 'ready', user: { name: 'Ada', email: 'a@x.com', role: 'customer' } }, { onSignOut });
    expect(host.textContent).toContain('Ada');
    host.querySelector('button.sign-out').click();
    expect(onSignOut).toHaveBeenCalledTimes(1);
    expect(host.querySelector('a.sign-in')).toBeNull();
  });

  it('falls back to the email when there is no name', () => {
    renderHeader(host, { status: 'ready', user: { name: null, email: 'a@x.com', role: 'customer' } }, {});
    expect(host.textContent).toContain('a@x.com');
  });

  it('shows the manage link only to the owner', () => {
    renderHeader(host, { status: 'ready', user: { name: 'Isa', role: 'owner' } }, {});
    expect(host.querySelector('a[href="/admin"]')).not.toBeNull();
    expect(host.querySelector('a[href="/admin/discounts"]')).not.toBeNull();

    renderHeader(host, { status: 'ready', user: { name: 'Ada', role: 'customer' } }, {});
    expect(host.querySelector('a[href="/admin"]')).toBeNull();
    expect(host.querySelector('a[href="/admin/discounts"]')).toBeNull();
  });

  it('shows neither sign-in nor sign-out while the session is still loading', () => {
    renderHeader(host, { status: 'loading', user: null }, {});
    expect(host.querySelector('a.sign-in')).toBeNull();
    expect(host.querySelector('button.sign-out')).toBeNull();
  });

  it('renders a hostile display name as text', () => {
    renderHeader(host, { status: 'ready', user: { name: '<img src=x onerror=1>', role: 'customer' } }, {});
    expect(host.querySelector('img')).toBeNull();
  });
});


describe('header: cart and orders', () => {
  const state = (user) => ({ status: 'ready', user });

  it('shows the cart with its item count and a link to order history when signed in', () => {
    renderHeader(host, state({ name: 'Ada', role: 'customer' }), { cartCount: 3 });
    const cart = host.querySelector('a[href="/cart"]');
    expect(cart.textContent).toContain('Cart');
    expect(cart.querySelector('.cart-count').textContent).toBe('3');
    expect(host.querySelector('a[href="/orders"]')).not.toBeNull();
  });

  it('shows no count badge for an empty cart', () => {
    renderHeader(host, state({ name: 'Ada', role: 'customer' }), { cartCount: 0 });
    expect(host.querySelector('a[href="/cart"]')).not.toBeNull();
    expect(host.querySelector('.cart-count')).toBeNull();
  });

  it('shows neither to signed-out visitors, who have no cart', () => {
    renderHeader(host, state(null), { cartCount: 0 });
    expect(host.querySelector('a[href="/cart"]')).toBeNull();
    expect(host.querySelector('a[href="/orders"]')).toBeNull();
  });

  it('owners are shoppers too', () => {
    renderHeader(host, state({ name: 'Isa', role: 'owner' }), { cartCount: 1 });
    expect(host.querySelector('a[href="/cart"]')).not.toBeNull();
    expect(host.querySelector('a[href="/admin"]')).not.toBeNull();
  });
});


describe('header: site shell', () => {
  const signedOut = { status: 'ready', user: null };

  it('shows the announcement strip above the bar', () => {
    renderHeader(host, signedOut, {});
    expect(host.querySelector('.topbar').textContent).not.toBe('');
  });

  it('links the main navigation to the shop and the about page', () => {
    renderHeader(host, signedOut, {});
    const nav = host.querySelector('nav.main-nav');
    expect(nav.querySelector('a[href="/shop"]')).not.toBeNull();
    expect(nav.querySelector('a[href="/about"]')).not.toBeNull();
  });

  it('has a menu button that opens and closes the navigation on small screens', () => {
    renderHeader(host, signedOut, {});
    const toggle = host.querySelector('button.menu-toggle');
    const bar = host.querySelector('.bar');
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    toggle.click();
    expect(toggle.getAttribute('aria-expanded')).toBe('true');
    expect(bar.classList.contains('menu-open')).toBe(true);
    toggle.click();
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    expect(bar.classList.contains('menu-open')).toBe(false);
  });
});
