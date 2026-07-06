import React, { useState, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  FlatList,
} from 'react-native';
import { router } from 'expo-router';
import { Package, ChevronRight } from 'lucide-react-native';
import Colors from '@/constants/colors';
import { useOrders } from '@/providers/OrderProvider';
import { useI18n } from '@/providers/I18nProvider';
import { Order, OrderStatus } from '@/types';

type FilterKey = 'all' | 'active' | 'delivered' | 'cancelled';

const ACTIVE_STATUSES: OrderStatus[] = ['new', 'confirmed', 'in_progress', 'dispatched'];
const CANCELLED_STATUSES: OrderStatus[] = ['cancelled', 'failed'];

// 4-stage contract status labels. 'dispatched' is a dead stage in prod (zero rows)
// but retained for backward-compat — mapped to 'On the Way' = in_progress equivalent.
function getCustomerStatusLabel(status: OrderStatus, t: (k: any) => string): string {
  switch (status) {
    case 'new': return t('status_placed');
    case 'confirmed':
    case 'in_progress':
    case 'dispatched': return t('status_on_the_way');
    case 'delivered': return t('status_delivered');
    case 'cancelled': return t('status_cancelled');
    case 'failed': return t('status_failed');
    default: return String(status);
  }
}

function getCustomerStatusLabelMM(status: OrderStatus, tMM: (k: any) => string): string {
  switch (status) {
    case 'new': return tMM('status_placed');
    case 'confirmed':
    case 'in_progress':
    case 'dispatched': return tMM('status_on_the_way');
    case 'delivered': return tMM('status_delivered');
    case 'cancelled': return tMM('status_cancelled');
    case 'failed': return tMM('status_failed');
    default: return String(status);
  }
}

function getStatusColor(status: OrderStatus) {
  switch (status) {
    case 'new': return Colors.warning;
    case 'confirmed':
    case 'in_progress':
    case 'dispatched': return Colors.primary;
    case 'delivered': return Colors.success;
    case 'cancelled':
    case 'failed': return Colors.error;
    default: return Colors.textTertiary;
  }
}

function formatDate(dateStr: string) {
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export default function OrdersScreen() {
  const { orders } = useOrders();
  const { t, tMM } = useI18n();
  const [activeFilter, setActiveFilter] = useState<FilterKey>('all');

  const FILTER_OPTIONS: { key: FilterKey; label: string }[] = [
    { key: 'all', label: t('filter_all') },
    { key: 'active', label: t('filter_active') },
    { key: 'delivered', label: t('filter_delivered') },
    { key: 'cancelled', label: t('filter_cancelled') },
  ];

  const filteredOrders = useMemo(() => {
    if (activeFilter === 'all') return orders;
    if (activeFilter === 'active') return orders.filter(o => ACTIVE_STATUSES.includes(o.status));
    if (activeFilter === 'delivered') return orders.filter(o => o.status === 'delivered');
    if (activeFilter === 'cancelled') return orders.filter(o => CANCELLED_STATUSES.includes(o.status));
    return orders;
  }, [orders, activeFilter]);

  const renderOrder = useCallback(({ item }: { item: Order }) => {
    return (
      <TouchableOpacity
        style={styles.orderCard}
        activeOpacity={0.7}
        onPress={() => {
          router.push({ pathname: '/(tabs)/(home)/tracking', params: { orderId: item.id } });
        }}
      >
        <View style={[styles.brandBadge, { backgroundColor: getStatusColor(item.status) + '15' }]}>
          <Package size={22} color={getStatusColor(item.status)} />
        </View>
        <View style={styles.orderInfo}>
          <Text style={styles.orderBrand}>{item.brandName || 'Gas'} {item.cylinderSize}kg{item.cylinderType ? ` · ${item.cylinderType}` : ''}</Text>
          <Text style={styles.orderDate}>{formatDate(item.createdAt)}</Text>
          <View style={styles.statusRow}>
            <View style={[styles.statusDot, { backgroundColor: getStatusColor(item.status) }]} />
            <Text style={[styles.statusText, { color: getStatusColor(item.status) }]}>
              {getCustomerStatusLabel(item.status, t)}
            </Text>
            <Text style={styles.statusTextMM}>
              {getCustomerStatusLabelMM(item.status, tMM)}
            </Text>
          </View>
        </View>
        <View style={styles.orderRight}>
          <Text style={styles.orderPrice}>{item.pricing.total.toLocaleString()} K</Text>
          <ChevronRight size={16} color={Colors.textTertiary} />
        </View>
      </TouchableOpacity>
    );
  }, []);

  return (
    <View style={styles.container}>
      <View style={styles.filterRow}>
        <FlatList
          horizontal
          data={FILTER_OPTIONS}
          renderItem={({ item }) => (
            <TouchableOpacity
              style={[styles.filterChip, activeFilter === item.key && styles.filterChipActive]}
              onPress={() => setActiveFilter(item.key)}
              activeOpacity={0.7}
            >
              <Text style={[styles.filterText, activeFilter === item.key && styles.filterTextActive]}>
                {item.label}
              </Text>
            </TouchableOpacity>
          )}
          keyExtractor={(item) => item.key}
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.filterList}
        />
      </View>

      <FlatList
        data={filteredOrders}
        renderItem={renderOrder}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <Package size={48} color={Colors.textTertiary} />
            <Text style={styles.emptyText}>{t('no_orders')}</Text>
            <Text style={styles.emptySubtext}>{t('no_orders_sub')}</Text>
          </View>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  filterRow: {
    backgroundColor: Colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: Colors.borderLight,
  },
  filterList: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 8,
  },
  filterChip: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: Colors.background,
    marginRight: 8,
  },
  filterChipActive: {
    backgroundColor: Colors.primary,
  },
  filterText: {
    fontSize: 13,
    fontWeight: '600' as const,
    color: Colors.textSecondary,
  },
  filterTextActive: {
    color: '#FFFFFF',
  },
  listContent: {
    padding: 16,
    gap: 12,
  },
  orderCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surface,
    padding: 16,
    borderRadius: 16,
    gap: 14,
    borderWidth: 1,
    borderColor: Colors.borderLight,
  },
  brandBadge: {
    width: 44,
    height: 44,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  orderInfo: {
    flex: 1,
  },
  orderBrand: {
    fontSize: 15,
    fontWeight: '700' as const,
    color: Colors.textPrimary,
  },
  orderDate: {
    fontSize: 12,
    color: Colors.textTertiary,
    marginTop: 2,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginTop: 4,
  },
  statusDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
  },
  statusText: {
    fontSize: 12,
    fontWeight: '600' as const,
  },
  statusTextMM: {
    fontSize: 11,
    color: Colors.textTertiary,
    marginLeft: 4,
  },
  orderRight: {
    alignItems: 'flex-end',
    gap: 8,
  },
  orderPrice: {
    fontSize: 15,
    fontWeight: '700' as const,
    color: Colors.textPrimary,
  },
  emptyState: {
    alignItems: 'center',
    paddingTop: 80,
    gap: 8,
  },
  emptyText: {
    fontSize: 17,
    fontWeight: '600' as const,
    color: Colors.textPrimary,
  },
  emptySubtext: {
    fontSize: 14,
    color: Colors.textTertiary,
  },
});
