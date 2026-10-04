import { describe, it, expect } from 'vitest';
import { parseApiError, networkError } from '../src/api/apiError.js';

describe('parseApiError', () => {
  it('reads the backend error contract', () => {
    const body = { error: { code: 'out_of_stock', message: 'Size M is sold out', details: { size: 'M' }, request_id: 'r1' } };
    expect(parseApiError(409, body)).toEqual({
      status: 409,
      code: 'out_of_stock',
      message: 'Size M is sold out',
      details: { size: 'M' },
      requestId: 'r1',
    });
  });

  it('falls back safely when the body is not our contract', () => {
    expect(parseApiError(502, '<html>Bad gateway</html>')).toEqual({
      status: 502,
      code: 'unknown_error',
      message: 'Something went wrong. Please try again.',
      details: null,
      requestId: null,
    });
  });

  it('falls back when the body is null or malformed', () => {
    expect(parseApiError(500, null).code).toBe('unknown_error');
    expect(parseApiError(500, { error: 'nope' }).code).toBe('unknown_error');
  });

  it('does not mutate its input', () => {
    const body = Object.freeze({ error: Object.freeze({ code: 'c', message: 'm' }) });
    expect(() => parseApiError(400, body)).not.toThrow();
  });
});

describe('networkError', () => {
  it('describes a failed request that never got a response', () => {
    expect(networkError()).toEqual({
      status: 0,
      code: 'network_error',
      message: 'Cannot reach the server. Check your connection and try again.',
      details: null,
      requestId: null,
    });
  });
});
