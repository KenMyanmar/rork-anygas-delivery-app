/**
 * vD-MOTION — animation foundation.
 *
 * Motion laws (locked):
 * - Every animation ≤ 300ms except ambient loops.
 * - Springs over easings (damping ~18, stiffness ~180).
 * - Animation must never block input.
 * - Respect AccessibilityInfo.isReduceMotionEnabled — disable non-essential
 *   motion when on. Moments 1/3/5/7/9 are non-essential; 2/4/6/8 stay.
 * - 60fps only (Reanimated UI-thread).
 */
import React, { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Platform, Pressable, View, Text } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
  withRepeat,
  withSequence,
  Easing,
  cancelAnimation,
  runOnJS,
  useAnimatedReaction,
  useDerivedValue,
  interpolate,
  useAnimatedProps,
} from 'react-native-reanimated';

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

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

type ScalePressableProps = React.ComponentProps<typeof Pressable> & {
  /** Scale on press-in. Default 0.97. Set to 1 to disable scale (opacity only). */
  pressScale?: number;
  /** Opacity on press-in when reduce-motion is on. Default 0.7. */
  pressOpacity?: number;
  /** Reanimated entering animation (e.g. FadeInDown.delay(i*40).springify()). */
  entering?: any;
  /** Reanimated exiting animation. */
  exiting?: any;
  /** Reanimated layout animation. */
  layout?: any;
};

/**
 * Pressable with press-scale built in (moment 1). Scales to `pressScale`
 * on press-in, springs back on release. Under reduce-motion, falls back
 * to opacity change only (no transform). Apply to all tappable cards/buttons.
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
    const scaleSV = useSharedValue(1);
    const opacitySV = useSharedValue(1);

    const animatedStyle = useAnimatedStyle(() => ({
      transform: reduce ? [] : [{ scale: scaleSV.value }],
      opacity: reduce ? opacitySV.value : 1,
    }));

    return (
      <AnimatedPressable
        onPressIn={(e: any) => {
          onPressIn?.(e);
          if (reduce) {
            opacitySV.value = withTiming(pressOpacity, { duration: 80 });
          } else if (!disabled) {
            scaleSV.value = withSpring(pressScale, SPRING.snappy);
          }
        }}
        onPressOut={(e: any) => {
          onPressOut?.(e);
          if (reduce) {
            opacitySV.value = withTiming(1, { duration: 120 });
          } else {
            scaleSV.value = withSpring(1, SPRING.standard);
          }
        }}
        disabled={disabled}
        style={[style, animatedStyle]}
        entering={entering}
        exiting={exiting}
        layout={layout}
        {...rest}
      >
        {children}
      </AnimatedPressable>
    );
  },
);

// ---------- Shimmer skeleton (moment 9) ----------

/**
 * Shimmer skeleton block. Subtle 1.2s sweep gradient. Falls back to a
 * static block under reduce-motion.
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
  const reduce = useReduceMotion();
  const translate = useSharedValue(-1);

  useEffect(() => {
    if (reduce) return;
    translate.value = withRepeat(
      withTiming(1, { duration: DURATION.ambient, easing: EASE_IN_OUT }),
      -1,
      false,
    );
    return () => cancelAnimation(translate);
  }, [reduce]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translate.value * 220 }],
  }));

  if (reduce) {
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

  return (
    <View
      style={[
        {
          width,
          height,
          borderRadius,
          backgroundColor: 'rgba(0,0,0,0.05)',
          overflow: 'hidden',
        },
        style,
      ]}
    >
      <Animated.View
        style={[
          {
            position: 'absolute',
            top: 0,
            left: 0,
            width: 120,
            height: '100%',
            backgroundColor: 'rgba(255,255,255,0.55)',
          },
          animatedStyle,
        ]}
      />
    </View>
  );
}

// ---------- Stagger entrance presets (moment 5) ----------

import {
  FadeInDown,
  FadeIn,
  SlideInRight,
  SlideOutLeft,
  SlideInLeft,
  SlideOutRight,
  FadeInUp,
  FadeOut,
  withDelay as _wd,
} from 'react-native-reanimated';

export const ENTRANCE = {
  fadeInDown: (index: number, max = 8) =>
    index < max
      ? FadeInDown.delay(index * 40).springify().damping(18).stiffness(180)
      : FadeInDown.springify().damping(18).stiffness(180),
  fadeIn: FadeIn.springify().damping(18).stiffness(180),
};

// Step transition directions (moment 2)
export const STEP_ENTER = {
  forward: SlideInRight.springify().damping(20).stiffness(200).duration(220),
  back: SlideInLeft.springify().damping(20).stiffness(200).duration(220),
};
export const STEP_EXIT = {
  forward: SlideOutLeft.springify().damping(20).stiffness(200).duration(150),
  back: SlideOutRight.springify().damping(20).stiffness(200).duration(150),
};

export { FadeIn, FadeOut, FadeInDown, FadeInUp, SlideInRight, SlideInLeft, SlideOutLeft, SlideOutRight };

// ---------- AnimatedNumber (moment 7) ----------

const AnimatedText = Animated.createAnimatedComponent(Text);

/**
 * Rolling number text. Animates from previous value to next over `duration`ms
 * when the `value` prop changes. Falls back to instant text under reduce-motion.
 * Use for the pricing/confirm total so quantity taps roll the number visibly.
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
  const reduce = useReduceMotion();
  const displayed = useSharedValue(value);
  const isFirst = useRef(true);

  useEffect(() => {
    if (reduce) {
      displayed.value = value;
      return;
    }
    if (isFirst.current) {
      isFirst.current = false;
      displayed.value = value;
      return;
    }
    displayed.value = withTiming(value, { duration, easing: EASE_OUT });
  }, [value, reduce]);

  const animatedProps = useAnimatedProps(() => ({
    text: format(displayed.value),
  })) as any;

  if (reduce) {
    return <Text style={style}>{format(value)}</Text>;
  }
  return <AnimatedText style={style} animatedProps={animatedProps} />;
}
