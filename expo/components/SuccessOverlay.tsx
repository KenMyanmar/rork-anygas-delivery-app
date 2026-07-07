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
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
  withDelay,
  withSequence,
  Easing,
  runOnJS,
} from 'react-native-reanimated';
import Colors from '@/constants/colors';
import { SPRING, DURATION, EASE_OUT, useReduceMotion } from '@/lib/motion';

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
  const reduce = useReduceMotion();
  const checkScale = useSharedValue(0);
  const checkOpacity = useSharedValue(0);
  const cardY = useSharedValue(40);
  const cardOpacity = useSharedValue(0);
  const ringScale = useSharedValue(0);

  const checkStyle = useAnimatedStyle(() => ({
    transform: [{ scale: checkScale.value }],
    opacity: checkOpacity.value,
  }));
  const ringStyle = useAnimatedStyle(() => ({
    transform: [{ scale: ringScale.value }],
    opacity: checkOpacity.value,
  }));
  const cardStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: cardY.value }],
    opacity: cardOpacity.value,
  }));

  useEffect(() => {
    if (!visible) return;
    // Fire the single success haptic once.
    if (Platform.OS !== 'web') {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    }
    if (reduce) {
      checkOpacity.value = withTiming(1, { duration: 200 });
      checkScale.value = 1;
      cardOpacity.value = withTiming(1, { duration: 200 });
      cardY.value = 0;
      ringScale.value = 1;
    } else {
      // Check draws in: 0 → 1.15 → 1 with a bouncy spring
      checkOpacity.value = withTiming(1, { duration: 120 });
      checkScale.value = withSequence(
        withSpring(1.15, SPRING.bouncy),
        withSpring(1, SPRING.standard),
      );
      // Ring expand behind the check
      ringScale.value = withSequence(
        withSpring(1.3, { damping: 14, stiffness: 160 }),
        withSpring(1, SPRING.standard),
      );
      // Card slides up with a gentle spring
      cardOpacity.value = withDelay(120, withTiming(1, { duration: 200 }));
      cardY.value = withDelay(120, withSpring(0, SPRING.gentle));
    }
    // Auto-dismiss after 1.6s
    const t = setTimeout(() => runOnJS(onDone)(), 1600);
    return () => clearTimeout(t);
  }, [visible, reduce]);

  if (!visible) return null;

  return (
    <Pressable style={styles.overlay} onPress={onDone}>
      <View style={styles.centerWrap}>
        <Animated.View style={[styles.ring, ringStyle]} />
        <Animated.View style={[styles.checkCircle, checkStyle]}>
          <Check size={56} color="#FFFFFF" strokeWidth={3} />
        </Animated.View>
        <Animated.View style={[styles.card, cardStyle]}>
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
        </Animated.View>
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
