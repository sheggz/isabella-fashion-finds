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

    renderHeader(host, { status: 'ready', user: { name: 'Ada', role: 'customer' } }, {});
    expect(host.querySelector('a[href="/admin"]')).toBeNull();
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
