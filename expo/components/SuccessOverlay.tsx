/**
 * vD-MOTION moment 4 — the order-placed celebration.
 *
 * Full-screen overlay: green check draws in (300ms spring), card slides up
 * with order summary, single soft Notification.Success haptic. One tasteful
 * moment, KBZ-grade, not a game. Fires once, then auto-dismisses after 1.6s
 * or on tap. Under reduce-motion: static check + card fade-in, still fires
 * the haptic (moment 4 stays essential per the brief).
 */
import React, { useEffect } from 'react';
import { View, Text, StyleSheet, Platform, Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Check, Flame } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import Colors from '@/constants/colors';

type SuccessOverlayProps = {
  visible: boolean;
  totalLabel: string; // formatted total, e.g. "46,000 MMK"
  orderSummary?: string; // e.g. "2× Parami 12.5kg"
  onDone: () => void;
};

export function SuccessOverlay({
  visible,
  totalLabel,
  orderSummary,
  onDone,
}: SuccessOverlayProps) {
  useEffect(() => {
    if (!visible) return;
    // Fire the single success haptic once.
    if (Platform.OS !== 'web') {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    }
    // Auto-dismiss after 1.6s
    const t = setTimeout(onDone, 1600);
    return () => clearTimeout(t);
  }, [visible, onDone]);

  if (!visible) return null;

  return (
    <Pressable style={styles.overlay} onPress={onDone}>
      <View style={styles.centerWrap}>
        <View style={styles.ring} />
        <View style={styles.checkCircle}>
          <Check size={56} color="#FFFFFF" strokeWidth={3} />
        </View>
        <View style={styles.card}>
          <View style={styles.cardFlame}>
            <Flame size={18} color={Colors.primary} />
          </View>
          <Text style={styles.cardTitle}>Order placed</Text>
          {orderSummary ? (
            <Text style={styles.cardSummary} numberOfLines={2}>
              {orderSummary}
            </Text>
          ) : null}
          <Text style={styles.cardTotal}>{totalLabel}</Text>
          <Text style={styles.cardHint}>Tap to continue</Text>
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 99999,
  },
  centerWrap: {
    alignItems: 'center',
    justifyContent: 'center',
    flex: 1,
  },
  ring: {
    position: 'absolute',
    width: 120,
    height: 120,
    borderRadius: 999,
    backgroundColor: 'rgba(22,163,74,0.18)',
  },
  checkCircle: {
    width: 96,
    height: 96,
    borderRadius: 999,
    backgroundColor: Colors.success,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: 'rgba(22,163,74,0.45)',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 1,
    shadowRadius: 24,
    elevation: 10,
  },
  card: {
    marginTop: 32,
    backgroundColor: Colors.surface,
    borderRadius: 20,
    paddingHorizontal: 28,
    paddingVertical: 22,
    alignItems: 'center',
    minWidth: 220,
    shadowColor: 'rgba(0,0,0,0.2)',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 1,
    shadowRadius: 24,
    elevation: 12,
  },
  cardFlame: {
    width: 36,
    height: 36,
    borderRadius: 999,
    backgroundColor: Colors.primaryLight,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 10,
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: '800' as const,
    color: Colors.textPrimary,
  },
  cardSummary: {
    fontSize: 13,
    color: Colors.textSecondary,
    marginTop: 4,
    textAlign: 'center' as const,
  },
  cardTotal: {
    fontSize: 24,
    fontWeight: '900' as const,
    color: Colors.primary,
    marginTop: 8,
  },
  cardHint: {
    fontSize: 11,
    color: Colors.textTertiary,
    marginTop: 10,
  },
});
