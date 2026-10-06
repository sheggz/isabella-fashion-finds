import { router } from 'expo-router';
import { useState } from 'react';
import { Alert, FlatList, Pressable, RefreshControl, Text, View } from 'react-native';
import { checkoutBlocked, formatNaira, lineNotices, sizeText, stepperState } from '@isabella/core';
import { Button, Centered, ErrorBlock, Photo, Price, SignInPrompt } from '../../src/components/ui';
import { cartState } from '../../src/state/cart';
import { useTheme } from '../../src/theme';
import { useLive } from '../../src/useLive';
import { useSession } from '../../src/useSession';
import { useStoreValue } from '../../src/useStoreValue';

function Stepper({ line, busy, onChange, onRemove }) {
  const { colors } = useTheme();
  const { canDecrease, canIncrease } = stepperState(line);
  const btn = (label, enabled, onPress, a11y) => (
    <Pressable accessibilityLabel={a11y} disabled={!enabled || busy} onPress={onPress} style={{ width: 36, height: 36, alignItems: 'center', justifyContent: 'center' }}>
      <Text style={{ color: colors.text, fontSize: 20, opacity: enabled && !busy ? 1 : 0.3 }}>{label}</Text>
    </Pressable>
  );
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 8 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: colors.border, borderRadius: 4 }}>
        {btn('−', canDecrease, () => onChange(line.quantity - 1), 'Decrease quantity')}
        <Text accessibilityLabel="Quantity" style={{ color: colors.text, minWidth: 24, textAlign: 'center', fontWeight: '700' }}>{line.quantity}</Text>
        {btn('+', canIncrease, () => onChange(line.quantity + 1), 'Increase quantity')}
      </View>
      <Pressable accessibilityRole="button" disabled={busy} onPress={onRemove}>
        <Text style={{ color: colors.danger, fontWeight: '600' }}>Remove</Text>
      </Pressable>
    </View>
  );
}

export default function CartScreen() {
  const { colors, radius } = useTheme();
  const { status: sessionStatus } = useSession();
  const { status, data, error } = useStoreValue(cartState.store);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const signedIn = sessionStatus === 'signedIn';

  useLive(() => cartState.refresh(), { enabled: signedIn });

  if (sessionStatus === 'loading') return <Centered><Text style={{ color: colors.muted }}>Checking your sign-in…</Text></Centered>;
  if (!signedIn) return <SignInPrompt message="Sign in to keep a cart and check out." onPress={() => router.navigate('/account')} />;
  if (!data) {
    return status === 'error' ? <ErrorBlock error={error} onRetry={() => cartState.load()} /> : <Centered><Text style={{ color: colors.muted }}>Loading your cart…</Text></Centered>;
  }

  // Ignore taps while a change is being saved (no double changes); show a refusal in words.
  const act = async (change) => {
    if (busy) return;
    setBusy(true);
    setMessage('');
    try {
      await change();
    } catch (e) {
      setMessage(e?.message ?? 'Something went wrong. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  const confirmEmpty = () =>
    Alert.alert('Empty your cart?', 'This removes everything from your cart.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Empty cart', style: 'destructive', onPress: () => act(() => cartState.emptyCart()) },
    ]);

  if (data.lines.length === 0) {
    return (
      <Centered>
        <Text style={{ color: colors.text, fontSize: 20, fontWeight: '700' }}>Your cart is empty</Text>
        <Text style={{ color: colors.muted }}>Find something you love in the shop.</Text>
        <Button label="Browse the shop" onPress={() => router.navigate('/')} />
      </Centered>
    );
  }

  const blocked = checkoutBlocked(data);
  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <FlatList
        contentContainerStyle={{ padding: 16, gap: 12 }}
        data={data.lines}
        keyExtractor={(l) => l.variant_id}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            tintColor={colors.accent}
            onRefresh={async () => {
              setRefreshing(true);
              await cartState.load();
              setRefreshing(false);
            }}
          />
        }
        ListHeaderComponent={message ? <Text accessibilityRole="alert" style={{ color: colors.danger, marginBottom: 4 }}>{message}</Text> : null}
        renderItem={({ item: line }) => {
          const original = line.base_price_kobo > line.unit_price_kobo ? line.base_price_kobo : null;
          return (
            <View style={{ flexDirection: 'row', gap: 12, backgroundColor: colors.surface, borderColor: line.problem ? colors.danger : colors.border, borderWidth: 1, borderRadius: radius, padding: 10 }}>
              <Photo uri={line.image_url} style={{ width: 84 }} />
              <View style={{ flex: 1 }}>
                <Pressable onPress={() => router.push(`/product/${encodeURIComponent(line.product_id)}`)}>
                  <Text style={{ color: colors.text, fontWeight: '700' }}>{line.name}</Text>
                </Pressable>
                <Text style={{ color: colors.muted }}>Size {sizeText(line.size)}</Text>
                <Price display={{ prefix: '', current: line.unit_price_kobo, original }} />
                {lineNotices(line).map((n) => (
                  <Text key={n.kind} style={{ color: n.kind === 'problem' ? colors.danger : colors.accent, fontSize: 12, marginTop: 4 }}>{n.text}</Text>
                ))}
                <Stepper
                  line={line}
                  busy={busy}
                  onChange={(q) => act(() => cartState.changeQuantity(line.variant_id, q))}
                  onRemove={() => act(() => cartState.removeLine(line.variant_id))}
                />
              </View>
              <Text style={{ color: colors.text, fontWeight: '700' }}>{formatNaira(line.line_total_kobo)}</Text>
            </View>
          );
        }}
      />
      <View style={{ backgroundColor: colors.surface, borderTopColor: colors.border, borderTopWidth: 1, padding: 16, gap: 6 }}>
        <Text style={{ color: colors.muted }}>{data.item_count} {data.item_count === 1 ? 'item' : 'items'}</Text>
        <Text style={{ color: colors.text, fontSize: 20, fontWeight: '800' }}>Subtotal {formatNaira(data.subtotal_kobo)}</Text>
        {data.savings_kobo > 0 ? <Text style={{ color: colors.success, fontWeight: '600' }}>You save {formatNaira(data.savings_kobo)}</Text> : null}
        {/* Checkout arrives with online payment; until then it stays closed and says why. */}
        <Button label="Checkout" disabled />
        <Text style={{ color: colors.muted, fontSize: 12 }}>{data.has_problems ? 'Fix the items marked above to continue.' : blocked ? '' : 'Checkout is not open yet.'}</Text>
        <Pressable accessibilityRole="button" onPress={confirmEmpty} disabled={busy}>
          <Text style={{ color: colors.danger, textAlign: 'center', marginTop: 4 }}>Empty cart</Text>
        </Pressable>
      </View>
    </View>
  );
}
