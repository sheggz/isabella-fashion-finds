import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import { session } from '../../src/auth';
import { useSession } from '../../src/useSession';
import { useTheme } from '../../src/theme';

function Button({ label, onPress, colors, radius, outline = false }) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={{ backgroundColor: outline ? 'transparent' : colors.accent, borderColor: colors.accent, borderWidth: 1, borderRadius: radius, paddingVertical: 12, paddingHorizontal: 20, alignItems: 'center', marginTop: 16 }}
    >
      <Text style={{ color: outline ? colors.accent : colors.accentText, fontWeight: '600' }}>{label}</Text>
    </Pressable>
  );
}

export default function AccountScreen() {
  const { colors, radius } = useTheme();
  const { status, user, error } = useSession();
  const text = { color: colors.text };
  const muted = { color: colors.muted };

  let body;
  if (status === 'loading') {
    body = (
      <View>
        <ActivityIndicator color={colors.accent} />
        <Text style={[muted, { textAlign: 'center', marginTop: 8 }]}>Checking your sign-in…</Text>
      </View>
    );
  } else if (status === 'signingIn') {
    body = (
      <View>
        <ActivityIndicator color={colors.accent} />
        <Text style={[muted, { textAlign: 'center', marginTop: 8 }]}>Opening Google…</Text>
      </View>
    );
  } else if (status === 'signedIn') {
    body = (
      <View>
        <View style={{ width: 64, height: 64, borderRadius: 32, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center', marginBottom: 12 }}>
          <Text style={{ color: colors.accentText, fontSize: 28, fontWeight: '800' }}>{(user.name || user.email || '?').charAt(0).toUpperCase()}</Text>
        </View>
        <Text style={[text, { fontSize: 22, fontWeight: '700' }]}>{user.name || user.email}</Text>
        {user.name ? <Text style={muted}>{user.email}</Text> : null}
        <Text style={[muted, { marginTop: 4 }]}>{user.role === 'owner' ? 'Store owner' : 'Customer'}</Text>
        <Button label="Sign out" outline onPress={() => session.signOut()} colors={colors} radius={radius} />
      </View>
    );
  } else if (status === 'unreachable') {
    body = (
      <View>
        <Text style={text}>The server is waking up or unreachable. You are still signed in; please try again in a moment.</Text>
        {error ? <Text style={[muted, { marginTop: 6 }]}>{error}</Text> : null}
        <Button label="Try again" onPress={() => session.restore()} colors={colors} radius={radius} />
      </View>
    );
  } else {
    body = (
      <View>
        <Text style={[text, { fontSize: 22, fontWeight: '700' }]}>Welcome</Text>
        <Text style={muted}>Sign in to keep a cart, see your orders and (for the owner) manage the shop.</Text>
        {error ? (
          <Text accessibilityRole="alert" style={{ color: colors.danger, marginTop: 10 }}>
            {error}
          </Text>
        ) : null}
        <Button label="Sign in with Google" onPress={() => session.signIn()} colors={colors} radius={radius} />
      </View>
    );
  }

  return <View style={{ flex: 1, backgroundColor: colors.bg, padding: 24, justifyContent: 'center' }}>{body}</View>;
}
