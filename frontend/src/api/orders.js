import { api } from './client.js';

export const listOrders = () => api('/orders');

export const getOrder = (orderId) => api(`/orders/${encodeURIComponent(orderId)}`);
