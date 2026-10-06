import { router } from 'expo-router';
import { Pressable, Text, View } from 'react-native';
import { coverImage, isSoldOut, percentOff, priceDisplay } from '@isabella/core';
import { useTheme } from '../theme';
import { Badge, Photo, Price } from './ui';

/** One product tile for the shop grid: photo with badges, name, price. Opens the product page. */
export function ProductCard({ product }) {
  const { colors } = useTheme();
  const display = priceDisplay(product);
  const off = display.original === null ? 0 : percentOff(display.original, display.current);
  const soldOut = isSoldOut(product);

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={product.name}
      onPress={() => router.push(`/product/${encodeURIComponent(product.id)}`)}
      style={({ pressed }) => ({ flex: 1, opacity: pressed ? 0.85 : 1 })}
    >
      <View>
        <Photo uri={coverImage(product)?.url} />
        <View style={{ position: 'absolute', top: 8, left: 8, right: 8, flexDirection: 'row', justifyContent: 'space-between' }}>
          {soldOut ? <Badge text="Sold out" /> : <View />}
          {off > 0 ? <Badge text={`-${off}%`} tone="sale" /> : null}
        </View>
      </View>
      <Text numberOfLines={2} style={{ color: colors.text, fontWeight: '600', marginTop: 8 }}>
        {product.name}
      </Text>
      <Price display={display} />
    </Pressable>
  );
}
