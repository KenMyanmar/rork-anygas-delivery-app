import React, { useRef, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Animated,
  Platform,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { Flame, MapPin, ChevronRight, Package, Clock, Truck, RefreshCw } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import Colors from '@/constants/colors';
import { useAuth } from '@/providers/AuthProvider';
import { useOrders } from '@/providers/OrderProvider';
import { supabase } from '@/lib/supabase';
import { OrderStatus } from '@/types';

interface SupabaseBrand {
  id: string;
  name: string;
  logo_url: string | null;
  sort_order: number | null;
}

const BRAND_COLORS: Record<string, string> = {
  'Parami': '#DC2626',
  'Easy': '#2563EB',
  'World': '#059669',
};

function getBrandColor(name: string): string {
  for (const [key, color] of Object.entries(BRAND_COLORS)) {
    if (name.toLowerCase().includes(key.toLowerCase())) return color;
  }
  return Colors.primary;
}

function getCustomerStatusLabel(status: OrderStatus): string {
  switch (status) {
    case 'new': return 'Placed';
    case 'confirmed':
    case 'dispatched': return 'On the Way';
    case 'delivered': return 'Delivered';
    case 'cancelled':
    case 'failed': return 'Cancelled';
    default: return String(status);
  }
}

function getStatusColor(status: OrderStatus) {
  switch (status) {
    case 'new': return Colors.warning;
    case 'confirmed':
    case 'dispatched': return Colors.primary;
    case 'delivered': return Colors.success;
    case 'cancelled':
    case 'failed': return Colors.error;
    default: return Colors.textTertiary;
  }
}

export default function HomeScreen() {
  const { activeCustomer, activeProfile, getDefaultAddress } = useAuth();
  const { getLastOrder, getActiveOrder } = useOrders();
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const fadeAnim = useRef(new Animated.Value(0)).current;

  const defaultAddress = getDefaultAddress();
  const lastOrder = getLastOrder();
  const activeOrder = getActiveOrder();

  const brandsQuery = useQuery({
    queryKey: ['brands'],
    queryFn: async () => {
      console.log('[Home] Fetching brands from Supabase');
      const { data, error } = await supabase
        .from('brands')
        .select('id, name, logo_url, sort_order')
        .eq('is_active', true)
        .order('sort_order');

      if (error) {
        console.log('[Home] Brands fetch error:', error.message);
        return [];
      }
      return (data || []) as SupabaseBrand[];
    },
  });

  useEffect(() => {
    Animated.timing(fadeAnim, { toValue: 1, duration: 600, useNativeDriver: true }).start();
    const pulse = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1.04, duration: 1500, useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 1, duration: 1500, useNativeDriver: true }),
      ])
    );
    pulse.start();
    return () => pulse.stop();
  }, []);

  const handleOrderNow = useCallback(() => {
    if (Platform.OS !== 'web') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    }
    router.push('/(tabs)/(home)/order');
  }, []);

  const handleReorder = useCallback(() => {
    if (Platform.OS !== 'web') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    }
    router.push({
      pathname: '/(tabs)/(home)/order',
      params: lastOrder ? {
        reorderBrand: lastOrder.brandId,
        reorderSize: String(lastOrder.cylinderSize),
        reorderType: lastOrder.orderType,
      } : {},
    });
  }, [lastOrder]);

  const handleTrackOrder = useCallback(() => {
    if (activeOrder) {
      router.push('/(tabs)/(home)/tracking');
    }
  }, [activeOrder]);

  return (
    <View style={styles.container}>
      <StatusBar style="dark" />
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          <Animated.View style={{ opacity: fadeAnim }}>
            <View style={styles.header}>
              <View style={styles.headerLeft}>
                <View style={styles.logoRow}>
                  <View style={styles.miniLogo}>
                    <Flame size={20} color={Colors.primary} strokeWidth={2.5} />
                  </View>
                  <Text style={styles.appName}>AnyGas 8484</Text>
                </View>
                <Text style={styles.greeting}>
                  {activeCustomer ? `Hi, ${activeCustomer.full_name || activeCustomer.name}` : 'Welcome'}
                </Text>
              </View>
            </View>

            {defaultAddress && (
              <TouchableOpacity style={styles.addressBar} activeOpacity={0.7}>
                <MapPin size={16} color={Colors.primary} />
                <View style={styles.addressContent}>
                  <Text style={styles.addressLabel}>{defaultAddress.label}</Text>
                  <Text style={styles.addressText} numberOfLines={1}>
                    {defaultAddress.address}
                  </Text>
                </View>
                <ChevronRight size={16} color={Colors.textTertiary} />
              </TouchableOpacity>
            )}

            {activeOrder && (
              <TouchableOpacity
                style={styles.activeOrderCard}
                onPress={handleTrackOrder}
                activeOpacity={0.8}
              >
                <View style={styles.activeOrderHeader}>
                  <Truck size={18} color={Colors.primary} />
                  <Text style={styles.activeOrderTitle}>Active Order</Text>
                  <View style={[styles.statusDot, { backgroundColor: getStatusColor(activeOrder.status) }]} />
                  <Text style={[styles.activeOrderStatus, { color: getStatusColor(activeOrder.status) }]}>
                    {getCustomerStatusLabel(activeOrder.status)}
                  </Text>
                </View>
                <View style={styles.activeOrderDetails}>
                  <Text style={styles.activeOrderBrand}>
                    {activeOrder.brandName || 'Gas'} {activeOrder.cylinderSize}kg
                  </Text>
                  {activeOrder.estimatedDelivery && (
                    <View style={styles.etaRow}>
                      <Clock size={13} color={Colors.textSecondary} />
                      <Text style={styles.etaText}>ETA: {activeOrder.estimatedDelivery}</Text>
                    </View>
                  )}
                </View>
                <View style={styles.trackButton}>
                  <Text style={styles.trackButtonText}>Track Order</Text>
                  <ChevronRight size={16} color={Colors.primary} />
                </View>
              </TouchableOpacity>
            )}

            <Animated.View style={{ transform: [{ scale: pulseAnim }] }}>
              <TouchableOpacity
                style={styles.heroButton}
                onPress={handleOrderNow}
                activeOpacity={0.85}
                testID="order-gas-button"
              >
                <View style={styles.heroIconWrap}>
                  <Flame size={36} color="#FFFFFF" strokeWidth={2} />
                </View>
                <Text style={styles.heroTitle}>ORDER GAS NOW</Text>
                <Text style={styles.heroTitleMM}>ဂက်စ်မှာမယ်</Text>
                <Text style={styles.heroSubtitle}>Fast delivery to your door</Text>
              </TouchableOpacity>
            </Animated.View>

            {lastOrder && (
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>Quick Reorder</Text>
                <Text style={styles.sectionTitleMM}>ပြန်မှာမယ်</Text>
                <TouchableOpacity
                  style={styles.reorderCard}
                  onPress={handleReorder}
                  activeOpacity={0.8}
                  testID="reorder-button"
                >
                  <View style={styles.reorderLeft}>
                    <View style={[styles.brandDot, { backgroundColor: Colors.primary }]} />
                    <View>
                      <Text style={styles.reorderBrand}>
                        {lastOrder.brandName || 'Gas'}
                      </Text>
                      <Text style={styles.reorderDetails}>
                        {lastOrder.cylinderSize}kg • {lastOrder.orderType === 'refill' ? 'Refill' : lastOrder.orderType === 'new_setup' ? 'New Setup' : 'Exchange'}
                      </Text>
                      <Text style={styles.reorderPrice}>
                        {lastOrder.pricing.total.toLocaleString()} MMK
                      </Text>
                    </View>
                  </View>
                  <View style={styles.reorderButton}>
                    <RefreshCw size={18} color={Colors.primary} />
                    <Text style={styles.reorderButtonText}>Reorder</Text>
                  </View>
                </TouchableOpacity>
              </View>
            )}

            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Our Brands</Text>
              {brandsQuery.isLoading ? (
                <View style={styles.brandsLoading}>
                  <ActivityIndicator size="small" color={Colors.primary} />
                </View>
              ) : (
                <View style={styles.brandsRow}>
                  {(brandsQuery.data || []).map((brand) => {
                    const color = getBrandColor(brand.name);
                    return (
                      <TouchableOpacity
                        key={brand.id}
                        style={styles.brandCard}
                        onPress={handleOrderNow}
                        activeOpacity={0.7}
                      >
                        <View style={[styles.brandIcon, { backgroundColor: color + '15' }]}>
                          <Package size={24} color={color} />
                        </View>
                        <Text style={styles.brandName}>{brand.name}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              )}
            </View>

            <View style={{ height: 30 }} />
          </Animated.View>
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  safeArea: {
    flex: 1,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingTop: 8,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  headerLeft: {
    flex: 1,
  },
  logoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 4,
  },
  miniLogo: {
    width: 32,
    height: 32,
    borderRadius: 10,
    backgroundColor: Colors.primaryLight,
    justifyContent: 'center',
    alignItems: 'center',
  },
  appName: {
    fontSize: 18,
    fontWeight: '800' as const,
    color: Colors.textPrimary,
    letterSpacing: -0.3,
  },
  greeting: {
    fontSize: 14,
    color: Colors.textSecondary,
    marginTop: 2,
    marginLeft: 40,
  },
  addressBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surface,
    padding: 14,
    borderRadius: 14,
    marginBottom: 20,
    gap: 10,
    borderWidth: 1,
    borderColor: Colors.borderLight,
  },
  addressContent: {
    flex: 1,
  },
  addressLabel: {
    fontSize: 13,
    fontWeight: '700' as const,
    color: Colors.textPrimary,
  },
  addressText: {
    fontSize: 12,
    color: Colors.textSecondary,
    marginTop: 1,
  },
  activeOrderCard: {
    backgroundColor: Colors.primaryLight,
    borderRadius: 16,
    padding: 16,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: Colors.primary + '20',
  },
  activeOrderHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 10,
  },
  activeOrderTitle: {
    fontSize: 14,
    fontWeight: '700' as const,
    color: Colors.textPrimary,
    flex: 1,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  activeOrderStatus: {
    fontSize: 13,
    fontWeight: '600' as const,
  },
  activeOrderDetails: {
    marginBottom: 12,
  },
  activeOrderBrand: {
    fontSize: 16,
    fontWeight: '600' as const,
    color: Colors.textPrimary,
  },
  etaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 4,
  },
  etaText: {
    fontSize: 13,
    color: Colors.textSecondary,
    fontWeight: '500' as const,
  },
  trackButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.surface,
    paddingVertical: 10,
    borderRadius: 10,
    gap: 4,
  },
  trackButtonText: {
    fontSize: 14,
    fontWeight: '700' as const,
    color: Colors.primary,
  },
  heroButton: {
    backgroundColor: Colors.primary,
    borderRadius: 24,
    paddingVertical: 32,
    paddingHorizontal: 24,
    alignItems: 'center',
    marginBottom: 28,
    shadowColor: Colors.primary,
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.4,
    shadowRadius: 20,
    elevation: 12,
  },
  heroIconWrap: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: 'rgba(255,255,255,0.2)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  heroTitle: {
    fontSize: 24,
    fontWeight: '900' as const,
    color: '#FFFFFF',
    letterSpacing: 1,
  },
  heroTitleMM: {
    fontSize: 16,
    fontWeight: '600' as const,
    color: 'rgba(255,255,255,0.85)',
    marginTop: 4,
  },
  heroSubtitle: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.7)',
    marginTop: 6,
  },
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700' as const,
    color: Colors.textPrimary,
    marginBottom: 2,
  },
  sectionTitleMM: {
    fontSize: 13,
    color: Colors.textTertiary,
    marginBottom: 14,
  },
  reorderCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: Colors.surface,
    padding: 16,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Colors.borderLight,
  },
  reorderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
  },
  brandDot: {
    width: 40,
    height: 40,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  reorderBrand: {
    fontSize: 15,
    fontWeight: '700' as const,
    color: Colors.textPrimary,
  },
  reorderDetails: {
    fontSize: 13,
    color: Colors.textSecondary,
    marginTop: 2,
  },
  reorderPrice: {
    fontSize: 14,
    fontWeight: '700' as const,
    color: Colors.primary,
    marginTop: 2,
  },
  reorderButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: Colors.primaryLight,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 12,
  },
  reorderButtonText: {
    fontSize: 14,
    fontWeight: '700' as const,
    color: Colors.primary,
  },
  brandsLoading: {
    paddingVertical: 20,
    alignItems: 'center',
  },
  brandsRow: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 12,
  },
  brandCard: {
    flex: 1,
    backgroundColor: Colors.surface,
    borderRadius: 16,
    padding: 16,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: Colors.borderLight,
  },
  brandIcon: {
    width: 48,
    height: 48,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 10,
  },
  brandName: {
    fontSize: 12,
    fontWeight: '700' as const,
    color: Colors.textPrimary,
    textAlign: 'center' as const,
  },
});
