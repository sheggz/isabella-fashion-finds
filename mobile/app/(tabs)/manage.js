import { router } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Text, View } from 'react-native';
import { barHeights, formatNaira, shortDayLabel } from '@isabella/core';
import { admin } from '../../src/api/client';
import { Button, Centered, ErrorBlock } from '../../src/components/ui';
import { OwnerOnly, Section } from '../../src/components/forms';
import { useLive } from '../../src/useLive';
import { useTheme } from '../../src/theme';

const DAYS = 30;

function Stat({ label, value }) {
  const { colors, radius } = useTheme();
  return (
    <View style={{ flex: 1, minWidth: 100, borderColor: colors.border, borderWidth: 1, borderRadius: radius, padding: 10 }}>
      <Text style={{ color: colors.text, fontSize: 18, fontWeight: '800' }}>{value}</Text>
      <Text style={{ color: colors.muted, fontSize: 12 }}>{label}</Text>
    </View>
  );
}

function SalesChart({ byDay }) {
  const { colors } = useTheme();
  const heights = barHeights(byDay.map((d) => d.revenue_kobo));
  return (
    <View accessibilityLabel={`Daily sales, last ${byDay.length} days`} style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 2, height: 110, borderBottomColor: colors.border, borderBottomWidth: 1 }}>
      {byDay.map((day, i) => (
        <View
          key={day.date}
          accessibilityLabel={`${shortDayLabel(day.date)}: ${formatNaira(day.revenue_kobo)}, ${day.orders} orders`}
          style={{ flex: 1, height: `${heights[i]}%`, backgroundColor: colors.accent, borderTopLeftRadius: 2, borderTopRightRadius: 2 }}
        />
      ))}
    </View>
  );
}

function ProductLink({ id, children }) {
  const { colors } = useTheme();
  return (
    <Pressable accessibilityRole="link" onPress={() => router.push(`/admin/product/${encodeURIComponent(id)}`)}>
      <Text style={{ color: colors.accent, fontWeight: '600' }}>{children}</Text>
    </Pressable>
  );
}

function Dashboard() {
  const { colors } = useTheme();
  const [state, setState] = useState({ status: 'loading', data: null, error: null });
  const shown = useRef(null);

  const load = useCallback(async () => {
    try {
      const data = await admin.getDashboard({ days: DAYS });
      shown.current = JSON.stringify(data);
      setState({ status: 'ready', data, error: null });
    } catch (error) {
      setState({ status: 'error', data: null, error });
    }
  }, []);
  useEffect(() => { load(); }, [load]);
  useLive(async () => {
    const data = await admin.getDashboard({ days: DAYS });
    if (JSON.stringify(data) !== shown.current) {
      shown.current = JSON.stringify(data);
      setState({ status: 'ready', data, error: null });
    }
  });

  if (state.status === 'loading') return <Centered><ActivityIndicator color={colors.accent} /></Centered>;
  if (state.status === 'error') return <ErrorBlock error={state.error} onRetry={load} />;
  const { stock, sales } = state.data;
  const calm = stock.low_stock.length === 0 && stock.sold_out.length === 0;

  return (
    <ScrollView style={{ backgroundColor: colors.bg }} contentContainerStyle={{ padding: 16, gap: 14 }}>
      <View style={{ flexDirection: 'row', gap: 10 }}>
        <Button label="Pieces" onPress={() => router.push('/admin/products')} style={{ flex: 1 }} />
        <Button label="Discounts" outline onPress={() => router.push('/admin/discounts')} style={{ flex: 1 }} />
      </View>

      <Section title="Stock">
        <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
          <Stat label="Units in stock" value={String(stock.units_in_stock)} />
          <Stat label="Pieces on sale" value={String(stock.visible_pieces)} />
        </View>
        {calm ? <Text style={{ color: colors.muted }}>Nothing is running low. Good.</Text> : null}
        {stock.sold_out.length > 0 ? <Text style={{ color: colors.text, fontWeight: '700' }}>Sold out</Text> : null}
        {stock.sold_out.map((p) => <ProductLink key={p.product_id} id={p.product_id}>{p.name}</ProductLink>)}
        {stock.low_stock.length > 0 ? <Text style={{ color: colors.text, fontWeight: '700' }}>Running low ({stock.low_stock_threshold} or fewer)</Text> : null}
        {stock.low_stock.map((r) => (
          <View key={`${r.product_id}-${r.size}`} style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
            <ProductLink id={r.product_id}>{`${r.name} (${r.size})`}</ProductLink>
            <Text style={{ color: colors.muted }}>{r.stock} left</Text>
          </View>
        ))}
      </Section>

      <Section title={`Sales, last ${sales.days} days`}>
        {sales.orders === 0 ? (
          <Text style={{ color: colors.muted }}>No paid orders yet. Sales appear here once customers can pay online.</Text>
        ) : (
          <>
            <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
              <Stat label="Revenue" value={formatNaira(sales.revenue_kobo)} />
              <Stat label="Orders" value={String(sales.orders)} />
              <Stat label="Items sold" value={String(sales.items_sold)} />
              <Stat label="Average order" value={formatNaira(sales.average_order_kobo)} />
            </View>
            <SalesChart byDay={sales.by_day} />
            <Text style={{ color: colors.text, fontWeight: '700' }}>Best sellers</Text>
            {sales.top_products.map((p) => (
              <View key={p.product_id ?? p.name} style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                <Text style={{ color: colors.text }}>{p.name}</Text>
                <Text style={{ color: colors.muted }}>{p.units} sold · {formatNaira(p.revenue_kobo)}</Text>
              </View>
            ))}
          </>
        )}
      </Section>
    </ScrollView>
  );
}

export default function ManageScreen() {
  return (
    <OwnerOnly>
      <Dashboard />
    </OwnerOnly>
  );
}
