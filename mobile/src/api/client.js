// The phone's API client: the SAME factories the website uses (@isabella/core), configured with
// a bearer token from secure storage instead of a cookie.
import { createApiClient, createAuthApi, createProductsApi } from '@isabella/core';
import { authHeader } from '../auth/tokenStore';
import { API_URL } from '../config';

export const request = createApiClient({ baseUrl: API_URL, getAuthHeader: authHeader });
export const { getMe, exchangeMobileCode } = createAuthApi(request);
export const { listProducts } = createProductsApi(request);
