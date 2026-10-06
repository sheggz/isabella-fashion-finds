import { fireEvent, render, screen } from '@testing-library/react-native';

jest.mock('../src/auth', () => {
  const { createStore } = require('@isabella/core');
  return {
    session: {
      store: createStore({ status: 'signedOut', user: null, error: null }),
      signIn: jest.fn(),
      signOut: jest.fn(),
      restore: jest.fn(),
    },
  };
});

import { session } from '../src/auth';
import AccountScreen from '../app/(tabs)/account';

const setState = (state) => session.store.set({ user: null, error: null, ...state });
beforeEach(() => jest.clearAllMocks());

describe('Account screen', () => {
  it('offers Google sign-in when signed out and starts it on press', async () => {
    setState({ status: 'signedOut' });
    await render(<AccountScreen />);
    await fireEvent.press(screen.getByText('Sign in with Google'));
    expect(session.signIn).toHaveBeenCalledTimes(1);
  });

  it('shows why a sign-in failed', async () => {
    setState({ status: 'signedOut', error: 'Sign-in failed. Please try again.' });
    await render(<AccountScreen />);
    expect(screen.getByRole('alert')).toHaveTextContent('Sign-in failed. Please try again.');
  });

  it('shows progress and disables the button while signing in', async () => {
    setState({ status: 'signingIn' });
    await render(<AccountScreen />);
    expect(screen.getByText(/opening google/i)).toBeTruthy();
    expect(screen.queryByText('Sign in with Google')).toBeNull();
  });

  it('shows who is signed in with their role and a sign-out button', async () => {
    setState({ status: 'signedIn', user: { name: 'Ada', email: 'ada@x.test', role: 'owner' } });
    await render(<AccountScreen />);
    expect(screen.getByText('Ada')).toBeTruthy();
    expect(screen.getByText('ada@x.test')).toBeTruthy();
    expect(screen.getByText(/owner/i)).toBeTruthy();
    await fireEvent.press(screen.getByText('Sign out'));
    expect(session.signOut).toHaveBeenCalledTimes(1);
  });

  it('renders a hostile name as plain text', async () => {
    setState({ status: 'signedIn', user: { name: '<script>alert(1)</script>', email: 'a@x.test', role: 'customer' } });
    await render(<AccountScreen />);
    expect(screen.getByText('<script>alert(1)</script>')).toBeTruthy();
  });

  it('explains an unreachable server and offers a retry', async () => {
    setState({ status: 'unreachable', error: 'Cannot reach the server.' });
    await render(<AccountScreen />);
    expect(screen.getByText(/waking up or unreachable/i)).toBeTruthy();
    await fireEvent.press(screen.getByText('Try again'));
    expect(session.restore).toHaveBeenCalledTimes(1);
  });

  it('shows a loading message while the saved login is being checked', async () => {
    setState({ status: 'loading' });
    await render(<AccountScreen />);
    expect(screen.getByText(/checking/i)).toBeTruthy();
  });
});
