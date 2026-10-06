// Where the phone keeps the login token. expo-secure-store uses the iOS Keychain / Android
// Keystore: encrypted storage the OS protects, unlike AsyncStorage (plain text on disk).
// The website cannot do this (JavaScript there has no secure vault), which is why it uses an
// httpOnly cookie instead.
import * as SecureStore from 'expo-secure-store';

const KEY = 'isabella.token';

export const saveToken = (token) => SecureStore.setItemAsync(KEY, token);
export const readToken = async () => (await SecureStore.getItemAsync(KEY)) ?? null;
export const clearToken = () => SecureStore.deleteItemAsync(KEY);

/**
 * The header for the API client. A storage failure is NOT caught here: the shared client turns
 * it into an `auth_unavailable` error rather than silently sending an anonymous request.
 */
export const authHeader = async () => {
  const token = await readToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
};
