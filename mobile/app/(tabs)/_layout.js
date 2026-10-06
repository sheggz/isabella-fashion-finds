import { Ionicons } from '@expo/vector-icons';
import { Tabs } from 'expo-router';
import { cartState } from '../../src/state/cart';
import { useTheme } from '../../src/theme';
import { useSession } from '../../src/useSession';
import { useStoreValue } from '../../src/useStoreValue';

const icon = (name) => ({ color, size }) => <Ionicons name={name} size={size} color={color} />;

export default function TabsLayout() {
  const { colors } = useTheme();
  const count = useStoreValue(cartState.store).data?.item_count ?? 0;
  const isOwner = useSession().user?.role === 'owner';
  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: colors.accent,
        tabBarInactiveTintColor: colors.muted,
        tabBarStyle: { backgroundColor: colors.surface, borderTopColor: colors.border },
        headerStyle: { backgroundColor: colors.surface },
        headerTintColor: colors.text,
        headerTitleStyle: { fontWeight: '800' },
      }}
    >
      <Tabs.Screen name="index" options={{ title: 'Shop', tabBarIcon: icon('storefront-outline') }} />
      <Tabs.Screen name="cart" options={{ title: 'Cart', tabBarIcon: icon('bag-outline'), tabBarBadge: count > 0 ? count : undefined }} />
      <Tabs.Screen name="orders" options={{ title: 'Orders', tabBarIcon: icon('receipt-outline') }} />
      {/* The owner's tab only exists for the owner (href: null hides it). The server still enforces the role. */}
      <Tabs.Screen name="manage" options={{ title: 'Manage', tabBarIcon: icon('construct-outline'), href: isOwner ? '/manage' : null }} />
      <Tabs.Screen name="account" options={{ title: 'Account', tabBarIcon: icon('person-outline') }} />
    </Tabs>
  );
}
