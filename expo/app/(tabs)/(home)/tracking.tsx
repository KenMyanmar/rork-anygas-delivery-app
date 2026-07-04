import React, { useEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Animated,
  Linking,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import {
  ChevronLeft,
  Phone,
  MapPin,
  Clock,
  CheckCircle,
  Circle,
  User,
  Star,
  Package,
  XCircle,
  AlertTriangle,
  Home,
} from 'lucide-react-native';
import Colors from '@/constants/colors';
import { useOrders } from '@/providers/OrderProvider';
import { useI18n } from '@/providers/I18nProvider';
import { Order } from '@/types';

/**
 * 4-stage tracker contract (verified against prod SQL — 9,916 orders):
 *   Step 1 "Order Placed"      = row exists (status='new')
 *   Step 2 "Supplier Assigned" = supplier_id IS NOT NULL (mapped to order.supplierAssigned)
 *   Step 3 "On the Way"        = status='in_progress'
 *   Step 4 "Delivered"         = status='delivered'
 *
 * 'dispatched' is a dead stage in prod (zero rows, ever) — removed from the tracker.
 * 'cancelled' and 'failed' are real terminal states (~17% of orders) rendered as
 * distinct end states, not a stuck progress bar.
 */
type StageKey = 'placed' | 'assigned' | 'on_the_way' | 'delivered';

function computeStage(order: Order): number {
  if (order.status === 'delivered') return 3;
  if (order.status === 'in_progress') return 2;
  if (order.supplierAssigned) return 1;
  return 0;
}

export default function TrackingScreen() {
  const { getActiveOrder, orders } = useOrders();
  const { orderId } = useLocalSearchParams<{ orderId?: string }>();
  const { t, tMM } = useI18n();

  const activeOrder = orderId
    ? orders.find(o => o.id === orderId) || null
    : getActiveOrder();
  const pulseAnim = useRef(new Animated.Value(0.3)).current;

  useEffect(() => {
    const pulse = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1, duration: 1000, useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 0.3, duration: 1000, useNativeDriver: true }),
      ])
    );
    pulse.start();
    return () => pulse.stop();
  }, []);

  const handleCallAgent = useCallback(() => {
    if (activeOrder?.agent?.phone) {
      Linking.openURL(`tel:${activeOrder.agent.phone}`);
    }
  }, [activeOrder]);

  const handleRate = useCallback(() => {
    router.push('/(tabs)/(home)/rating');
  }, []);

  if (!activeOrder) {
    return (
      <View style={styles.container}>
        <SafeAreaView style={styles.safeArea} edges={['top']}>
          <View style={styles.topBar}>
            <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
              <ChevronLeft size={22} color={Colors.textPrimary} />
            </TouchableOpacity>
            <Text style={styles.topTitle}>{t('track_title')}</Text>
            <View style={{ width: 40 }} />
          </View>
          <View style={styles.emptyState}>
            <Package size={48} color={Colors.textTertiary} />
            <Text style={styles.emptyText}>{t('no_active_order')}</Text>
          </View>
        </SafeAreaView>
      </View>
    );
  }

  const isCancelled = activeOrder.status === 'cancelled';
  const isFailed = activeOrder.status === 'failed';
  const isTerminal = isCancelled || isFailed;
  const currentStage = isTerminal ? -1 : computeStage(activeOrder);

  const orderLabel = [activeOrder.brandName, activeOrder.cylinderSize ? `${activeOrder.cylinderSize} kg` : null].filter(Boolean).join(' · ') || 'Gas';

  const orderTypeLabel = activeOrder.orderType === 'refill' ? t('type_refill')
    : activeOrder.orderType === 'new_setup' ? t('type_new_setup')
    : activeOrder.orderType === 'exchange' ? t('type_exchange')
    : t('type_service_call');

  const STAGES: { key: StageKey; label: string; labelMM: string }[] = [
    { key: 'placed', label: t('stage_placed'), labelMM: tMM('stage_placed') },
    { key: 'assigned', label: t('stage_assigned'), labelMM: tMM('stage_assigned') },
    { key: 'on_the_way', label: t('stage_on_the_way'), labelMM: tMM('stage_on_the_way') },
    { key: 'delivered', label: t('stage_delivered'), labelMM: tMM('stage_delivered') },
  ];

  return (
    <View style={styles.container}>
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        <View style={styles.topBar}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
            <ChevronLeft size={22} color={Colors.textPrimary} />
          </TouchableOpacity>
          <Text style={styles.topTitle}>{t('track_title')}</Text>
          <View style={{ width: 40 }} />
        </View>

        <ScrollView
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.orderSummary}>
            <View style={[styles.brandBadge, { backgroundColor: isTerminal ? Colors.errorLight : Colors.primary + '15' }]}>
              <Package size={24} color={isTerminal ? Colors.error : Colors.primary} />
            </View>
            <View style={styles.orderSummaryText}>
              <Text style={styles.orderBrand}>{orderLabel}</Text>
              <Text style={styles.orderType}>{orderTypeLabel}</Text>
            </View>
            <Text style={styles.orderTotal}>{activeOrder.pricing.total.toLocaleString()} K</Text>
          </View>

          {activeOrder.estimatedDelivery && activeOrder.status !== 'delivered' && !isTerminal && (
            <View style={styles.etaCard}>
              <Animated.View style={{ opacity: pulseAnim }}>
                <Clock size={20} color={Colors.primary} />
              </Animated.View>
              <View>
                <Text style={styles.etaLabel}>{t('est_delivery')}</Text>
                <Text style={styles.etaValue}>{activeOrder.estimatedDelivery}</Text>
              </View>
            </View>
          )}

          {isCancelled ? (
            <View style={styles.terminalCard}>
              <View style={styles.terminalIconWrap}>
                <XCircle size={40} color={Colors.error} />
              </View>
              <Text style={styles.terminalTitle}>{t('order_cancelled')}</Text>
              <Text style={styles.terminalTitleMM}>{tMM('order_cancelled')}</Text>
              {(activeOrder as any).cancelled_reason ? (
                <Text style={styles.terminalReason}>{(activeOrder as any).cancelled_reason}</Text>
              ) : null}
              <TouchableOpacity
                style={styles.terminalButton}
                onPress={() => router.replace('/(tabs)/(home)')}
                activeOpacity={0.85}
              >
                <Home size={18} color="#FFFFFF" />
                <Text style={styles.terminalButtonText}>{t('back_home')}</Text>
              </TouchableOpacity>
            </View>
          ) : isFailed ? (
            <View style={styles.terminalCard}>
              <View style={[styles.terminalIconWrap, { backgroundColor: Colors.warningLight }]}>
                <AlertTriangle size={40} color={Colors.warning} />
              </View>
              <Text style={styles.terminalTitle}>{t('delivery_unsuccessful')}</Text>
              <Text style={styles.terminalTitleMM}>{tMM('delivery_unsuccessful')}</Text>
              <View style={styles.terminalActions}>
                <TouchableOpacity
                  style={[styles.terminalButton, styles.terminalButtonOutline]}
                  onPress={() => Linking.openURL('tel:8484')}
                  activeOpacity={0.85}
                >
                  <Phone size={18} color={Colors.primary} />
                  <Text style={[styles.terminalButtonText, { color: Colors.primary }]}>{t('contact_8484')}</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.terminalButton}
                  onPress={() => router.replace('/(tabs)/(home)')}
                  activeOpacity={0.85}
                >
                  <Home size={18} color="#FFFFFF" />
                  <Text style={styles.terminalButtonText}>{t('back_home')}</Text>
                </TouchableOpacity>
              </View>
            </View>
          ) : (
            <View style={styles.statusCard}>
              <Text style={styles.sectionTitle}>{t('order_status')}</Text>
              {STAGES.map((step, index) => {
                const isCompleted = index <= currentStage;
                const isCurrent = index === currentStage;
                const isLast = index === STAGES.length - 1;
                return (
                  <View key={step.key} style={styles.statusRow}>
                    <View style={styles.statusIndicator}>
                      {isCompleted ? (
                        <View style={[styles.statusCircleCompleted, isCurrent && styles.statusCircleCurrent]}>
                          <CheckCircle size={20} color={isCurrent ? Colors.primary : Colors.success} />
                        </View>
                      ) : (
                        <Circle size={20} color={Colors.border} />
                      )}
                      {!isLast && (
                        <View style={[styles.statusLine, isCompleted && styles.statusLineCompleted]} />
                      )}
                    </View>
                    <View style={styles.statusContent}>
                      <Text style={[styles.statusLabel, isCompleted && styles.statusLabelCompleted, isCurrent && styles.statusLabelCurrent]}>
                        {step.label}
                      </Text>
                      <Text style={styles.statusLabelMM}>{step.labelMM}</Text>
                    </View>
                  </View>
                );
              })}
            </View>
          )}

          {activeOrder.agent && (
            <View style={styles.agentCard}>
              <Text style={styles.sectionTitle}>{t('delivery_agent')}</Text>
              <View style={styles.agentInfo}>
                <View style={styles.agentAvatar}>
                  <User size={24} color={Colors.primary} />
                </View>
                <View style={styles.agentDetails}>
                  <Text style={styles.agentName}>{activeOrder.agent.name}</Text>
                  <Text style={styles.agentPhone}>{activeOrder.agent.phone}</Text>
                </View>
                <TouchableOpacity
                  style={styles.callButton}
                  onPress={handleCallAgent}
                  activeOpacity={0.7}
                >
                  <Phone size={20} color="#FFFFFF" />
                </TouchableOpacity>
              </View>
            </View>
          )}

          <View style={styles.addressCard}>
            <Text style={styles.sectionTitle}>{t('delivery_address')}</Text>
            <View style={styles.addressRow}>
              <MapPin size={18} color={Colors.primary} />
              <View style={{ flex: 1 }}>
                <Text style={styles.addressLabel}>{activeOrder.address.label}</Text>
                <Text style={styles.addressText}>{activeOrder.address.address}</Text>
              </View>
            </View>
          </View>

          {!isTerminal && activeOrder.status === 'delivered' && !activeOrder.rating && (
            <TouchableOpacity
              style={styles.rateButton}
              onPress={handleRate}
              activeOpacity={0.85}
            >
              <Star size={20} color="#FFFFFF" />
              <Text style={styles.rateButtonText}>{t('rate_delivery')}</Text>
            </TouchableOpacity>
          )}

          <View style={{ height: 30 }} />
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
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: Colors.surface,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: Colors.borderLight,
  },
  topTitle: {
    fontSize: 17,
    fontWeight: '700' as const,
    color: Colors.textPrimary,
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingTop: 8,
  },
  orderSummary: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surface,
    padding: 16,
    borderRadius: 16,
    marginBottom: 16,
    gap: 12,
    borderWidth: 1,
    borderColor: Colors.borderLight,
  },
  brandBadge: {
    width: 48,
    height: 48,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
  },
  orderSummaryText: {
    flex: 1,
  },
  orderBrand: {
    fontSize: 16,
    fontWeight: '700' as const,
    color: Colors.textPrimary,
  },
  orderType: {
    fontSize: 13,
    color: Colors.textSecondary,
    marginTop: 2,
  },
  orderTotal: {
    fontSize: 18,
    fontWeight: '800' as const,
    color: Colors.primary,
  },
  etaCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.primaryLight,
    padding: 16,
    borderRadius: 14,
    marginBottom: 16,
    gap: 12,
    borderWidth: 1,
    borderColor: Colors.primary + '20',
  },
  etaLabel: {
    fontSize: 12,
    color: Colors.textSecondary,
  },
  etaValue: {
    fontSize: 18,
    fontWeight: '800' as const,
    color: Colors.primaryDark,
  },
  statusCard: {
    backgroundColor: Colors.surface,
    borderRadius: 18,
    padding: 20,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: Colors.borderLight,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700' as const,
    color: Colors.textPrimary,
    marginBottom: 16,
  },
  statusRow: {
    flexDirection: 'row',
    gap: 14,
  },
  statusIndicator: {
    alignItems: 'center',
    width: 24,
  },
  statusCircleCompleted: {},
  statusCircleCurrent: {},
  statusLine: {
    width: 2,
    height: 32,
    backgroundColor: Colors.border,
    marginVertical: 4,
  },
  statusLineCompleted: {
    backgroundColor: Colors.success,
  },
  statusContent: {
    paddingBottom: 20,
    flex: 1,
  },
  statusLabel: {
    fontSize: 15,
    fontWeight: '500' as const,
    color: Colors.textTertiary,
  },
  statusLabelCompleted: {
    color: Colors.textPrimary,
    fontWeight: '600' as const,
  },
  statusLabelCurrent: {
    color: Colors.primary,
    fontWeight: '700' as const,
  },
  statusLabelMM: {
    fontSize: 12,
    color: Colors.textTertiary,
    marginTop: 1,
  },
  agentCard: {
    backgroundColor: Colors.surface,
    borderRadius: 18,
    padding: 20,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: Colors.borderLight,
  },
  agentInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  agentAvatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: Colors.primaryLight,
    justifyContent: 'center',
    alignItems: 'center',
  },
  agentDetails: {
    flex: 1,
  },
  agentName: {
    fontSize: 16,
    fontWeight: '700' as const,
    color: Colors.textPrimary,
  },
  agentPhone: {
    fontSize: 13,
    color: Colors.textSecondary,
    marginTop: 2,
  },
  callButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: Colors.success,
    justifyContent: 'center',
    alignItems: 'center',
  },
  addressCard: {
    backgroundColor: Colors.surface,
    borderRadius: 18,
    padding: 20,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: Colors.borderLight,
  },
  addressRow: {
    flexDirection: 'row',
    gap: 10,
    alignItems: 'flex-start',
  },
  addressLabel: {
    fontSize: 14,
    fontWeight: '700' as const,
    color: Colors.textPrimary,
  },
  addressText: {
    fontSize: 13,
    color: Colors.textSecondary,
    marginTop: 2,
  },
  rateButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.primary,
    paddingVertical: 18,
    borderRadius: 16,
    gap: 10,
    marginBottom: 16,
  },
  rateButtonText: {
    fontSize: 17,
    fontWeight: '700' as const,
    color: '#FFFFFF',
  },
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 12,
  },
  emptyText: {
    fontSize: 16,
    color: Colors.textTertiary,
  },
  terminalCard: {
    backgroundColor: Colors.surface,
    borderRadius: 18,
    padding: 28,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: Colors.borderLight,
    alignItems: 'center',
  },
  terminalIconWrap: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: Colors.errorLight,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  terminalTitle: {
    fontSize: 20,
    fontWeight: '700' as const,
    color: Colors.textPrimary,
    marginBottom: 4,
  },
  terminalTitleMM: {
    fontSize: 14,
    color: Colors.textSecondary,
    marginBottom: 12,
  },
  terminalReason: {
    fontSize: 14,
    color: Colors.textSecondary,
    textAlign: 'center' as const,
    marginBottom: 16,
    paddingHorizontal: 12,
  },
  terminalActions: {
    width: '100%' as const,
    gap: 10,
    marginTop: 8,
  },
  terminalButton: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    backgroundColor: Colors.primary,
    paddingVertical: 14,
    borderRadius: 14,
    gap: 8,
    width: '100%' as const,
    marginTop: 4,
  },
  terminalButtonOutline: {
    backgroundColor: Colors.primaryLight,
    borderWidth: 1,
    borderColor: Colors.primary + '30',
  },
  terminalButtonText: {
    fontSize: 16,
    fontWeight: '700' as const,
    color: '#FFFFFF',
  },
});
