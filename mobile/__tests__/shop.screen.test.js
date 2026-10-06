import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';

jest.mock('../src/api/client', () => ({ listProducts: jest.fn() }));

import { listProducts } from '../src/api/client';
import ShopScreen from '../app/(tabs)/index';

const product = (over = {}) => ({
  id: 'p1', name: 'Ankara Dress', pricing_mode: 'single', price_kobo: 1500000, price_varies: false,
  sale_price_kobo: null, discount: null, images: [], variants: [{ size: 'M', stock: 2, measurements: {} }], ...over,
});

beforeEach(() => jest.resetAllMocks());

describe('Shop screen', () => {
  it('lists pieces with their price in naira', async () => {
    listProducts.mockResolvedValue([product(), product({ id: 'p2', name: 'Lace Top', price_kobo: 900000 })]);
    await render(<ShopScreen />);
    await waitFor(() => expect(screen.getByText('Ankara Dress')).toBeTruthy());
    expect(screen.getByText('₦15,000')).toBeTruthy();
    expect(screen.getByText('Lace Top')).toBeTruthy();
  });

  it('marks a sold-out piece', async () => {
    listProducts.mockResolvedValue([product({ variants: [{ size: 'M', stock: 0, measurements: {} }] })]);
    await render(<ShopScreen />);
    await waitFor(() => expect(screen.getByText('Sold out')).toBeTruthy());
  });

  it('shows an empty state', async () => {
    listProducts.mockResolvedValue([]);
    await render(<ShopScreen />);
    await waitFor(() => expect(screen.getByText(/no pieces yet/i)).toBeTruthy());
  });

  it('shows the error and retries', async () => {
    listProducts.mockRejectedValueOnce({ status: 0, code: 'network_error', message: 'Cannot reach the server.' });
    await render(<ShopScreen />);
    await waitFor(() => expect(screen.getByText('Cannot reach the server.')).toBeTruthy());
    listProducts.mockResolvedValue([product()]);
    await fireEvent.press(screen.getByText('Try again'));
    await waitFor(() => expect(screen.getByText('Ankara Dress')).toBeTruthy());
  });

  it('renders a hostile product name as plain text', async () => {
    listProducts.mockResolvedValue([product({ name: '<img src=x onerror=1>' })]);
    await render(<ShopScreen />);
    await waitFor(() => expect(screen.getByText('<img src=x onerror=1>')).toBeTruthy());
  });
});
