import { router } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Alert, FlatList, Pressable, Text, View } from 'react-native';
import { appliesText, describeDiscount, scheduleText, STATUS_LABELS } from '@isabella/core';
import { admin } from '../../src/api/client';
import { OwnerOnly } from '../../src/components/forms';
import { Badge, Button, Centered, ErrorBlock } from '../../src/components/ui';
import { useTheme } from '../../src/theme';

const TONE = { live: 'success', scheduled: 'warning', ended: 'neutral', disabled: 'neutral' };

function Discounts() {
  const { colors, radius } = useTheme();
  const [state, setState] = useState({ status: 'loading', discounts: [], error: null });
  const [message, setMessage] = useState('');

  const load = useCallback(async () => {
    try {
      setState({ status: 'ready', discounts: await admin.listDiscounts(), error: null });
    } catch (error) {
      setState({ status: 'error', discounts: [], error });
    }
  }, []);
  useEffect(() => { load(); }, [load]);

  const confirmDelete = (d) =>
    Alert.alert(`Delete "${d.name}"?`, 'Prices go back to normal straight away.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            await admin.deleteDiscount(d.id);
            await load();
          } catch (error) {
            setMessage(error?.message ?? 'Could not delete that discount.');
          }
        },
      },
    ]);

  if (state.status === 'loading') return <Centered><Text style={{ color: colors.muted }}>Loading discounts…</Text></Centered>;
  if (state.status === 'error') return <ErrorBlock error={state.error} onRetry={load} />;

  const tz = new Date().getTimezoneOffset();
  return (
    <FlatList
      style={{ backgroundColor: colors.bg }}
      contentContainerStyle={{ padding: 16, gap: 10, flexGrow: 1 }}
      data={state.discounts}
      keyExtractor={(d) => d.id}
      ListHeaderComponent={
        <View style={{ gap: 8, marginBottom: 6 }}>
          <Button label="New discount" onPress={() => router.push('/admin/discount/new')} />
          {message ? <Text accessibilityRole="alert" style={{ color: colors.danger }}>{message}</Text> : null}
        </View>
      }
      ListEmptyComponent={<Text style={{ color: colors.muted, textAlign: 'center', marginTop: 30 }}>No discounts yet.</Text>}
      renderItem={({ item: d }) => (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={d.name}
          onPress={() => router.push(`/admin/discount/${encodeURIComponent(d.id)}`)}
          style={{ backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1, borderRadius: radius, padding: 12, gap: 4 }}
        >
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <Text style={{ color: colors.text, fontWeight: '700', flex: 1 }}>{d.name}</Text>
            <Badge text={STATUS_LABELS[d.status] ?? d.status} tone={TONE[d.status] ?? 'neutral'} />
          </View>
          <Text style={{ color: colors.text }}>{describeDiscount(d)} · {appliesText(d)}</Text>
          <Text style={{ color: colors.muted, fontSize: 12 }}>{scheduleText(d, tz)}</Text>
          <Pressable accessibilityRole="button" onPress={() => confirmDelete(d)}>
            <Text style={{ color: colors.danger, fontWeight: '600', marginTop: 4 }}>Delete</Text>
          </Pressable>
        </Pressable>
      )}
    />
  );
}

export default function DiscountsScreen() {
  return (
    <OwnerOnly>
      <Discounts />
    </OwnerOnly>
  );
}
