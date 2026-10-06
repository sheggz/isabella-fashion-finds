import { Text, View } from 'react-native';
import { useTheme } from '../theme';

/** Placeholder body for tabs whose real screen arrives in a later block. */
export function ComingSoon({ title, children }) {
  const { colors } = useTheme();
  return (
    <View style={{ flex: 1, backgroundColor: colors.bg, padding: 24, justifyContent: 'center' }}>
      <Text style={{ color: colors.text, fontSize: 20, fontWeight: '700', marginBottom: 8 }}>{title}</Text>
      <Text style={{ color: colors.muted }}>{children}</Text>
    </View>
  );
}
