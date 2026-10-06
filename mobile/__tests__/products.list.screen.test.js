import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { options, product } from '../test-utils/ownerFixtures';

jest.mock('expo-router', () => ({ router: { push: jest.fn() } }));
jest.mock('../src/api/client', () => ({ getCatalogueOptions: jest.fn(), admin: { listAdminProducts: jest.fn() } }));
jest.mock('../src/auth', () => {
  const { createStore } = require('@isabella/core');
  return { session: { store: createStore({ status: 'signedIn', user: { id: 'u1', role: 'owner' }, error: null }) } };
});

import { router } from 'expo-router';
import { admin, getCatalogueOptions } from '../src/api/client';
import { session } from '../src/auth';
import PiecesScreen from '../app/admin/products';

beforeEach(() => {
  jest.clearAllMocks();
  getCatalogueOptions.mockResolvedValue(options);
  session.store.set({ status: 'signedIn', user: { id: 'u1', role: 'owner' }, error: null });
});

describe('Pieces list', () => {
  it('lists pieces with visibility, price and stock by size', async () => {
    admin.listAdminProducts.mockResolvedValue([product(), product({ id: 'p2', name: 'Hidden Top', is_active: false })]);
    await render(<PiecesScreen />);
    await waitFor(() => expect(screen.getByText('Ankara Dress')).toBeTruthy());
    expect(screen.getByText('Hidden')).toBeTruthy();
    expect(screen.getAllByText('₦15,000')).toHaveLength(2); // one per piece
    expect(screen.getAllByText('M 4').length).toBeGreaterThan(0);
  });

  it('opens a piece and starts a new one', async () => {
    admin.listAdminProducts.mockResolvedValue([product()]);
    await render(<PiecesScreen />);
    await waitFor(() => expect(screen.getByText('Ankara Dress')).toBeTruthy());
    await fireEvent.press(screen.getByLabelText('Ankara Dress'));
    expect(router.push).toHaveBeenCalledWith('/admin/product/p1');
    await fireEvent.press(screen.getByText('Add a piece'));
    expect(router.push).toHaveBeenCalledWith('/admin/product/new');
  });

  it('shows an empty state and an error with retry', async () => {
    admin.listAdminProducts.mockRejectedValueOnce({ status: 0, message: 'Cannot reach the server.' });
    await render(<PiecesScreen />);
    await waitFor(() => expect(screen.getByText('Cannot reach the server.')).toBeTruthy());
    admin.listAdminProducts.mockResolvedValue([]);
    await fireEvent.press(screen.getByText('Try again'));
    await waitFor(() => expect(screen.getByText(/No pieces yet/)).toBeTruthy());
  });

  it('is closed to customers', async () => {
    session.store.set({ status: 'signedIn', user: { id: 'u2', role: 'customer' }, error: null });
    await render(<PiecesScreen />);
    expect(screen.getByText('Store owner only')).toBeTruthy();
    expect(admin.listAdminProducts).not.toHaveBeenCalled();
  });
});
