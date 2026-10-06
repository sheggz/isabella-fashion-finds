// The real session for the running app: the controller wired to secure storage, the API,
// the in-app browser and the phone's crypto.
import * as Crypto from 'expo-crypto';
import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';
import { base64UrlEncode, createPkce } from '@isabella/core';
import { exchangeMobileCode, getMe } from '../api/client';
import { AUTH_URL } from '../config';
import { performSignIn } from './signIn';
import { createSessionController } from './session';
import { clearToken, readToken, saveToken } from './tokenStore';

const hexToBytes = (hex) => Uint8Array.from(hex.match(/../g) ?? [], (pair) => parseInt(pair, 16));

// expo-crypto hashes a string and can return it as hex; we turn that into the raw bytes PKCE needs.
const sha256 = async (text) =>
  hexToBytes(await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, text, { encoding: Crypto.CryptoEncoding.HEX }));

const signIn = () =>
  performSignIn({
    apiBase: AUTH_URL,
    // Expo Go: exp://<your computer>:8081/--/auth (changes with the network). A real build: isabella://auth.
    // The backend only accepts these prefixes (MOBILE_REDIRECT_PREFIXES).
    redirectUri: Linking.createURL('auth'),
    createPkce: () => createPkce({ randomBytes: (n) => Crypto.getRandomBytes(n), sha256 }),
    randomState: () => base64UrlEncode(Crypto.getRandomBytes(16)),
    openBrowser: (url, redirectUri) => WebBrowser.openAuthSessionAsync(url, redirectUri),
    exchange: async (code, verifier) => exchangeMobileCode(code, verifier),
  });

export const session = createSessionController({ readToken, saveToken, clearToken, getMe, signIn });
