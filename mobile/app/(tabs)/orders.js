import { router } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { FlatList, RefreshControl, Text, View } from 'react-native';
import { formatNaira, formatWhen, orderStatusLabel, sizeText } from '@isabella/core';
import { listOrders } from '../../src/api/client';
import { Badge, Button, Centered, ErrorBlock, Photo, SignInPrompt } from '../../src/components/ui';
import { useTheme } from '../../src/theme';
import { useLive } from '../../src/useLive';
import { useSession } from '../../src/useSession';

const TONE = { paid: 'success', pending: 'warning', failed: 'danger', cancelled: 'danger' };

export default function OrdersScreen() {
  const { colors, radius } = useTheme();
  const { status: sessionStatus } = useSession();
  const signedIn = sessionStatus === 'signedIn';
  const [state, setState] = useState({ status: 'loading', orders: [], error: null });
  const [refreshing, setRefreshing] = useState(false);
  const shown = useRef(null);

  const load = useCallback(async () => {
    try {
      const orders = await listOrders();
      shown.current = JSON.stringify(orders);
      setState({ status: 'ready', orders, error: null });
    } catch (error) {
      setState((s) => ({ ...s, status: 'error', error }));
    }
  }, []);

  useEffect(() => {
    if (signedIn) load();
  }, [signedIn, load]);

  useLive(async () => {
    const orders = await listOrders();
    if (JSON.stringify(orders) !== shown.current) {
      shown.current = JSON.stringify(orders);
      setState({ status: 'ready', orders, error: null });
    }
  }, { enabled: signedIn });

  if (sessionStatus === 'loading') return <Centered><Text style={{ color: colors.muted }}>Checking your sign-in…</Text></Centered>;
  if (!signedIn) return <SignInPrompt message="Sign in to see your orders." onPress={() => router.navigate('/account')} />;
  if (state.status === 'loading') return <Centered><Text style={{ color: colors.muted }}>Loading your orders…</Text></Centered>;
  if (state.status === 'error' && state.orders.length === 0) return <ErrorBlock error={state.error} onRetry={load} />;

  const tz = new Date().getTimezoneOffset();
  return (
    <FlatList
      style={{ backgroundColor: colors.bg }}
      contentContainerStyle={{ padding: 16, gap: 14, flexGrow: 1 }}
      data={state.orders}
      keyExtractor={(o) => o.id}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          tintColor={colors.accent}
          onRefresh={async () => {
            setRefreshing(true);
            await load();
            setRefreshing(false);
          }}
        />
      }
      ListEmptyComponent={
        <Centered>
          <Text style={{ color: colors.text, fontSize: 20, fontWeight: '700' }}>No orders yet</Text>
          <Text style={{ color: colors.muted }}>When you buy something it will show up here.</Text>
          <Button label="Browse the shop" onPress={() => router.navigate('/')} />
        </Centered>
      }
      renderItem={({ item: order }) => (
        <View style={{ backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1, borderRadius: radius, padding: 12, gap: 10 }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <Text style={{ color: colors.muted }}>{formatWhen(order.created_at, tz)}</Text>
            <Badge text={orderStatusLabel(order.status)} tone={TONE[order.status] ?? 'neutral'} />
          </View>
          {order.items.map((item, i) => (
            <View key={`${item.product_name}-${item.size}-${i}`} style={{ flexDirection: 'row', gap: 10 }}>
              <Photo uri={item.image_url} style={{ width: 56 }} />
              <View style={{ flex: 1 }}>
                <Text style={{ color: colors.text, fontWeight: '600' }}>{item.product_name}</Text>
                <Text style={{ color: colors.muted }}>Size {sizeText(item.size)} × {item.quantity}</Text>
                {item.discount_name ? <Text style={{ color: colors.accent, fontSize: 12 }}>{item.discount_name}</Text> : null}
              </View>
              <Text style={{ color: colors.text }}>{formatNaira(item.line_total_kobo)}</Text>
            </View>
          ))}
          <Text style={{ color: colors.text, fontWeight: '800', textAlign: 'right' }}>Total {formatNaira(order.total_kobo)}</Text>
        </View>
      )}
    />
  );
}
