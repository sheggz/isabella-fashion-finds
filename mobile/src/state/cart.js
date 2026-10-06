// The phone's cart state: the shared cart store (@isabella/core) bound to the phone's API client.
import { createCartStore } from '@isabella/core';
import { cartApi } from '../api/client';

export const cartState = createCartStore(cartApi);
