/**
 * vD1 Foundation — design token scales.
 *
 * Radius scale (law 2): sm=12, md=16, lg=20, pill=999. Nothing else.
 * Spacing scale (law 3): 4/8/12/16/20/24; screen padding 20.
 *
 * Use these constants in StyleSheet definitions instead of raw numbers
 * so the scale is enforced at the token level.
 */

// Border radii
export const Radius = {
  sm: 12, // inputs, small chips, icon wraps
  md: 16, // cards, buttons
  lg: 20, // feature cards, hero elements
  pill: 999, // pills, badges, toggles
} as const;

// Spacing
export const Spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  base: 16,
  lg: 20,
  xl: 24,
} as const;

export const SCREEN_PADDING = 20;

/**
 * vD1: Myanmar font family helpers.
 *
 * Noto Sans Myanmar is loaded via expo-font in _layout.tsx. These helpers
 * return the correct font family for Burmese text. English stays system font.
 *
 * MM text renders at 100–115% of the EN equivalent size (never smaller).
 * Callers should use mmFontSize() for Burmese Text components.
 */
export type MMFontWeight = 'regular' | 'medium' | 'bold';

export function mmFontFamily(weight: MMFontWeight = 'regular'): string {
  switch (weight) {
    case 'bold':
      return 'NotoSansMyanmar-Bold';
    case 'medium':
      return 'NotoSansMyanmar-Medium';
    default:
      return 'NotoSansMyanmar-Regular';
  }
}

/**
 * Scale an EN font size up for Burmese (100–115% of EN, never smaller).
 * Burmese glyphs are typically smaller at the same pt size, so we bump.
 */
export function mmFontSize(enSize: number): number {
  return Math.round(enSize * 1.1);
}

/**
 * Card shadow — applies to ALL cards (law 8).
 * Subtle elevation: black 0.06, radius 12, elevation 2.
 */
export const cardShadowStyle = {
  shadowColor: 'rgba(0,0,0,0.06)',
  shadowOffset: { width: 0, height: 2 },
  shadowOpacity: 1,
  shadowRadius: 12,
  elevation: 2,
} as const;

/**
 * CTA shadow — orange-tinted, CTAs only (law 8).
 */
export const ctaShadowStyle = {
  shadowColor: 'rgba(249,115,22,0.30)',
  shadowOffset: { width: 0, height: 6 },
  shadowOpacity: 1,
  shadowRadius: 12,
  elevation: 8,
} as const;

/** Minimum touch target (law 5). */
export const TOUCH_TARGET = 44;
