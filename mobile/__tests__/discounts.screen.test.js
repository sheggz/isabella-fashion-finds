import { Alert } from 'react-native';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { product } from '../test-utils/ownerFixtures';

jest.mock('@react-native-community/datetimepicker', () => 'DateTimePicker');
jest.mock('expo-router', () => ({
  router: { push: jest.fn(), replace: jest.fn() },
  useLocalSearchParams: jest.fn(),
}));
jest.mock('../src/api/client', () => ({
  admin: { listDiscounts: jest.fn(), listAdminProducts: jest.fn(), createDiscount: jest.fn(), replaceDiscount: jest.fn(), deleteDiscount: jest.fn() },
}));
jest.mock('../src/auth', () => {
  const { createStore } = require('@isabella/core');
  return { session: { store: createStore({ status: 'signedIn', user: { id: 'u1', role: 'owner' }, error: null }) } };
});

import { router, useLocalSearchParams } from 'expo-router';
import { admin } from '../src/api/client';
import DiscountsScreen from '../app/admin/discounts';
import DiscountEditScreen from '../app/admin/discount/[id]';

const discount = (over = {}) => ({
  id: 'd1', name: 'Weekend sale', kind: 'percent', percent: 20, amount_kobo: null, applies_to_all: true, product_ids: [],
  starts_at: '2026-10-01T10:00:00Z', ends_at: '2026-10-08T10:00:00Z', is_enabled: true, status: 'live', created_at: '2026-09-30T10:00:00Z', ...over,
});

beforeEach(() => {
  jest.clearAllMocks();
  admin.listAdminProducts.mockResolvedValue([product(), product({ id: 'p2', name: 'Lace Top' })]);
});

describe('Discounts list', () => {
  it('shows each discount with its status, value and scope', async () => {
    admin.listDiscounts.mockResolvedValue([discount(), discount({ id: 'd2', name: 'Old', status: 'ended', kind: 'amount', percent: null, amount_kobo: 250000, applies_to_all: false, product_ids: ['p1'] })]);
    await render(<DiscountsScreen />);
    await waitFor(() => expect(screen.getByText('Weekend sale')).toBeTruthy());
    expect(screen.getByText('Live')).toBeTruthy();
    expect(screen.getByText('20% off · Every piece')).toBeTruthy();
    expect(screen.getByText('₦2,500 off · 1 piece')).toBeTruthy();
  });

  it('deletes only after confirming', async () => {
    jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    admin.listDiscounts.mockResolvedValue([discount()]);
    admin.deleteDiscount.mockResolvedValue(null);
    await render(<DiscountsScreen />);
    await waitFor(() => expect(screen.getByText('Delete')).toBeTruthy());
    await fireEvent.press(screen.getByText('Delete'));
    expect(admin.deleteDiscount).not.toHaveBeenCalled();
    await Alert.alert.mock.calls.at(-1)[2].find((b) => b.text === 'Delete').onPress();
    expect(admin.deleteDiscount).toHaveBeenCalledWith('d1');
  });

  it('opens the editor', async () => {
    admin.listDiscounts.mockResolvedValue([discount()]);
    await render(<DiscountsScreen />);
    await waitFor(() => expect(screen.getByText('New discount')).toBeTruthy());
    await fireEvent.press(screen.getByText('New discount'));
    expect(router.push).toHaveBeenCalledWith('/admin/discount/new');
    await fireEvent.press(screen.getByLabelText('Weekend sale'));
    expect(router.push).toHaveBeenCalledWith('/admin/discount/d1');
  });
});

describe('Discount form', () => {
  beforeEach(() => {
    useLocalSearchParams.mockReturnValue({ id: 'new' });
    admin.listDiscounts.mockResolvedValue([]);
  });

  it('reports a missing name and value without calling the server', async () => {
    await render(<DiscountEditScreen />);
    await waitFor(() => expect(screen.getByText('New discount')).toBeTruthy());
    await fireEvent.press(screen.getByText('Save discount'));
    expect(screen.getByText(/Give the discount a name/)).toBeTruthy();
    expect(screen.getByText(/Enter a percentage/)).toBeTruthy();
    expect(admin.createDiscount).not.toHaveBeenCalled();
  });

  it('creates a percentage discount for every piece', async () => {
    admin.createDiscount.mockResolvedValue(discount());
    await render(<DiscountEditScreen />);
    await waitFor(() => expect(screen.getByText('New discount')).toBeTruthy());
    await fireEvent.changeText(screen.getByLabelText('Name (customers see this)'), 'Sale');
    await fireEvent.changeText(screen.getByLabelText('Percent off'), '15');
    await fireEvent.press(screen.getByText('Save discount'));
    await waitFor(() => expect(admin.createDiscount).toHaveBeenCalledTimes(1));
    expect(admin.createDiscount.mock.calls[0][0]).toMatchObject({ name: 'Sale', kind: 'percent', percent: 15, applies_to_all: true, product_ids: [], is_enabled: true });
    await waitFor(() => expect(router.replace).toHaveBeenCalledWith('/admin/discounts'));
  });

  it('requires at least one piece when applying to chosen pieces', async () => {
    await render(<DiscountEditScreen />);
    await waitFor(() => expect(screen.getByText('New discount')).toBeTruthy());
    await fireEvent.changeText(screen.getByLabelText('Name (customers see this)'), 'Sale');
    await fireEvent.changeText(screen.getByLabelText('Percent off'), '15');
    await fireEvent.press(screen.getByText('Chosen pieces'));
    await fireEvent.press(screen.getByText('Save discount'));
    expect(screen.getByText(/Choose at least one piece/)).toBeTruthy();
    await fireEvent.press(screen.getByLabelText('Lace Top'));
    admin.createDiscount.mockResolvedValue(discount());
    await fireEvent.press(screen.getByText('Save discount'));
    await waitFor(() => expect(admin.createDiscount.mock.calls[0][0]).toMatchObject({ applies_to_all: false, product_ids: ['p2'] }));
  });

  it('edits an existing discount with the form pre-filled', async () => {
    useLocalSearchParams.mockReturnValue({ id: 'd1' });
    admin.listDiscounts.mockResolvedValue([discount()]);
    admin.replaceDiscount.mockResolvedValue(discount());
    await render(<DiscountEditScreen />);
    await waitFor(() => expect(screen.getByDisplayValue('Weekend sale')).toBeTruthy());
    expect(screen.getByDisplayValue('20')).toBeTruthy();
    await fireEvent.press(screen.getByText('Save discount'));
    await waitFor(() => expect(admin.replaceDiscount).toHaveBeenCalledWith('d1', expect.objectContaining({ name: 'Weekend sale', percent: 20 })));
  });

  it('shows the server’s refusal', async () => {
    admin.createDiscount.mockRejectedValue({ status: 422, message: 'Those dates overlap another discount.' });
    await render(<DiscountEditScreen />);
    await waitFor(() => expect(screen.getByText('New discount')).toBeTruthy());
    await fireEvent.changeText(screen.getByLabelText('Name (customers see this)'), 'Sale');
    await fireEvent.changeText(screen.getByLabelText('Percent off'), '15');
    await fireEvent.press(screen.getByText('Save discount'));
    await waitFor(() => expect(screen.getByText('Those dates overlap another discount.')).toBeTruthy());
  });
});
