import { Alert } from 'react-native';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { options, product } from '../test-utils/ownerFixtures';

jest.mock('expo-router', () => ({
  router: { push: jest.fn(), replace: jest.fn(), navigate: jest.fn() },
  useLocalSearchParams: jest.fn(),
}));
jest.mock('expo-image-picker', () => ({
  launchImageLibraryAsync: jest.fn(),
  launchCameraAsync: jest.fn(),
  requestCameraPermissionsAsync: jest.fn(),
}));
jest.mock('../src/lib/shrink', () => ({ shrinkPhoto: jest.fn(async () => ({ uri: 'file:///shrunk.jpg', name: 'photo.jpg', type: 'image/jpeg', size: undefined })) }));
jest.mock('../src/api/client', () => ({
  getCatalogueOptions: jest.fn(),
  admin: {
    getAdminProduct: jest.fn(), createProduct: jest.fn(), saveProduct: jest.fn(), deleteProduct: jest.fn(),
    uploadImage: jest.fn(), deleteImage: jest.fn(), reorderImages: jest.fn(),
  },
}));
jest.mock('../src/auth', () => {
  const { createStore } = require('@isabella/core');
  return { session: { store: createStore({ status: 'signedIn', user: { id: 'u1', role: 'owner' }, error: null }) } };
});

import { router, useLocalSearchParams } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { admin, getCatalogueOptions } from '../src/api/client';
import { session } from '../src/auth';
import ProductEditScreen from '../app/admin/product/[id]';

beforeEach(() => {
  jest.clearAllMocks();
  getCatalogueOptions.mockResolvedValue(options);
  session.store.set({ status: 'signedIn', user: { id: 'u1', role: 'owner' }, error: null });
});

const pressAlertButton = (label) => {
  const buttons = Alert.alert.mock.calls.at(-1)[2];
  return buttons.find((b) => b.text === label).onPress();
};

describe('role guard', () => {
  it('keeps customers out and never loads data', async () => {
    useLocalSearchParams.mockReturnValue({ id: 'new' });
    session.store.set({ status: 'signedIn', user: { id: 'u2', role: 'customer' }, error: null });
    await render(<ProductEditScreen />);
    expect(screen.getByText('Store owner only')).toBeTruthy();
    expect(getCatalogueOptions).not.toHaveBeenCalled();
  });
});

describe('new piece', () => {
  beforeEach(() => useLocalSearchParams.mockReturnValue({ id: 'new' }));

  it('shows every problem at once and does not call the server', async () => {
    await render(<ProductEditScreen />);
    await waitFor(() => expect(screen.getByText('New piece')).toBeTruthy());
    await fireEvent.press(screen.getByText('Save piece'));
    expect(screen.getByText('Give the piece a name.')).toBeTruthy();
    expect(screen.getByText(/Enter a valid price/)).toBeTruthy();
    expect(screen.getByText('Offer at least one size.')).toBeTruthy();
    expect(admin.createProduct).not.toHaveBeenCalled();
  });

  it('creates the piece with the shared payload and opens it for photos', async () => {
    admin.createProduct.mockResolvedValue({ id: 'new-id' });
    await render(<ProductEditScreen />);
    await waitFor(() => expect(screen.getByText('New piece')).toBeTruthy());
    await fireEvent.changeText(screen.getByLabelText('Name'), 'Lace Top');
    await fireEvent.changeText(screen.getByLabelText('Price (₦)'), '15,000');
    await fireEvent(screen.getByLabelText('M'), 'valueChange', true);
    await fireEvent.changeText(screen.getByLabelText('M stock'), '3');
    await fireEvent.press(screen.getByText('Save piece'));
    await waitFor(() => expect(admin.createProduct).toHaveBeenCalledTimes(1));
    expect(admin.createProduct.mock.calls[0][0]).toMatchObject({
      name: 'Lace Top', pricing_mode: 'single', price_kobo: 1500000, is_active: true,
      variants: [{ size: 'M', stock: 3, measurements: {} }],
    });
    await waitFor(() => expect(router.replace).toHaveBeenCalledWith('/admin/product/new-id'));
  });

  it('asks for a price on each size when pricing per size', async () => {
    await render(<ProductEditScreen />);
    await waitFor(() => expect(screen.getByText('New piece')).toBeTruthy());
    await fireEvent.press(screen.getByText('Price per size'));
    expect(screen.queryByLabelText('Price (₦)')).toBeNull();
    await fireEvent.changeText(screen.getByLabelText('Name'), 'Gown');
    await fireEvent(screen.getByLabelText('S'), 'valueChange', true);
    await fireEvent.changeText(screen.getByLabelText('S stock'), '1');
    await fireEvent.press(screen.getByText('Save piece'));
    expect(screen.getByText(/Enter a valid price for S/)).toBeTruthy();
  });

  it('shows the server’s reasons when saving is refused', async () => {
    admin.createProduct.mockRejectedValue({ status: 422, message: 'Please check the form.', details: [{ field: 'body.variants.0.size', message: 'Unknown size' }] });
    await render(<ProductEditScreen />);
    await waitFor(() => expect(screen.getByText('New piece')).toBeTruthy());
    await fireEvent.changeText(screen.getByLabelText('Name'), 'Lace Top');
    await fireEvent.changeText(screen.getByLabelText('Price (₦)'), '100');
    await fireEvent(screen.getByLabelText('M'), 'valueChange', true);
    await fireEvent.changeText(screen.getByLabelText('M stock'), '1');
    await fireEvent.press(screen.getByText('Save piece'));
    await waitFor(() => expect(screen.getByText('Please check the form.')).toBeTruthy());
    expect(screen.getByText('variants.0.size: Unknown size')).toBeTruthy();
  });
});

describe('existing piece', () => {
  beforeEach(() => {
    useLocalSearchParams.mockReturnValue({ id: 'p1' });
    admin.getAdminProduct.mockResolvedValue(product());
  });

  it('fills the form from the saved piece and saves changes', async () => {
    admin.saveProduct.mockResolvedValue(product({ name: 'Renamed' }));
    await render(<ProductEditScreen />);
    await waitFor(() => expect(screen.getByDisplayValue('Ankara Dress')).toBeTruthy());
    expect(screen.getByDisplayValue('15000')).toBeTruthy();
    await fireEvent.changeText(screen.getByLabelText('Name'), 'Renamed');
    await fireEvent.press(screen.getByText('Save piece'));
    await waitFor(() => expect(admin.saveProduct).toHaveBeenCalledWith('p1', expect.objectContaining({ name: 'Renamed' })));
    await waitFor(() => expect(screen.getByText('Saved ✓')).toBeTruthy());
  });

  it('says so when the piece no longer exists', async () => {
    admin.getAdminProduct.mockRejectedValue({ status: 404, code: 'not_found', message: 'Not found' });
    await render(<ProductEditScreen />);
    await waitFor(() => expect(screen.getByText('Piece not found')).toBeTruthy());
  });

  it('shrinks the chosen photo, then uploads it as a JPEG', async () => {
    ImagePicker.launchImageLibraryAsync.mockResolvedValue({ canceled: false, assets: [{ uri: 'file:///x/new.heic', width: 4000, height: 3000 }] });
    admin.uploadImage.mockResolvedValue(product({ images: [...product().images, { id: 'i3', position: 2, url: 'https://cdn.test/3.png' }] }));
    await render(<ProductEditScreen />);
    await waitFor(() => expect(screen.getByText('Choose photo')).toBeTruthy());
    await fireEvent.press(screen.getByText('Choose photo'));
    await waitFor(() => expect(admin.uploadImage).toHaveBeenCalledWith('p1', { uri: 'file:///shrunk.jpg', name: 'photo.jpg', type: 'image/jpeg', size: undefined }));
    await waitFor(() => expect(screen.getByText('3 of 3 photos. Delete one to add another.')).toBeTruthy());
  });

  it('shows the reason when the upload cannot reach the server', async () => {
    ImagePicker.launchImageLibraryAsync.mockResolvedValue({ canceled: false, assets: [{ uri: 'file:///x/a.jpg', width: 800, height: 600 }] });
    admin.uploadImage.mockRejectedValue({ status: 0, code: 'network_error', message: 'Cannot reach the server.', details: { reason: 'Network request failed' } });
    await render(<ProductEditScreen />);
    await waitFor(() => expect(screen.getByText('Choose photo')).toBeTruthy());
    await fireEvent.press(screen.getByText('Choose photo'));
    await waitFor(() => expect(screen.getByText('Cannot reach the server. (Network request failed)')).toBeTruthy());
  });

  it('does nothing when the picker is cancelled', async () => {
    ImagePicker.launchImageLibraryAsync.mockResolvedValue({ canceled: true, assets: null });
    await render(<ProductEditScreen />);
    await waitFor(() => expect(screen.getByText('Choose photo')).toBeTruthy());
    await fireEvent.press(screen.getByText('Choose photo'));
    expect(admin.uploadImage).not.toHaveBeenCalled();
  });

  it('explains when camera access is refused', async () => {
    ImagePicker.requestCameraPermissionsAsync.mockResolvedValue({ granted: false });
    await render(<ProductEditScreen />);
    await waitFor(() => expect(screen.getByText('Take photo')).toBeTruthy());
    await fireEvent.press(screen.getByText('Take photo'));
    await waitFor(() => expect(screen.getByText(/Allow camera access/)).toBeTruthy());
    expect(ImagePicker.launchCameraAsync).not.toHaveBeenCalled();
  });

  it('makes another photo the cover by putting it first', async () => {
    admin.reorderImages.mockResolvedValue(product());
    await render(<ProductEditScreen />);
    await waitFor(() => expect(screen.getByText('Make cover')).toBeTruthy());
    await fireEvent.press(screen.getByText('Make cover'));
    await waitFor(() => expect(admin.reorderImages).toHaveBeenCalledWith('p1', ['i2', 'i1']));
  });

  it('deletes a photo only after confirming', async () => {
    jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    admin.deleteImage.mockResolvedValue(product({ images: [product().images[0]] }));
    await render(<ProductEditScreen />);
    await waitFor(() => expect(screen.getAllByText('Delete').length).toBeGreaterThan(0));
    await fireEvent.press(screen.getAllByText('Delete')[0]);
    expect(admin.deleteImage).not.toHaveBeenCalled();
    await pressAlertButton('Delete');
    expect(admin.deleteImage).toHaveBeenCalledWith('p1', 'i1');
  });

  it('deletes the whole piece only after confirming, then returns to the list', async () => {
    jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    admin.deleteProduct.mockResolvedValue(null);
    await render(<ProductEditScreen />);
    await waitFor(() => expect(screen.getByText('Delete this piece')).toBeTruthy());
    await fireEvent.press(screen.getByText('Delete this piece'));
    expect(admin.deleteProduct).not.toHaveBeenCalled();
    await pressAlertButton('Delete');
    expect(admin.deleteProduct).toHaveBeenCalledWith('p1');
    await waitFor(() => expect(router.replace).toHaveBeenCalledWith('/admin/products'));
  });
});
