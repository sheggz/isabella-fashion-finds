// Small building blocks shared by every screen, styled from the brand kit (no colours hard-coded).
import { Image, Pressable, Text, View } from 'react-native';
import { formatNaira } from '@isabella/core';
import { useTheme } from '../theme';

/** A photo with a calm placeholder when there is none yet. `ratio` = width / height. */
export function Photo({ uri, ratio = 3 / 4, style }) {
  const { colors, radius } = useTheme();
  const box = { aspectRatio: ratio, backgroundColor: colors.border, borderRadius: radius, overflow: 'hidden' };
  if (!uri) {
    return (
      <View style={[box, { alignItems: 'center', justifyContent: 'center' }, style]}>
        <Text style={{ color: colors.muted, fontSize: 12 }}>No photo yet</Text>
      </View>
    );
  }
  return <Image source={{ uri }} resizeMode="cover" accessibilityIgnoresInvertColors style={[box, style]} />;
}

export function Button({ label, onPress, disabled = false, outline = false, style }) {
  const { colors, radius } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        {
          backgroundColor: outline ? 'transparent' : colors.accent,
          borderColor: colors.accent,
          borderWidth: 1.5,
          borderRadius: radius,
          paddingVertical: 14,
          paddingHorizontal: 20,
          alignItems: 'center',
          opacity: disabled ? 0.45 : pressed ? 0.85 : 1,
        },
        style,
      ]}
    >
      <Text style={{ color: outline ? colors.accent : colors.accentText, fontWeight: '700', letterSpacing: 0.3 }}>{label}</Text>
    </Pressable>
  );
}

/** tone: 'neutral' | 'sale' | 'danger' | 'success' | 'warning' */
export function Badge({ text, tone = 'neutral', style }) {
  const { colors } = useTheme();
  const bg = { neutral: colors.text, sale: colors.accent, danger: colors.danger, success: colors.success, warning: colors.warning }[tone];
  const fg = tone === 'neutral' ? colors.bg : tone === 'sale' ? colors.accentText : '#ffffff';
  return (
    <View style={[{ backgroundColor: bg, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 4, alignSelf: 'flex-start' }, style]}>
      <Text style={{ color: fg, fontSize: 11, fontWeight: '700' }}>{text}</Text>
    </View>
  );
}

/** `display` = { prefix, current, original } from priceDisplay / variantPriceDisplay (core). */
export function Price({ display, size = 15 }) {
  const { colors } = useTheme();
  return (
    <Text style={{ color: colors.text, fontSize: size, fontWeight: '700' }}>
      {display.prefix ?? ''}
      {formatNaira(display.current)}
      {display.original !== null && display.original !== undefined ? (
        <Text style={{ color: colors.muted, fontWeight: '400', textDecorationLine: 'line-through' }}>
          {'  '}
          {formatNaira(display.original)}
        </Text>
      ) : null}
    </Text>
  );
}

/** Shown on screens that need a signed-in shopper. */
export function SignInPrompt({ message, onPress }) {
  const { colors } = useTheme();
  return (
    <View style={{ flex: 1, backgroundColor: colors.bg, padding: 24, justifyContent: 'center', gap: 16 }}>
      <Text style={{ color: colors.text, fontSize: 20, fontWeight: '700' }}>Please sign in</Text>
      <Text style={{ color: colors.muted }}>{message}</Text>
      <Button label="Go to sign in" onPress={onPress} />
    </View>
  );
}

export function Centered({ children }) {
  const { colors } = useTheme();
  return <View style={{ flex: 1, backgroundColor: colors.bg, justifyContent: 'center', padding: 24, gap: 12 }}>{children}</View>;
}

export function ErrorBlock({ error, onRetry }) {
  const { colors } = useTheme();
  return (
    <Centered>
      <Text accessibilityRole="alert" style={{ color: colors.danger }}>
        {error?.message ?? 'Something went wrong. Please try again.'}
      </Text>
      <Button label="Try again" onPress={onRetry} />
    </Centered>
  );
}
