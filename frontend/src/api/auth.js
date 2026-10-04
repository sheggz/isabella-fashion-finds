import { createAuthApi } from '@isabella/core';
import { api } from './client.js';

export const { getMe, logout } = createAuthApi(api);
