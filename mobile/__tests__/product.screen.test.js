import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';

jest.mock('expo-router', () => ({
  router: { push: jest.fn(), navigate: jest.fn() },
  useLocalSearchParams: () => ({ id: 'p1' }),
}));
jest.mock('../src/api/client', () => ({ getProduct: jest.fn(), getCatalogueOptions: jest.fn() }));
jest.mock('../src/auth', () => {
  const { createStore } = require('@isabella/core');
  return { session: { store: createStore({ status: 'signedIn', user: { id: 'u1' }, error: null }) } };
});
jest.mock('../src/state/cart', () => {
  const { createStore } = require('@isabella/core');
  return { cartState: { store: createStore({ status: 'idle', data: null, error: null }), addItem: jest.fn() } };
});

import { router } from 'expo-router';
import { getCatalogueOptions, getProduct } from '../src/api/client';
import { session } from '../src/auth';
import { cartState } from '../src/state/cart';
import ProductScreen from '../app/product/[id]';

const product = (over = {}) => ({
  id: 'p1', name: 'Lace Gown', description: 'Each size is priced separately.', pricing_mode: 'per_size',
  price_kobo: 1800000, price_varies: true, sale_price_kobo: null, discount: null, max_per_order: null,
  images: [{ id: 'i1', position: 0, url: 'https://cdn.test/a.png' }],
  variants: [
    { id: 'v1', size: 'S', stock: 5, price_kobo: 1800000, sale_price_kobo: null, measurements: { bust: 86 } },
    { id: 'v2', size: 'L', stock: 5, price_kobo: 2200000, sale_price_kobo: null, measurements: {} },
    { id: 'v3', size: 'XL', stock: 0, price_kobo: 2400000, sale_price_kobo: null, measurements: {} },
  ],
  ...over,
});

const signIn = (status) => session.store.set({ status, user: status === 'signedIn' ? { id: 'u1' } : null, error: null });

beforeEach(() => {
  jest.clearAllMocks();
  getCatalogueOptions.mockResolvedValue(null);
  getProduct.mockResolvedValue(product());
  signIn('signedIn');
});

describe('Product screen', () => {
  it('shows the piece, its first available size and that size’s price', async () => {
    await render(<ProductScreen />);
    await waitFor(() => expect(screen.getByText('Lace Gown')).toBeTruthy());
    expect(screen.getByText('₦18,000')).toBeTruthy();
    expect(screen.getByText('Each size is priced separately.')).toBeTruthy();
  });

  it('changes the price when another size is chosen', async () => {
    await render(<ProductScreen />);
    await waitFor(() => expect(screen.getByText('Lace Gown')).toBeTruthy());
    await fireEvent.press(screen.getByText('L'));
    expect(screen.getByText('₦22,000')).toBeTruthy();
  });

  it('shows a sold-out size as unavailable', async () => {
    await render(<ProductScreen />);
    await waitFor(() => expect(screen.getByText('XL · Sold out')).toBeTruthy());
  });

  it('adds the chosen size and quantity to the cart', async () => {
    cartState.addItem.mockResolvedValue({});
    await render(<ProductScreen />);
    await waitFor(() => expect(screen.getByText('Add to cart')).toBeTruthy());
    await fireEvent.press(screen.getByLabelText('Increase quantity'));
    await fireEvent.press(screen.getByText('Add to cart'));
    await waitFor(() => expect(cartState.addItem).toHaveBeenCalledWith('v1', 2));
    await waitFor(() => expect(screen.getByText(/Added to your cart/)).toBeTruthy());
  });

  it('shows the server’s reason when adding is refused', async () => {
    cartState.addItem.mockRejectedValue({ status: 409, message: 'Only 1 left in stock.' });
    await render(<ProductScreen />);
    await waitFor(() => expect(screen.getByText('Add to cart')).toBeTruthy());
    await fireEvent.press(screen.getByText('Add to cart'));
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Only 1 left in stock.'));
  });

  it('asks signed-out visitors to sign in instead', async () => {
    signIn('signedOut');
    await render(<ProductScreen />);
    await waitFor(() => expect(screen.getByText('Sign in to add to cart')).toBeTruthy());
    await fireEvent.press(screen.getByText('Sign in to add to cart'));
    expect(router.navigate).toHaveBeenCalledWith('/account');
  });

  it('says so when the piece no longer exists', async () => {
    getProduct.mockRejectedValue({ status: 404, code: 'not_found', message: 'Product not found' });
    await render(<ProductScreen />);
    await waitFor(() => expect(screen.getByText('Piece not found')).toBeTruthy());
  });

  it('shows the error with a retry for other failures', async () => {
    getProduct.mockRejectedValueOnce({ status: 0, code: 'network_error', message: 'Cannot reach the server.' });
    await render(<ProductScreen />);
    await waitFor(() => expect(screen.getByText('Cannot reach the server.')).toBeTruthy());
    await fireEvent.press(screen.getByText('Try again'));
    await waitFor(() => expect(screen.getByText('Lace Gown')).toBeTruthy());
  });

  it('renders a hostile description as plain text', async () => {
    getProduct.mockResolvedValue(product({ description: '<script>alert(1)</script>' }));
    await render(<ProductScreen />);
    await waitFor(() => expect(screen.getByText('<script>alert(1)</script>')).toBeTruthy());
  });
});
