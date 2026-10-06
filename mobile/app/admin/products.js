import { router } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { FlatList, Pressable, Text, View } from 'react-native';
import { formatNaira, stockSummary } from '@isabella/core';
import { admin, getCatalogueOptions } from '../../src/api/client';
import { OwnerOnly } from '../../src/components/forms';
import { Badge, Button, Centered, ErrorBlock } from '../../src/components/ui';
import { useTheme } from '../../src/theme';

function Pieces() {
  const { colors, radius } = useTheme();
  const [state, setState] = useState({ status: 'loading', products: [], options: null, error: null });

  const load = useCallback(async () => {
    try {
      // The size list only improves the stock labels, so its failure must not block the page.
      const [products, options] = await Promise.all([admin.listAdminProducts(), getCatalogueOptions().catch(() => null)]);
      setState({ status: 'ready', products, options, error: null });
    } catch (error) {
      setState({ status: 'error', products: [], options: null, error });
    }
  }, []);
  useEffect(() => { load(); }, [load]);

  if (state.status === 'loading') return <Centered><Text style={{ color: colors.muted }}>Loading your pieces…</Text></Centered>;
  if (state.status === 'error') return <ErrorBlock error={state.error} onRetry={load} />;

  return (
    <FlatList
      style={{ backgroundColor: colors.bg }}
      contentContainerStyle={{ padding: 16, gap: 10, flexGrow: 1 }}
      data={state.products}
      keyExtractor={(p) => p.id}
      ListHeaderComponent={<Button label="Add a piece" onPress={() => router.push('/admin/product/new')} style={{ marginBottom: 6 }} />}
      ListEmptyComponent={<Text style={{ color: colors.muted, textAlign: 'center', marginTop: 30 }}>No pieces yet. Add your first piece to start selling.</Text>}
      renderItem={({ item }) => (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={item.name}
          onPress={() => router.push(`/admin/product/${encodeURIComponent(item.id)}`)}
          style={{ backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1, borderRadius: radius, padding: 12, gap: 4 }}
        >
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <Text style={{ color: colors.text, fontWeight: '700', flex: 1 }}>{item.name}</Text>
            <Badge text={item.is_active ? 'Visible' : 'Hidden'} tone={item.is_active ? 'success' : 'neutral'} />
          </View>
          <Text style={{ color: colors.text }}>{formatNaira(item.price_kobo)}</Text>
          <Text style={{ color: colors.muted, fontSize: 12 }}>{stockSummary(item, state.options)}</Text>
        </Pressable>
      )}
    />
  );
}

export default function PiecesScreen() {
  return (
    <OwnerOnly>
      <Pieces />
    </OwnerOnly>
  );
}
