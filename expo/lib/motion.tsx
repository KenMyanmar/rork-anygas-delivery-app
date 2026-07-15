/**
 * vD-MOTION — animation foundation.
 *
 * Motion laws (locked):
 * - Every animation ≤ 300ms except ambient loops.
 * - Springs over easings (damping ~18, stiffness ~180).
 * - Animation must never block input.
 * - Respect AccessibilityInfo.isReduceMotionEnabled — disable non-essential
 *   motion when on. Moments 1/3/5/7/9 are non-essential; 2/4/6/8 stay.
 *
 * Store-stability quarantine (Build 12): UI-thread Worklets/Reanimated are
 * disabled because Worklets 0.5.1 can abort Hermes on iOS. Keep this module as
 * the single restoration point for richer motion after the native dependency
 * is upgraded to an Expo-supported fixed version.
 */
import React, { useEffect, useState } from 'react';
import { AccessibilityInfo, Easing, Platform, Pressable, View, Text } from 'react-native';

// ---------- Spring presets ----------

export const SPRING = {
  // Standard press feedback + general UI (damping 18, stiffness 180)
  standard: { damping: 18, stiffness: 180, mass: 1 },
  // Snappier for small elements (dots, chips, icons)
  snappy: { damping: 16, stiffness: 220, mass: 0.9 },
  // Gentle for entrance/bottom bar
  gentle: { damping: 22, stiffness: 150, mass: 1 },
  // Bouncy for the check-pop celebration moment
  bouncy: { damping: 12, stiffness: 200, mass: 1 },
} as const;

// ---------- Durations ----------

export const DURATION = {
  fast: 150, // step slide-out
  base: 220, // most transitions
  slow: 300, // celebration, big entrances
  ambient: 1200, // shimmer sweep, pulse loops
} as const;

// ---------- Easings (used sparingly; prefer springs) ----------

export const EASE_OUT = Easing.bezier(0.22, 1, 0.36, 1);
export const EASE_IN_OUT = Easing.bezier(0.65, 0, 0.35, 1);

// ---------- Reduce-motion hook ----------

/**
 * Reads AccessibilityInfo.isReduceMotionEnabled. Non-essential motion
 * (moments 1, 3, 5, 7, 9) is disabled when true. Essential feedback
 * (moments 2, 4, 6, 8) stays so navigation/state remain clear.
 */
export function useReduceMotion(): boolean {
  const [reduce, setReduce] = useState<boolean>(false);
  useEffect(() => {
    if (Platform.OS === 'web') {
      setReduce(false);
      return;
    }
    let mounted = true;
    AccessibilityInfo.isReduceMotionEnabled().then((v) => {
      if (mounted) setReduce(v);
    });
    const sub = AccessibilityInfo.addEventListener(
      'reduceMotionChanged',
      (v) => setReduce(v),
    );
    return () => {
      mounted = false;
      sub.remove();
    };
  }, []);
  return reduce;
}

// ---------- Animated Pressable ----------

type ScalePressableProps = React.ComponentProps<typeof Pressable> & {
  /** Scale on press-in. Default 0.97. Set to 1 to disable scale (opacity only). */
  pressScale?: number;
  /** Opacity on press-in when reduce-motion is on. Default 0.7. */
  pressOpacity?: number;
  /** Quarantined Reanimated props retained for source compatibility. */
  entering?: any;
  /** Reanimated exiting animation. */
  exiting?: any;
  /** Reanimated layout animation. */
  layout?: any;
};

/**
 * Worklets-free press feedback. React Native's pressed state provides the same
 * tactile affordance without scheduling UI-thread worklets.
 */
export const ScalePressable = React.forwardRef<any, ScalePressableProps>(
  function ScalePressable(
    {
      children,
      onPressIn,
      onPressOut,
      disabled,
      style,
      pressScale = 0.97,
      pressOpacity = 0.7,
      entering,
      exiting,
      layout,
      ...rest
    },
    _ref,
  ) {
    const reduce = useReduceMotion();
    return (
      <Pressable
        ref={_ref}
        onPressIn={onPressIn}
        onPressOut={onPressOut}
        disabled={disabled}
        style={(state) => [
          typeof style === 'function' ? style(state) : style,
          state.pressed && !disabled
            ? reduce
              ? { opacity: pressOpacity }
              : { opacity: pressOpacity, transform: [{ scale: pressScale }] }
            : null,
        ]}
        {...rest}
      >
        {children}
      </Pressable>
    );
  },
);

// ---------- Shimmer skeleton (moment 9) ----------

/**
 * Static skeleton block while Worklets are quarantined.
 */
export function Skeleton({
  width = '100%',
  height = 16,
  borderRadius = 8,
  style,
}: {
  width?: number | string;
  height?: number | string;
  borderRadius?: number;
  style?: any;
}) {
  return (
    <View
      style={[
        {
          width,
          height,
          borderRadius,
          backgroundColor: 'rgba(0,0,0,0.06)',
        },
        style,
      ]}
    />
  );
}

/**
 * Worklets-free number rendering. The API is retained so richer motion can be
 * restored in one place after the dependency is fixed.
 */
export function AnimatedNumber({
  value,
  format = (n: number) => Math.round(n).toLocaleString(),
  duration = 200,
  style,
}: {
  value: number;
  format?: (n: number) => string;
  duration?: number;
  style?: any;
}) {
  return <Text style={style}>{format(value)}</Text>;
}
