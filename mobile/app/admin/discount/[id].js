import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { discountToForm, emptyDiscountForm, formToDiscountPayload } from '@isabella/core';
import { admin } from '../../../src/api/client';
import { Choice, DateTimeField, Field, OwnerOnly, Section, Toggle } from '../../../src/components/forms';
import { Button, Centered, ErrorBlock } from '../../../src/components/ui';
import { useTheme } from '../../../src/theme';

function Editor({ editing, pieces }) {
  const { colors } = useTheme();
  const tz = new Date().getTimezoneOffset();
  const [form, setForm] = useState(() => (editing ? discountToForm(editing, tz) : emptyDiscountForm(Date.now(), tz)));
  const [errors, setErrors] = useState({});
  const [message, setMessage] = useState('');
  const [saving, setSaving] = useState(false);
  const set = (patch) => setForm((f) => ({ ...f, ...patch }));

  const toggleProduct = (id) =>
    set({ productIds: form.productIds.includes(id) ? form.productIds.filter((p) => p !== id) : [...form.productIds, id] });

  const save = async () => {
    if (saving) return;
    setMessage('');
    const result = formToDiscountPayload(form, tz);
    setErrors(result.ok ? {} : result.errors);
    if (!result.ok) return;
    setSaving(true);
    try {
      await (editing ? admin.replaceDiscount(editing.id, result.value) : admin.createDiscount(result.value));
      router.replace('/admin/discounts');
    } catch (error) {
      setMessage(error?.message ?? 'Something went wrong. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <ScrollView style={{ backgroundColor: colors.bg }} contentContainerStyle={{ padding: 16, gap: 14, paddingBottom: 60 }} keyboardShouldPersistTaps="handled">
      <Text style={{ color: colors.text, fontSize: 22, fontWeight: '800' }}>{editing ? 'Edit discount' : 'New discount'}</Text>
      {message ? <Text accessibilityRole="alert" style={{ color: colors.danger }}>{message}</Text> : null}

      <Section>
        <Field label="Name (customers see this)" value={form.name} onChangeText={(name) => set({ name })} error={errors.name} maxLength={100} />
        <Choice value={form.kind} onChange={(kind) => set({ kind, value: '' })} options={[{ value: 'percent', label: 'Percentage off' }, { value: 'amount', label: 'Amount off' }]} />
        <Field
          label={form.kind === 'percent' ? 'Percent off' : 'Amount off (₦)'}
          value={form.value}
          onChangeText={(value) => set({ value })}
          keyboardType="decimal-pad"
          error={errors.value}
        />
      </Section>

      <Section title="Applies to">
        <Choice value={form.scope} onChange={(scope) => set({ scope })} options={[{ value: 'all', label: 'Every piece' }, { value: 'selected', label: 'Chosen pieces' }]} />
        {form.scope === 'selected' ? (
          <View style={{ gap: 6 }}>
            {pieces.map((p) => {
              const on = form.productIds.includes(p.id);
              return (
                <Pressable key={p.id} accessibilityRole="checkbox" accessibilityState={{ checked: on }} accessibilityLabel={p.name} onPress={() => toggleProduct(p.id)} style={{ flexDirection: 'row', gap: 10, alignItems: 'center', paddingVertical: 4 }}>
                  <Text style={{ color: colors.accent, fontSize: 18 }}>{on ? '☑' : '☐'}</Text>
                  <Text style={{ color: colors.text }}>{p.name}</Text>
                </Pressable>
              );
            })}
            {errors.products ? <Text accessibilityRole="alert" style={{ color: colors.danger }}>{errors.products}</Text> : null}
          </View>
        ) : null}
      </Section>

      <Section title="Schedule">
        <DateTimeField label="Starts" value={form.startsAt} onChange={(startsAt) => set({ startsAt })} error={errors.startsAt} />
        <DateTimeField label="Ends" value={form.endsAt} onChange={(endsAt) => set({ endsAt })} error={errors.endsAt} />
        <Toggle label="Enabled" value={form.isEnabled} onValueChange={(isEnabled) => set({ isEnabled })} />
      </Section>

      <Button label={saving ? 'Saving…' : 'Save discount'} onPress={save} disabled={saving} />
    </ScrollView>
  );
}

function Loader() {
  const { id } = useLocalSearchParams();
  const isNew = id === 'new';
  const { colors } = useTheme();
  const [state, setState] = useState({ status: 'loading', editing: null, pieces: [], error: null });

  const load = useCallback(async () => {
    setState((s) => ({ ...s, status: 'loading' }));
    try {
      const [discounts, pieces] = await Promise.all([admin.listDiscounts(), admin.listAdminProducts()]);
      const editing = isNew ? null : discounts.find((d) => d.id === id) ?? null;
      if (!isNew && !editing) throw { status: 404, code: 'not_found', message: 'Discount not found' };
      setState({ status: 'ready', editing, pieces, error: null });
    } catch (error) {
      setState({ status: 'error', editing: null, pieces: [], error });
    }
  }, [id, isNew]);
  useEffect(() => { load(); }, [load]);

  if (state.status === 'loading') return <Centered><Text style={{ color: colors.muted }}>Loading…</Text></Centered>;
  if (state.status === 'error') return <ErrorBlock error={state.error} onRetry={load} />;
  return <Editor key={id} editing={state.editing} pieces={state.pieces} />;
}

export default function DiscountEditScreen() {
  return (
    <OwnerOnly>
      <Loader />
    </OwnerOnly>
  );
}
