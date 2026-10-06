import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { session } from '../src/auth';
import { cartState } from '../src/state/cart';
import { useTheme } from '../src/theme';
import { useSession } from '../src/useSession';

export default function RootLayout() {
  const { colors } = useTheme();
  const { status } = useSession();

  // Look for a saved login once, when the app starts, so the user stays signed in across launches.
  useEffect(() => {
    session.restore();
  }, []);

  // The cart belongs to whoever is signed in: fetch it on sign-in, forget it on sign-out.
  // (An "unreachable" status keeps whatever the cart already holds.)
  useEffect(() => {
    if (status === 'signedIn') cartState.load();
    else if (status === 'signedOut') cartState.reset();
  }, [status]);

  return (
    <>
      <StatusBar style="auto" />
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen
          name="product/[id]"
          options={{ headerShown: true, title: '', headerTransparent: false, headerStyle: { backgroundColor: colors.surface }, headerTintColor: colors.text }}
        />
      </Stack>
    </>
  );
}
