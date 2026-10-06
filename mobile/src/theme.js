// The phone's colours come from the SAME brand kit as the website (@isabella/core theme.js).
// Edit the brand there and both change. Light/dark follows the phone's setting.
import { useColorScheme } from 'react-native';
import { defaultTheme } from '@isabella/core';

export const useTheme = () => {
  const scheme = useColorScheme();
  return { colors: scheme === 'dark' ? defaultTheme.dark : defaultTheme.light, radius: 4 };
};
