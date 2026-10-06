import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Alert, ScrollView, Text, View } from 'react-native';
import { emptyForm, formToPayload, productToForm } from '@isabella/core';
import { admin, getCatalogueOptions } from '../../../src/api/client';
import { Choice, Field, OwnerOnly, Section, Toggle } from '../../../src/components/forms';
import { PhotoManager } from '../../../src/components/PhotoManager';
import { Button, Centered, ErrorBlock } from '../../../src/components/ui';
import { useTheme } from '../../../src/theme';

/** Server validation details look like {field: "body.variants.0.size", message: "..."}. */
const detailLines = (error) =>
  Array.isArray(error?.details) ? error.details.map((d) => `${String(d.field).replace(/^body\./, '')}: ${d.message}`) : [];

function Editor({ options, loaded, isNew }) {
  const { colors } = useTheme();
  const [form, setForm] = useState(() => (isNew ? emptyForm(options) : productToForm(loaded, options)));
  const [product, setProduct] = useState(loaded);
  const [errors, setErrors] = useState({});
  const [alert, setAlert] = useState(null); // { message, lines }
  const [status, setStatus] = useState('');
  const [saving, setSaving] = useState(false);
  const perSize = form.pricingMode === 'per_size';

  const set = (patch) => setForm((f) => ({ ...f, ...patch }));
  const setSize = (size, patch) => setForm((f) => ({ ...f, sizes: { ...f.sizes, [size]: { ...f.sizes[size], ...patch } } }));
  const setMeasure = (size, part, text) =>
    setForm((f) => ({ ...f, sizes: { ...f.sizes, [size]: { ...f.sizes[size], measurements: { ...f.sizes[size].measurements, [part]: text } } } }));

  const save = async () => {
    if (saving) return; // ignore a second tap while the first save is still running
    setAlert(null);
    setStatus('');
    const result = formToPayload(form, options);
    setErrors(result.ok ? {} : result.errors);
    if (!result.ok) return;
    setSaving(true);
    try {
      if (isNew) {
        const created = await admin.createProduct(result.value);
        router.replace(`/admin/product/${created.id}`); // photos can only be added once the piece exists
        return;
      }
      // One request saves details, pricing and sizes together, so a failure can never leave the
      // piece half-updated.
      setProduct(await admin.saveProduct(product.id, result.value));
      setStatus('Saved ✓');
    } catch (error) {
      setAlert({ message: error?.message ?? 'Something went wrong. Please try again.', lines: detailLines(error) });
    } finally {
      setSaving(false);
    }
  };

  const confirmDelete = () =>
    Alert.alert(`Delete "${product.name}"?`, 'This also removes its photos and cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            await admin.deleteProduct(product.id);
            router.replace('/admin/products');
          } catch (error) {
            setAlert({ message: error?.message ?? 'Could not delete that piece.', lines: [] });
          }
        },
      },
    ]);

  return (
    <ScrollView style={{ backgroundColor: colors.bg }} contentContainerStyle={{ padding: 16, gap: 14, paddingBottom: 60 }} keyboardShouldPersistTaps="handled">
      <Text style={{ color: colors.text, fontSize: 22, fontWeight: '800' }}>{isNew ? 'New piece' : `Edit: ${product.name}`}</Text>

      {alert ? (
        <View accessibilityRole="alert" style={{ borderColor: colors.danger, borderWidth: 1, borderRadius: 4, padding: 10, gap: 4 }}>
          <Text style={{ color: colors.danger }}>{alert.message}</Text>
          {alert.lines.map((line) => <Text key={line} style={{ color: colors.danger, fontSize: 12 }}>{line}</Text>)}
        </View>
      ) : null}

      <Section>
        <Field label="Name" value={form.name} onChangeText={(name) => set({ name })} error={errors.name} maxLength={200} />
        <Field label="Description (optional)" value={form.description} onChangeText={(description) => set({ description })} multiline hint="Fabric, fit, care." />
        <Toggle label="Visible in the shop" value={form.isActive} onValueChange={(isActive) => set({ isActive })} />
      </Section>

      <Section title="Pricing">
        <Choice
          value={form.pricingMode}
          onChange={(pricingMode) => set({ pricingMode })}
          options={[{ value: 'single', label: 'One price' }, { value: 'per_size', label: 'Price per size' }]}
        />
        {!perSize ? <Field label="Price (₦)" value={form.price} onChangeText={(price) => set({ price })} keyboardType="decimal-pad" error={errors.price} /> : null}
        <Field
          label="Limit per order (optional)"
          value={form.maxPerOrder}
          onChangeText={(maxPerOrder) => set({ maxPerOrder })}
          keyboardType="number-pad"
          error={errors.maxPerOrder}
          hint="Most of this piece one order may contain. Blank = no limit; 1 for a one-of-a-kind find."
        />
      </Section>

      <Section title="Sizes, stock and measurements">
        {errors.sizes ? <Text accessibilityRole="alert" style={{ color: colors.danger }}>{errors.sizes}</Text> : null}
        {options.sizes.map(({ value: size, label }) => {
          const row = form.sizes[size];
          return (
            <View key={size} style={{ gap: 8, borderTopColor: colors.border, borderTopWidth: 1, paddingTop: 10 }}>
              <Toggle label={label} value={row.enabled} onValueChange={(enabled) => setSize(size, { enabled })} />
              {row.enabled ? (
                <View style={{ gap: 8 }}>
                  <Field label={`${label} stock`} value={row.stock} onChangeText={(stock) => setSize(size, { stock })} keyboardType="number-pad" error={errors[`size.${size}.stock`]} />
                  {perSize ? <Field label={`${label} price (₦)`} value={row.price} onChangeText={(price) => setSize(size, { price })} keyboardType="decimal-pad" error={errors[`size.${size}.price`]} /> : null}
                  {options.measurement_parts.map((part) => (
                    <Field
                      key={part.value}
                      label={`${label} ${part.label} (${options.unit})`}
                      value={row.measurements[part.value] ?? ''}
                      onChangeText={(text) => setMeasure(size, part.value, text)}
                      keyboardType="decimal-pad"
                      error={errors[`size.${size}.${part.value}`]}
                    />
                  ))}
                </View>
              ) : null}
            </View>
          );
        })}
      </Section>

      <Button label={saving ? 'Saving…' : 'Save piece'} onPress={save} disabled={saving} />
      {status ? <Text accessibilityRole="alert" style={{ color: colors.success, fontWeight: '600' }}>{status}</Text> : null}

      {isNew ? (
        <Text style={{ color: colors.muted }}>Save the piece first, then you can add its photos.</Text>
      ) : (
        <>
          <PhotoManager product={product} rules={options.images ?? null} onChange={setProduct} />
          <Button label="Delete this piece" outline onPress={confirmDelete} style={{ borderColor: colors.danger }} />
        </>
      )}
    </ScrollView>
  );
}

function Loader() {
  const { id } = useLocalSearchParams();
  const isNew = id === 'new';
  const { colors } = useTheme();
  const [state, setState] = useState({ status: 'loading', options: null, product: null, error: null });

  const load = useCallback(async () => {
    setState((s) => ({ ...s, status: 'loading' }));
    try {
      // Here the size list is REQUIRED: without it there is no form to show.
      const [options, product] = await Promise.all([getCatalogueOptions(), isNew ? null : admin.getAdminProduct(id)]);
      setState({ status: 'ready', options, product, error: null });
    } catch (error) {
      setState({ status: 'error', options: null, product: null, error });
    }
  }, [id, isNew]);
  useEffect(() => { load(); }, [load]);

  if (state.status === 'loading') return <Centered><Text style={{ color: colors.muted }}>Loading…</Text></Centered>;
  if (state.status === 'error') {
    if (state.error?.code === 'not_found') {
      return (
        <Centered>
          <Text style={{ color: colors.text, fontSize: 20, fontWeight: '700' }}>Piece not found</Text>
          <Text style={{ color: colors.muted }}>This piece could not be found. It may have been deleted.</Text>
          <Button label="Back to your pieces" onPress={() => router.replace('/admin/products')} />
        </Centered>
      );
    }
    return <ErrorBlock error={state.error} onRetry={load} />;
  }
  return <Editor key={id} options={state.options} loaded={state.product} isNew={isNew} />;
}

export default function ProductEditScreen() {
  return (
    <OwnerOnly>
      <Loader />
    </OwnerOnly>
  );
}
