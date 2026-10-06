import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { session } from '../src/auth';

export default function RootLayout() {
  // Look for a saved login once, when the app starts, so the user stays signed in across launches.
  useEffect(() => {
    session.restore();
  }, []);

  return (
    <>
      <StatusBar style="auto" />
      <Stack screenOptions={{ headerShown: false }} />
    </>
  );
}
