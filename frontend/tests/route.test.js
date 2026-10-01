import { describe, it, expect } from 'vitest';
import { matchRoute } from '../src/lib/route.js';

const routes = [
  { name: 'home', pattern: '/' },
  { name: 'product', pattern: '/products/:id' },
  { name: 'admin', pattern: '/admin' },
  { name: 'adminEdit', pattern: '/admin/products/:id' },
];

describe('matchRoute', () => {
  it('matches static paths', () => {
    expect(matchRoute(routes, '/')).toEqual({ name: 'home', params: {} });
    expect(matchRoute(routes, '/admin')).toEqual({ name: 'admin', params: {} });
  });

  it('extracts named parameters', () => {
    expect(matchRoute(routes, '/products/abc-123')).toEqual({ name: 'product', params: { id: 'abc-123' } });
    expect(matchRoute(routes, '/admin/products/9')).toEqual({ name: 'adminEdit', params: { id: '9' } });
  });

  it('ignores trailing slashes, query strings and fragments', () => {
    expect(matchRoute(routes, '/admin/')).toEqual({ name: 'admin', params: {} });
    expect(matchRoute(routes, '/products/5?size=M#top')).toEqual({ name: 'product', params: { id: '5' } });
  });

  it('decodes encoded parameters', () => {
    expect(matchRoute(routes, '/products/a%20b').params.id).toBe('a b');
  });

  it('does not match partial or longer paths', () => {
    expect(matchRoute(routes, '/products')).toBeNull();
    expect(matchRoute(routes, '/products/1/extra')).toBeNull();
    expect(matchRoute(routes, '/nope')).toBeNull();
  });

  it('survives a malformed escape sequence instead of throwing', () => {
    expect(matchRoute(routes, '/products/%E0%A4%A')).toBeNull();
  });
});
