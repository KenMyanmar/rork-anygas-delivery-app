/**
 * AnyGas design tokens — vD1 Foundation.
 *
 * Design laws (locked):
 * - Radius scale: sm=12, md=16, lg=20, pill=999. Nothing else.
 * - Contrast floor: textTertiary #78716C (passes AA).
 * - Purple is official: promo accent for New Set / promotions.
 * - Shadows: cardShadow (all cards), ctaShadow (CTAs only).
 * - Dark mode: locked OFF for launch.
 */
export default {
  // Brand — orange (refill / primary)
  primary: '#F97316',
  primaryDark: '#EA580C',
  primaryLight: '#FFF7ED',
  primaryMuted: '#FDBA74',

  // Promo — purple (New Set / promotions, deliberately distinct from refill orange)
  promo: '#7C3AED',
  promoLight: '#F3E8FF',

  // Surfaces
  background: '#F8F7F4',
  surface: '#FFFFFF',
  surfaceElevated: '#FFFFFF',

  // Text — contrast floor: textTertiary bumped from #A8A29E → #78716C (AA pass)
  textPrimary: '#1C1917',
  textSecondary: '#57534E',
  textTertiary: '#78716C',

  // Borders
  border: '#E7E5E4',
  borderLight: '#F5F5F4',

  // Status
  success: '#16A34A',
  successLight: '#F0FDF4',
  warning: '#D97706',
  warningLight: '#FFFBEB',
  error: '#DC2626',
  errorLight: '#FEF2F2',

  // Overlays
  overlay: 'rgba(0,0,0,0.5)',

  // Shadows — two tokens only
  // cardShadow: subtle elevation on ALL cards (ends the flatness)
  // ctaShadow: orange-tinted, CTAs only
  cardShadow: 'rgba(0,0,0,0.06)',
  ctaShadow: 'rgba(249,115,22,0.30)',
  shadow: 'rgba(0,0,0,0.08)',
};
