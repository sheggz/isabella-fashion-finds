// Pure helpers: turn whatever came back from the server (or didn't) into ONE error shape
// the UI can rely on. This is the frontend's boundary with the API.

const GENERIC = 'Something went wrong. Please try again.';

const isContract = (body) =>
  body !== null &&
  typeof body === 'object' &&
  body.error !== null &&
  typeof body.error === 'object' &&
  typeof body.error.code === 'string' &&
  typeof body.error.message === 'string';

export const parseApiError = (status, body) => {
  if (!isContract(body)) {
    return { status, code: 'unknown_error', message: GENERIC, details: null, requestId: null };
  }
  const { code, message, details = null, request_id: requestId = null } = body.error;
  return { status, code, message, details, requestId };
};

/**
 * `cause` is whatever the platform threw (e.g. "Network request failed"). Its text is kept in
 * `details.reason` so a screen can show WHY when needed, without changing the friendly message.
 */
export const networkError = (cause) => ({
  status: 0,
  code: 'network_error',
  message: 'Cannot reach the server. Check your connection and try again.',
  details: cause?.message ? { reason: String(cause.message) } : null,
  requestId: null,
});
