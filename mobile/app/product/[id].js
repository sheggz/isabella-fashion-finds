import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Dimensions, Pressable, ScrollView, Text, View } from 'react-native';
import {
  addToCartState, discountNote, formatMeasurements, isSoldOut, percentOff, priceDisplay, sizeLabel,
  sortedImages, sortVariants, variantPriceDisplay,
} from '@isabella/core';
import { getCatalogueOptions, getProduct } from '../../src/api/client';
import { Badge, Button, Centered, ErrorBlock, Photo, Price } from '../../src/components/ui';
import { cartState } from '../../src/state/cart';
import { useTheme } from '../../src/theme';
import { useSession } from '../../src/useSession';

const LOW_STOCK = 3;
const { width: SCREEN_WIDTH } = Dimensions.get('window');

function Gallery({ product }) {
  const { colors } = useTheme();
  const images = sortedImages(product);
  const [index, setIndex] = useState(0);
  if (images.length === 0) return <Photo uri={null} ratio={3 / 4} style={{ borderRadius: 0 }} />;
  return (
    <View>
      <ScrollView
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={(e) => setIndex(Math.round(e.nativeEvent.contentOffset.x / SCREEN_WIDTH))}
      >
        {images.map((image) => (
          <Photo key={image.id} uri={image.url} style={{ width: SCREEN_WIDTH, borderRadius: 0 }} />
        ))}
      </ScrollView>
      {images.length > 1 ? (
        <View style={{ position: 'absolute', bottom: 10, right: 10, backgroundColor: colors.heroOverlay, borderRadius: 10, paddingHorizontal: 8, paddingVertical: 2 }}>
          <Text style={{ color: colors.onImage, fontSize: 12 }}>{index + 1} / {images.length}</Text>
        </View>
      ) : null}
    </View>
  );
}

function SizeChips({ variants, options, selected, onSelect }) {
  const { colors, radius } = useTheme();
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
      {variants.map((variant) => {
        const out = variant.stock <= 0;
        const active = variant.size === selected;
        return (
          <Pressable
            key={variant.size}
            accessibilityRole="button"
            accessibilityState={{ selected: active, disabled: out }}
            disabled={out}
            onPress={() => onSelect(variant.size)}
            style={{
              borderWidth: 1.5, borderColor: active ? colors.accent : colors.border, borderRadius: radius,
              backgroundColor: active ? colors.accent : 'transparent', paddingVertical: 10, paddingHorizontal: 16, opacity: out ? 0.4 : 1,
            }}
          >
            <Text style={{ color: active ? colors.accentText : colors.text, fontWeight: '600' }}>
              {sizeLabel(options, variant.size)}
              {out ? ' · Sold out' : ''}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

function AddToCart({ product, variant, ceiling }) {
  const { colors } = useTheme();
  const { status } = useSession();
  const [quantity, setQuantity] = useState(1);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState(null); // { kind: 'ok' | 'error', text }

  const state = addToCartState({
    signedIn: status === 'loading' ? null : status === 'signedIn',
    product, variant, ceiling, soldOut: isSoldOut(product),
  });

  useEffect(() => {
    setMessage(null);
  }, [variant?.size]);

  if (state.kind === 'wait') return null;
  if (state.kind === 'signin') return <Button label="Sign in to add to cart" onPress={() => router.navigate('/account')} />;
  if (state.kind !== 'ready') return <Button label={state.kind === 'sold_out' ? 'Sold out' : 'Choose a size'} disabled />;

  const qty = Math.min(Math.max(quantity, 1), state.max);
  const add = async () => {
    if (busy) return; // ignore a second tap while the first is still being added
    setBusy(true);
    setMessage(null);
    try {
      await cartState.addItem(variant.id, qty);
      setMessage({ kind: 'ok', text: 'Added to your cart ✓' });
      setQuantity(1);
    } catch (error) {
      setMessage({ kind: 'error', text: error?.message ?? 'Could not add that to your cart.' });
    } finally {
      setBusy(false);
    }
  };

  const stepBtn = { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' };
  return (
    <View style={{ gap: 12 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: colors.border, borderRadius: 4 }}>
          <Pressable accessibilityLabel="Decrease quantity" style={stepBtn} disabled={qty <= 1} onPress={() => setQuantity(qty - 1)}>
            <Text style={{ color: colors.text, fontSize: 20, opacity: qty <= 1 ? 0.3 : 1 }}>−</Text>
          </Pressable>
          <Text accessibilityLabel="Quantity" style={{ color: colors.text, minWidth: 28, textAlign: 'center', fontWeight: '700' }}>{qty}</Text>
          <Pressable accessibilityLabel="Increase quantity" style={stepBtn} disabled={qty >= state.max} onPress={() => setQuantity(qty + 1)}>
            <Text style={{ color: colors.text, fontSize: 20, opacity: qty >= state.max ? 0.3 : 1 }}>+</Text>
          </Pressable>
        </View>
        <Button label={busy ? 'Adding…' : 'Add to cart'} onPress={add} disabled={busy} style={{ flex: 1 }} />
      </View>
      {product.max_per_order ? <Text style={{ color: colors.muted }}>Limited to {product.max_per_order} per order</Text> : null}
      {message?.kind === 'ok' ? (
        <Pressable onPress={() => router.navigate('/cart')}>
          <Text style={{ color: colors.success, fontWeight: '600' }}>{message.text} View cart</Text>
        </Pressable>
      ) : null}
      {message?.kind === 'error' ? <Text accessibilityRole="alert" style={{ color: colors.danger }}>{message.text}</Text> : null}
    </View>
  );
}

export default function ProductScreen() {
  const { id } = useLocalSearchParams();
  const { colors } = useTheme();
  const [state, setState] = useState({ status: 'loading', product: null, options: null, error: null });
  const [selected, setSelected] = useState(null);

  const load = useCallback(async () => {
    setState((s) => ({ ...s, status: 'loading' }));
    try {
      // The size list only improves labels and ordering, so its failure must not hide the piece.
      const [product, options] = await Promise.all([getProduct(id), getCatalogueOptions().catch(() => null)]);
      setSelected(sortVariants(product.variants, options).find((v) => v.stock > 0)?.size ?? null);
      setState({ status: 'ready', product, options, error: null });
    } catch (error) {
      setState({ status: 'error', product: null, options: null, error });
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  if (state.status === 'loading') {
    return (
      <Centered>
        <ActivityIndicator color={colors.accent} />
      </Centered>
    );
  }
  if (state.status === 'error') {
    if (state.error?.code === 'not_found') {
      return (
        <Centered>
          <Text style={{ color: colors.text, fontSize: 20, fontWeight: '700' }}>Piece not found</Text>
          <Text style={{ color: colors.muted }}>This piece could not be found. It may have been removed.</Text>
          <Button label="Back to the shop" onPress={() => router.navigate('/')} />
        </Centered>
      );
    }
    return <ErrorBlock error={state.error} onRetry={load} />;
  }

  const { product, options } = state;
  const variants = sortVariants(product.variants, options);
  const variant = variants.find((v) => v.size === selected) ?? null;
  // The price follows the chosen size (sizes can be priced separately) and shows a live sale.
  const display = variant ? { prefix: '', ...variantPriceDisplay(variant) } : priceDisplay(product);
  const off = display.original === null ? 0 : percentOff(display.original, display.current);
  const rows = variant ? formatMeasurements(variant.measurements, options) : [];

  return (
    <ScrollView style={{ backgroundColor: colors.bg }} contentContainerStyle={{ paddingBottom: 40 }}>
      <Gallery product={product} />
      <View style={{ padding: 16, gap: 14 }}>
        <Text style={{ color: colors.text, fontSize: 24, fontWeight: '800' }}>{product.name}</Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <Price display={display} size={20} />
          {off > 0 ? <Badge text={`-${off}%`} tone="sale" /> : null}
          {isSoldOut(product) ? <Badge text="Sold out" /> : null}
        </View>
        {product.discount ? <Text style={{ color: colors.accent, fontWeight: '600' }}>{discountNote(product.discount, new Date().getTimezoneOffset())}</Text> : null}
        {product.description ? <Text style={{ color: colors.text, lineHeight: 22 }}>{product.description}</Text> : null}

        <Text style={{ color: colors.text, fontWeight: '700', marginTop: 4 }}>Size</Text>
        <SizeChips variants={variants} options={options} selected={selected} onSelect={setSelected} />
        {variant && variant.stock <= LOW_STOCK ? <Text style={{ color: colors.danger, fontWeight: '600' }}>Only {variant.stock} left</Text> : null}

        {variant ? (
          <View style={{ backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1, borderRadius: 4, padding: 12 }}>
            <Text style={{ color: colors.text, fontWeight: '700', marginBottom: 6 }}>Measurements for {sizeLabel(options, variant.size)}</Text>
            {rows.length ? (
              rows.map((r) => (
                <View key={r.label} style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 3 }}>
                  <Text style={{ color: colors.muted }}>{r.label}</Text>
                  <Text style={{ color: colors.text }}>{r.text}</Text>
                </View>
              ))
            ) : (
              <Text style={{ color: colors.muted }}>No measurements provided for this size.</Text>
            )}
          </View>
        ) : null}

        <AddToCart product={product} variant={variant} ceiling={options?.cart?.max_per_line} />
      </View>
    </ScrollView>
  );
}
