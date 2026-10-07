import { describe, it, expect, vi } from 'vitest';
import { createApiClient } from '../src/api/client.js';

// The HTTP call is injected (`fetchImpl`), so no global fetch is replaced and no network is used.
const reply = (status, body, { json = true } = {}) =>
  vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    json: json ? () => Promise.resolve(body) : () => Promise.reject(new SyntaxError('no body')),
  });

const make = (fetchImpl, over = {}) => createApiClient({ baseUrl: 'https://api.test', fetchImpl, ...over });
const sentInit = (fetchImpl) => fetchImpl.mock.calls[0][1];
const sentUrl = (fetchImpl) => fetchImpl.mock.calls[0][0];

describe('createApiClient: building the request', () => {
  it('joins the base URL and the path, tolerating a trailing slash', async () => {
    const f = reply(200, {});
    await make(f, { baseUrl: 'https://api.test/' })('/products');
    expect(sentUrl(f)).toBe('https://api.test/products');
  });

  it('works with a relative base such as "/api" (the website behind a forwarding rule)', async () => {
    const f = reply(200, {});
    await make(f, { baseUrl: '/api' })('/health');
    expect(sentUrl(f)).toBe('/api/health');
  });

  it('website mode: asks the browser to send cookies', async () => {
    const f = reply(200, {});
    await make(f, { credentials: 'include' })('/x');
    expect(sentInit(f).credentials).toBe('include');
  });

  it('phone mode: sends no cookie setting, and the bearer token instead', async () => {
    const f = reply(200, {});
    await make(f, { getAuthHeader: () => ({ Authorization: 'Bearer abc' }) })('/x');
    expect(sentInit(f).credentials).toBeUndefined();
    expect(sentInit(f).headers.Authorization).toBe('Bearer abc');
  });

  it('the token can be read asynchronously (secure storage is asynchronous on a phone)', async () => {
    const f = reply(200, {});
    await make(f, { getAuthHeader: async () => ({ Authorization: 'Bearer later' }) })('/x');
    expect(sentInit(f).headers.Authorization).toBe('Bearer later');
  });

  it('sends no Authorization header when there is no token (signed out)', async () => {
    const f = reply(200, {});
    await make(f, { getAuthHeader: () => ({}) })('/x');
    expect(sentInit(f).headers.Authorization).toBeUndefined();
  });

  it('`json` stringifies the body and sets the JSON content type', async () => {
    const f = reply(201, {});
    await make(f)('/x', { method: 'POST', json: { a: 1 } });
    expect(sentInit(f)).toMatchObject({ method: 'POST', body: '{"a":1}' });
    expect(sentInit(f).headers['Content-Type']).toBe('application/json');
  });

  it('leaves the content type unset for file uploads so the multipart boundary can be added', async () => {
    const f = reply(201, {});
    const body = new FormData();
    body.append('file', new Blob(['x']), 'a.png');
    await make(f)('/x', { method: 'POST', body });
    expect(sentInit(f).body).toBe(body);
    expect(sentInit(f).headers['Content-Type']).toBeUndefined();
  });

  it('lets a caller add headers, but never replaces the auth header by accident', async () => {
    const f = reply(200, {});
    await make(f, { getAuthHeader: () => ({ Authorization: 'Bearer abc' }) })('/x', { headers: { 'X-Request-ID': 'r1' } });
    expect(sentInit(f).headers).toMatchObject({ Authorization: 'Bearer abc', 'X-Request-ID': 'r1' });
  });
});

describe('createApiClient: reading the answer', () => {
  it('returns parsed JSON on success', async () => {
    expect(await make(reply(200, { hello: 'world' }))('/x')).toEqual({ hello: 'world' });
  });

  it('treats an empty success (204) as null', async () => {
    expect(await make(reply(204, null, { json: false }))('/x')).toBeNull();
  });

  it('rejects with the normalised error from the backend contract', async () => {
    const body = { error: { code: 'out_of_stock', message: 'Sold out', details: null, request_id: 'r1' } };
    await expect(make(reply(409, body))('/x')).rejects.toEqual({
      status: 409, code: 'out_of_stock', message: 'Sold out', details: null, requestId: 'r1',
    });
  });

  it('rejects with a generic error when the failure is not our contract (e.g. a proxy page)', async () => {
    await expect(make(reply(502, null, { json: false }))('/x')).rejects.toMatchObject({ status: 502, code: 'unknown_error' });
  });

  it('rejects with a network error when nothing answers at all', async () => {
    const f = vi.fn().mockRejectedValue(new TypeError('Failed to fetch'));
    await expect(make(f)('/x')).rejects.toMatchObject({ status: 0, code: 'network_error' });
  });

  it('keeps the platform’s reason for a network failure in details', async () => {
    const f = vi.fn().mockRejectedValue(new TypeError('Network request failed'));
    await expect(make(f)('/x')).rejects.toMatchObject({ code: 'network_error', details: { reason: 'Network request failed' } });
  });

  it('a failing token lookup is reported as an error and never sends an unauthenticated request', async () => {
    const f = reply(200, {});
    const client = make(f, { getAuthHeader: async () => { throw new Error('storage locked'); } });
    await expect(client('/x')).rejects.toMatchObject({ status: 0, code: 'auth_unavailable' });
    expect(f).not.toHaveBeenCalled();
  });
});
