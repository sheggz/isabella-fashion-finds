import { api } from './client.js';

export const getMe = () => api('/auth/me');

export const logout = () => api('/auth/logout', { method: 'POST' });
