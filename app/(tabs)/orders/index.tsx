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
import { Order, OrderStatus } from '@/types';

type FilterKey = 'all' | 'active' | 'delivered' | 'cancelled';

const FILTER_OPTIONS: { key: FilterKey; label: string; labelMM: string }[] = [
  { key: 'all', label: 'All', labelMM: 'အားလုံး' },
  { key: 'active', label: 'Active', labelMM: 'လုပ်ဆောင်ဆဲ' },
  { key: 'delivered', label: 'Delivered', labelMM: 'ပို့ဆောင်ပြီး' },
  { key: 'cancelled', label: 'Cancelled', labelMM: 'ပယ်ဖျက်ပြီး' },
];

const ACTIVE_STATUSES: OrderStatus[] = ['new', 'confirmed', 'in_progress', 'dispatched'];
const CANCELLED_STATUSES: OrderStatus[] = ['cancelled', 'failed'];

function getCustomerStatusLabel(status: OrderStatus): string {
  switch (status) {
    case 'new': return 'Placed';
    case 'confirmed':
    case 'in_progress': return 'Received by Agent';
    case 'dispatched': return 'On the Way';
    case 'delivered': return 'Delivered';
    case 'cancelled':
    case 'failed': return 'Cancelled';
    default: return status;
  }
}

function getCustomerStatusLabelMM(status: OrderStatus): string {
  switch (status) {
    case 'new': return '\u1019\u103E\u102C\u101A\u1030\u1015\u103C\u102E\u1038';
    case 'confirmed':
    case 'in_progress': return '\u1000\u102D\u102F\u101A\u103A\u1005\u102C\u1038\u101C\u103E\u101A\u103A\u101C\u1000\u103A\u1001\u1036\u1015\u103C\u102E\u1038';
    case 'dispatched': return '\u1015\u102D\u102F\u1037\u1006\u1031\u102C\u1004\u103A\u1014\u1031\u1006\u1032';
    case 'delivered': return '\u1015\u102D\u102F\u1037\u1006\u1031\u102C\u1004\u103A\u1015\u103C\u102E\u1038';
    case 'cancelled':
    case 'failed': return '\u1019\u103E\u102C\u101A\u1030\u1019\u103E\u102F \u1015\u101A\u103A\u1016\u103B\u1000\u103A\u1015\u103C\u102E\u1038';
    default: return status;
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
  const [activeFilter, setActiveFilter] = useState<FilterKey>('all');

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
          <Text style={styles.orderBrand}>{item.brandName || 'Gas'} {item.cylinderSize}kg</Text>
          <Text style={styles.orderDate}>{formatDate(item.createdAt)}</Text>
          <View style={styles.statusRow}>
            <View style={[styles.statusDot, { backgroundColor: getStatusColor(item.status) }]} />
            <Text style={[styles.statusText, { color: getStatusColor(item.status) }]}>
              {getCustomerStatusLabel(item.status)}
            </Text>
            <Text style={styles.statusTextMM}>
              {getCustomerStatusLabelMM(item.status)}
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
            <Text style={styles.emptyText}>No orders found</Text>
            <Text style={styles.emptySubtext}>Your order history will appear here</Text>
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
