import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, ImageBackground, RefreshControl, Text, View } from 'react-native';
import { brandContent } from '@isabella/core';
import { listProducts } from '../../src/api/client';
import { ProductCard } from '../../src/components/ProductCard';
import { ErrorBlock } from '../../src/components/ui';
import { useLive } from '../../src/useLive';
import { useTheme } from '../../src/theme';

function Hero() {
  const { colors } = useTheme();
  const { hero, brandName } = brandContent;
  return (
    <ImageBackground source={{ uri: hero.image }} style={{ height: 240, justifyContent: 'flex-end' }}>
      <View style={{ ...StyleAbsolute, backgroundColor: colors.heroOverlay }} />
      <View style={{ padding: 20 }}>
        <Text style={{ color: colors.onImage, fontSize: 12, fontWeight: '700', letterSpacing: 1.5 }}>{brandName.toUpperCase()}</Text>
        <Text style={{ color: colors.onImage, fontSize: 26, fontWeight: '800', marginTop: 4 }}>{hero.title}</Text>
        <Text style={{ color: colors.onImage, marginTop: 6 }}>{hero.subtitle}</Text>
      </View>
    </ImageBackground>
  );
}
const StyleAbsolute = { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 };

/** The catalogue, straight from the live API (same endpoint and price rules as the website). */
export default function ShopScreen() {
  const { colors } = useTheme();
  const [state, setState] = useState({ status: 'loading', products: [], error: null });
  const [refreshing, setRefreshing] = useState(false);
  const shown = useRef(null);

  const load = useCallback(async () => {
    try {
      const products = await listProducts();
      shown.current = JSON.stringify(products);
      setState({ status: 'ready', products, error: null });
    } catch (error) {
      setState((s) => ({ ...s, status: 'error', error }));
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // Background sync: changes made on the website appear within about 15 seconds. Silent, and the
  // list is replaced only if something changed (no flicker, scroll position kept).
  useLive(async () => {
    const products = await listProducts();
    if (JSON.stringify(products) !== shown.current) {
      shown.current = JSON.stringify(products);
      setState({ status: 'ready', products, error: null });
    }
  });

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
  if (state.status === 'error' && state.products.length === 0) return <ErrorBlock error={state.error} onRetry={load} />;

  return (
    <FlatList
      style={{ backgroundColor: colors.bg }}
      contentContainerStyle={{ paddingBottom: 24, flexGrow: 1 }}
      columnWrapperStyle={{ gap: 12, paddingHorizontal: 16 }}
      ItemSeparatorComponent={() => <View style={{ height: 18 }} />}
      numColumns={2}
      data={state.products.length % 2 === 1 ? [...state.products, { id: '__spacer', spacer: true }] : state.products}
      keyExtractor={(p) => p.id}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.accent} />}
      ListHeaderComponent={
        <View style={{ marginBottom: 18 }}>
          <Hero />
          <Text style={{ color: colors.text, fontSize: 20, fontWeight: '800', margin: 16, marginBottom: 0 }}>New in</Text>
        </View>
      }
      ListEmptyComponent={<Text style={{ color: colors.muted, textAlign: 'center', marginTop: 40 }}>No pieces yet. Check back soon.</Text>}
      // An odd last item gets an empty neighbour so it keeps half width instead of stretching.
      renderItem={({ item }) => (item.spacer ? <View style={{ flex: 1 }} /> : <ProductCard product={item} />)}
    />
  );
}
