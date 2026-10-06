import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';

jest.mock('expo-router', () => ({ router: { push: jest.fn(), navigate: jest.fn() } }));
jest.mock('../src/auth', () => {
  const { createStore } = require('@isabella/core');
  return { session: { store: createStore({ status: 'signedIn', user: { id: 'u1' }, error: null }) } };
});
jest.mock('../src/state/cart', () => {
  const { createStore } = require('@isabella/core');
  return {
    cartState: {
      store: createStore({ status: 'ready', data: null, error: null }),
      load: jest.fn(), refresh: jest.fn().mockResolvedValue(), changeQuantity: jest.fn(), removeLine: jest.fn(), emptyCart: jest.fn(),
    },
  };
});

import { router } from 'expo-router';
import { session } from '../src/auth';
import { cartState } from '../src/state/cart';
import CartScreen from '../app/(tabs)/cart';

const line = (over = {}) => ({
  variant_id: 'v1', product_id: 'p1', name: 'Ankara Dress', size: 'M', image_url: null, quantity: 2,
  unit_price_kobo: 1500000, base_price_kobo: 1500000, line_total_kobo: 3000000, discount_name: null,
  price_changed_from_kobo: null, problem: null, problem_message: null, available_quantity: 5, max_per_order: null, ...over,
});
const cart = (lines, over = {}) => ({ lines, item_count: lines.reduce((n, l) => n + l.quantity, 0), subtotal_kobo: 3000000, savings_kobo: 0, has_problems: false, ...over });
const setCart = (data) => cartState.store.set({ status: 'ready', data, error: null });

beforeEach(() => {
  jest.clearAllMocks();
  session.store.set({ status: 'signedIn', user: { id: 'u1' }, error: null });
});

describe('Cart screen', () => {
  it('asks signed-out visitors to sign in', async () => {
    session.store.set({ status: 'signedOut', user: null, error: null });
    await render(<CartScreen />);
    await fireEvent.press(screen.getByText('Go to sign in'));
    expect(router.navigate).toHaveBeenCalledWith('/account');
  });

  it('shows lines, quantity, line total and the subtotal', async () => {
    setCart(cart([line()]));
    await render(<CartScreen />);
    expect(screen.getByText('Ankara Dress')).toBeTruthy();
    expect(screen.getByText('Size M')).toBeTruthy();
    expect(screen.getByText('Subtotal ₦30,000')).toBeTruthy();
    expect(screen.getByLabelText('Quantity')).toHaveTextContent('2');
  });

  it('changes quantity through the shared cart store', async () => {
    cartState.changeQuantity.mockResolvedValue({});
    setCart(cart([line()]));
    await render(<CartScreen />);
    await fireEvent.press(screen.getByLabelText('Increase quantity'));
    expect(cartState.changeQuantity).toHaveBeenCalledWith('v1', 3);
  });

  it('cannot go above the available quantity or below one', async () => {
    setCart(cart([line({ quantity: 5, available_quantity: 5 })]));
    await render(<CartScreen />);
    await fireEvent.press(screen.getByLabelText('Increase quantity'));
    expect(cartState.changeQuantity).not.toHaveBeenCalled();
  });

  it('removes a line', async () => {
    cartState.removeLine.mockResolvedValue({});
    setCart(cart([line()]));
    await render(<CartScreen />);
    await fireEvent.press(screen.getByText('Remove'));
    expect(cartState.removeLine).toHaveBeenCalledWith('v1');
  });

  it('shows a problem notice and keeps checkout closed', async () => {
    setCart(cart([line({ problem: 'out_of_stock', problem_message: 'Sold out' })], { has_problems: true }));
    await render(<CartScreen />);
    expect(screen.getByText('Sold out')).toBeTruthy();
    expect(screen.getByText(/Fix the items marked above/)).toBeTruthy();
  });

  it('shows a price-change notice', async () => {
    setCart(cart([line({ price_changed_from_kobo: 1000000 })]));
    await render(<CartScreen />);
    expect(screen.getByText(/Price changed from ₦10,000 to ₦15,000/)).toBeTruthy();
  });

  it('shows the server’s refusal in words', async () => {
    cartState.changeQuantity.mockRejectedValue({ status: 409, message: 'Only 3 left.' });
    setCart(cart([line()]));
    await render(<CartScreen />);
    await fireEvent.press(screen.getByLabelText('Increase quantity'));
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Only 3 left.'));
  });

  it('shows an empty cart with a way back to the shop', async () => {
    setCart(cart([], { item_count: 0, subtotal_kobo: 0 }));
    await render(<CartScreen />);
    expect(screen.getByText('Your cart is empty')).toBeTruthy();
    await fireEvent.press(screen.getByText('Browse the shop'));
    expect(router.navigate).toHaveBeenCalledWith('/');
  });
});
