jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn(),
  setItemAsync: jest.fn(),
  deleteItemAsync: jest.fn(),
}));

import * as SecureStore from 'expo-secure-store';
import { authHeader, clearToken, readToken, saveToken } from '../src/auth/tokenStore';

beforeEach(() => jest.resetAllMocks());

describe('tokenStore', () => {
  it('saves and reads the token from secure storage', async () => {
    SecureStore.getItemAsync.mockResolvedValue('tok');
    await saveToken('tok');
    expect(SecureStore.setItemAsync).toHaveBeenCalledWith('isabella.token', 'tok');
    expect(await readToken()).toBe('tok');
  });

  it('clears the token', async () => {
    await clearToken();
    expect(SecureStore.deleteItemAsync).toHaveBeenCalledWith('isabella.token');
  });

  it('reads as null when nothing is stored', async () => {
    SecureStore.getItemAsync.mockResolvedValue(null);
    expect(await readToken()).toBeNull();
  });

  it('builds a Bearer header, or no header when signed out', async () => {
    SecureStore.getItemAsync.mockResolvedValueOnce('tok');
    expect(await authHeader()).toEqual({ Authorization: 'Bearer tok' });
    SecureStore.getItemAsync.mockResolvedValueOnce(null);
    expect(await authHeader()).toEqual({});
  });

  it('lets a storage failure propagate so the client refuses to send an anonymous request', async () => {
    SecureStore.getItemAsync.mockRejectedValue(new Error('keychain locked'));
    await expect(authHeader()).rejects.toThrow('keychain locked');
  });
});
