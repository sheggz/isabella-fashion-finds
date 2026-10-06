import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';

jest.mock('expo-router', () => ({ router: { push: jest.fn() } }));
jest.mock('../src/api/client', () => ({ admin: { getDashboard: jest.fn() } }));
jest.mock('../src/auth', () => {
  const { createStore } = require('@isabella/core');
  return { session: { store: createStore({ status: 'signedIn', user: { id: 'u1', role: 'owner' }, error: null }) } };
});

import { router } from 'expo-router';
import { admin } from '../src/api/client';
import { session } from '../src/auth';
import ManageScreen from '../app/(tabs)/manage';

const data = (over = {}) => ({
  stock: {
    pieces: 5, visible_pieces: 4, units_in_stock: 42, low_stock_threshold: 3,
    low_stock: [{ product_id: 'p1', name: 'Ankara Dress', size: 'M', stock: 1 }],
    sold_out: [{ product_id: 'p2', name: 'Lace Gown' }],
  },
  sales: {
    days: 30, revenue_kobo: 4500000, orders: 3, items_sold: 5, average_order_kobo: 1500000,
    by_day: [{ date: '2026-10-09', revenue_kobo: 0, orders: 0 }, { date: '2026-10-10', revenue_kobo: 4500000, orders: 3 }],
    top_products: [{ product_id: 'p1', name: 'Ankara Dress', units: 4, revenue_kobo: 3600000 }],
  },
  ...over,
});

beforeEach(() => {
  jest.clearAllMocks();
  session.store.set({ status: 'signedIn', user: { id: 'u1', role: 'owner' }, error: null });
});

describe('Manage tab (owner dashboard)', () => {
  it('shows stock alerts and sales in naira', async () => {
    admin.getDashboard.mockResolvedValue(data());
    await render(<ManageScreen />);
    await waitFor(() => expect(screen.getByText('₦45,000')).toBeTruthy());
    expect(screen.getByText('42')).toBeTruthy();
    expect(screen.getByText('Ankara Dress (M)')).toBeTruthy();
    expect(screen.getByText('Lace Gown')).toBeTruthy();
  });

  it('links to pieces and discounts, and to a piece from an alert', async () => {
    admin.getDashboard.mockResolvedValue(data());
    await render(<ManageScreen />);
    await waitFor(() => expect(screen.getByText('Pieces')).toBeTruthy());
    await fireEvent.press(screen.getByText('Pieces'));
    expect(router.push).toHaveBeenCalledWith('/admin/products');
    await fireEvent.press(screen.getByText('Discounts'));
    expect(router.push).toHaveBeenCalledWith('/admin/discounts');
    await fireEvent.press(screen.getByText('Lace Gown'));
    expect(router.push).toHaveBeenCalledWith('/admin/product/p2');
  });

  it('explains empty sales', async () => {
    const empty = data();
    empty.sales = { ...empty.sales, orders: 0, revenue_kobo: 0, top_products: [], by_day: [] };
    admin.getDashboard.mockResolvedValue(empty);
    await render(<ManageScreen />);
    await waitFor(() => expect(screen.getByText(/No paid orders yet/)).toBeTruthy());
  });

  it('shows an error with retry', async () => {
    admin.getDashboard.mockRejectedValueOnce({ status: 500, message: 'Something went wrong.' });
    await render(<ManageScreen />);
    await waitFor(() => expect(screen.getByText('Something went wrong.')).toBeTruthy());
    admin.getDashboard.mockResolvedValue(data());
    await fireEvent.press(screen.getByText('Try again'));
    await waitFor(() => expect(screen.getByText('₦45,000')).toBeTruthy());
  });

  it('is closed to customers and does not load anything', async () => {
    session.store.set({ status: 'signedIn', user: { id: 'u2', role: 'customer' }, error: null });
    await render(<ManageScreen />);
    expect(screen.getByText('Store owner only')).toBeTruthy();
    expect(admin.getDashboard).not.toHaveBeenCalled();
  });
});
