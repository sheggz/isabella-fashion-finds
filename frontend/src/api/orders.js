import { createOrdersApi } from '@isabella/core';
import { api } from './client.js';

export const { listOrders, getOrder } = createOrdersApi(api);
