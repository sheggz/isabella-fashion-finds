import { describe, it, expect, vi, afterEach } from 'vitest';
import { api } from '../src/api/client.js';

const respond = (status, body, { json = true } = {}) =>
  vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    json: json ? () => Promise.resolve(body) : () => Promise.reject(new SyntaxError('no body')),
  });

afterEach(() => vi.unstubAllGlobals());

describe('api client', () => {
  it('sends the session cookie and returns parsed JSON', async () => {
    const fetchMock = respond(200, { hello: 'world' });
    vi.stubGlobal('fetch', fetchMock);
    expect(await api('/x')).toEqual({ hello: 'world' });
    expect(fetchMock.mock.calls[0][1].credentials).toBe('include');
  });

  it('`json` option stringifies the body and sets the JSON content type', async () => {
    const fetchMock = respond(201, {});
    vi.stubGlobal('fetch', fetchMock);
    await api('/x', { method: 'POST', json: { a: 1 } });
    const init = fetchMock.mock.calls[0][1];
    expect(init.body).toBe('{"a":1}');
    expect(init.headers['Content-Type']).toBe('application/json');
    expect(init.method).toBe('POST');
  });

  it('leaves the content type unset for file uploads so the browser adds the multipart boundary', async () => {
    const fetchMock = respond(201, {});
    vi.stubGlobal('fetch', fetchMock);
    const body = new FormData();
    body.append('file', new Blob(['x']), 'a.png');
    await api('/x', { method: 'POST', body });
    const init = fetchMock.mock.calls[0][1];
    expect(init.body).toBe(body);
    expect(init.headers['Content-Type']).toBeUndefined();
  });

  it('treats an empty success response (204) as null', async () => {
    vi.stubGlobal('fetch', respond(204, null, { json: false }));
    expect(await api('/x', { method: 'DELETE' })).toBeNull();
  });

  it('rejects with the normalised error from the backend contract', async () => {
    const body = { error: { code: 'out_of_stock', message: 'Sold out', details: null, request_id: 'r1' } };
    vi.stubGlobal('fetch', respond(409, body));
    await expect(api('/x')).rejects.toEqual({ status: 409, code: 'out_of_stock', message: 'Sold out', details: null, requestId: 'r1' });
  });

  it('rejects with a generic error when the failure body is not our contract', async () => {
    vi.stubGlobal('fetch', respond(502, null, { json: false }));
    await expect(api('/x')).rejects.toMatchObject({ status: 502, code: 'unknown_error' });
  });

  it('rejects with a network error when no response arrives at all', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));
    await expect(api('/x')).rejects.toMatchObject({ status: 0, code: 'network_error' });
  });
});
