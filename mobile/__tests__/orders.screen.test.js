import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';

jest.mock('expo-router', () => ({ router: { push: jest.fn(), navigate: jest.fn() } }));
jest.mock('../src/api/client', () => ({ listOrders: jest.fn() }));
jest.mock('../src/auth', () => {
  const { createStore } = require('@isabella/core');
  return { session: { store: createStore({ status: 'signedIn', user: { id: 'u1' }, error: null }) } };
});

import { listOrders } from '../src/api/client';
import { session } from '../src/auth';
import OrdersScreen from '../app/(tabs)/orders';

const order = (over = {}) => ({
  id: 'o1', status: 'paid', currency: 'NGN', subtotal_kobo: 3000000, total_kobo: 3000000, item_count: 2,
  created_at: '2026-10-01T10:00:00Z', paid_at: '2026-10-01T10:05:00Z',
  items: [{ product_id: 'p1', product_name: 'Ankara Dress', size: 'M', image_url: null, quantity: 2, unit_price_kobo: 1500000, base_price_kobo: 1500000, discount_name: null, line_total_kobo: 3000000 }],
  ...over,
});

beforeEach(() => {
  jest.resetAllMocks();
  session.store.set({ status: 'signedIn', user: { id: 'u1' }, error: null });
});

describe('Orders screen', () => {
  it('asks signed-out visitors to sign in and does not call the server', async () => {
    session.store.set({ status: 'signedOut', user: null, error: null });
    await render(<OrdersScreen />);
    expect(screen.getByText('Please sign in')).toBeTruthy();
    expect(listOrders).not.toHaveBeenCalled();
  });

  it('lists orders with status, items and total', async () => {
    listOrders.mockResolvedValue([order()]);
    await render(<OrdersScreen />);
    await waitFor(() => expect(screen.getByText('Ankara Dress')).toBeTruthy());
    expect(screen.getByText('Total ₦30,000')).toBeTruthy();
    expect(screen.getByText('Size M × 2')).toBeTruthy();
  });

  it('shows an empty state', async () => {
    listOrders.mockResolvedValue([]);
    await render(<OrdersScreen />);
    await waitFor(() => expect(screen.getByText('No orders yet')).toBeTruthy());
  });

  it('shows the error and retries', async () => {
    listOrders.mockRejectedValueOnce({ status: 0, code: 'network_error', message: 'Cannot reach the server.' });
    await render(<OrdersScreen />);
    await waitFor(() => expect(screen.getByText('Cannot reach the server.')).toBeTruthy());
    listOrders.mockResolvedValue([order()]);
    await fireEvent.press(screen.getByText('Try again'));
    await waitFor(() => expect(screen.getByText('Ankara Dress')).toBeTruthy());
  });

  it('renders a hostile product name as plain text', async () => {
    listOrders.mockResolvedValue([order({ items: [{ ...order().items[0], product_name: '<img src=x onerror=1>' }] })]);
    await render(<OrdersScreen />);
    await waitFor(() => expect(screen.getByText('<img src=x onerror=1>')).toBeTruthy());
  });
});
