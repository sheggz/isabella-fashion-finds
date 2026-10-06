import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, RefreshControl, Text, View } from 'react-native';
import { formatNaira, isSoldOut, priceDisplay } from '@isabella/core';
import { listProducts } from '../../src/api/client';
import { useTheme } from '../../src/theme';

/** The catalogue, straight from the live API (same endpoint and same price rules as the website). */
export default function ShopScreen() {
  const { colors, radius } = useTheme();
  const [state, setState] = useState({ status: 'loading', products: [], error: null });
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      setState({ status: 'ready', products: await listProducts(), error: null });
    } catch (error) {
      setState((s) => ({ ...s, status: 'error', error }));
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  if (state.status === 'loading') {
    return (
      <View style={{ flex: 1, backgroundColor: colors.bg, justifyContent: 'center', padding: 24 }}>
        <ActivityIndicator color={colors.accent} />
        <Text style={{ color: colors.muted, textAlign: 'center', marginTop: 8 }}>Loading… (the first load can take a minute while the server wakes up)</Text>
      </View>
    );
  }

  if (state.status === 'error') {
    return (
      <View style={{ flex: 1, backgroundColor: colors.bg, justifyContent: 'center', padding: 24 }}>
        <Text accessibilityRole="alert" style={{ color: colors.danger }}>{state.error?.message ?? 'Something went wrong.'}</Text>
        <Pressable accessibilityRole="button" onPress={load} style={{ marginTop: 16, backgroundColor: colors.accent, borderRadius: radius, padding: 12, alignItems: 'center' }}>
          <Text style={{ color: colors.accentText, fontWeight: '600' }}>Try again</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <FlatList
      style={{ backgroundColor: colors.bg }}
      contentContainerStyle={{ padding: 16, gap: 12, flexGrow: 1 }}
      data={state.products}
      keyExtractor={(p) => p.id}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.accent} />}
      ListEmptyComponent={<Text style={{ color: colors.muted, textAlign: 'center', marginTop: 40 }}>No pieces yet. Check back soon.</Text>}
      renderItem={({ item }) => {
        const price = priceDisplay(item);
        return (
          <View style={{ backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1, borderRadius: radius, padding: 14 }}>
            <Text style={{ color: colors.text, fontSize: 17, fontWeight: '600' }}>{item.name}</Text>
            <Text style={{ color: colors.text, marginTop: 4 }}>
              {price.prefix}{formatNaira(price.current)}
              {price.original !== null ? <Text style={{ color: colors.muted, textDecorationLine: 'line-through' }}>{'  '}{formatNaira(price.original)}</Text> : null}
            </Text>
            {isSoldOut(item) ? <Text style={{ color: colors.danger, marginTop: 4, fontWeight: '600' }}>Sold out</Text> : null}
          </View>
        );
      }}
    />
  );
}
