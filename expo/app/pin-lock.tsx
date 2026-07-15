/**
 * vC14 Task A — PIN lock screen (setup + unlock).
 *
 * Renders as a full-screen overlay on top of the app when lockState is
 * 'no_pin' (mandatory setup) or 'locked' (unlock). Large numeric keypad,
 * haptic on keys, biometric prompt when enabled.
 *
 * Modes:
 *   setup     → enter 4-digit PIN → confirm → stored
 *   unlock    → enter 4-digit PIN → verify, or biometric prompt
 */
import React, { useState, useCallback, useRef, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Animated as RNAnimated,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { Flame, Delete, Fingerprint, HelpCircle } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import Colors from '@/constants/colors';
import { mmFontFamily, mmFontSize } from '@/constants/design';
import { usePinLock } from '@/providers/PinLockProvider';
import { useAuth } from '@/providers/AuthProvider';
import { useI18n } from '@/providers/I18nProvider';
import { router } from 'expo-router';
import { ScalePressable } from '@/lib/motion';

type Mode = 'setup' | 'confirm' | 'unlock';

export default function PinLockScreen() {
  const {
    lockState,
    setupPin,
    unlockWithPin,
    unlockWithBiometric,
    forgotPin,
    biometricEnabled,
    biometricAvailable,
    attempts,
    maxAttempts,
  } = usePinLock();
  const { logout } = useAuth();
  const { t, tMM } = useI18n();

  // 'no_pin' → setup flow; 'locked' → unlock flow
  const initialMode: Mode = lockState === 'no_pin' ? 'setup' : 'unlock';
  const [mode, setMode] = useState<Mode>(initialMode);
  const [pin, setPin] = useState<string>('');
  const [firstPin, setFirstPin] = useState<string>('');
  const [errorMsg, setErrorMsg] = useState<string>('');
  const [isVerifying, setIsVerifying] = useState<boolean>(false);
  const shakeAnim = useRef(new RNAnimated.Value(0)).current;
  const fadeAnim = useRef(new RNAnimated.Value(0)).current;

  useEffect(() => {
    RNAnimated.timing(fadeAnim, {
      toValue: 1,
      duration: 300,
      useNativeDriver: true,
    }).start();
  }, [fadeAnim]);

  // Reset state when lockState changes
  useEffect(() => {
    if (lockState === 'no_pin') {
      setMode('setup');
      setPin('');
      setFirstPin('');
      setErrorMsg('');
    } else if (lockState === 'locked') {
      setMode('unlock');
      setPin('');
      setErrorMsg('');
    }
  }, [lockState]);

  const triggerShake = useCallback(() => {
    if (Platform.OS === 'web') return;
    RNAnimated.sequence([
      RNAnimated.timing(shakeAnim, { toValue: 10, duration: 50, useNativeDriver: true }),
      RNAnimated.timing(shakeAnim, { toValue: -10, duration: 50, useNativeDriver: true }),
      RNAnimated.timing(shakeAnim, { toValue: 10, duration: 50, useNativeDriver: true }),
      RNAnimated.timing(shakeAnim, { toValue: 0, duration: 50, useNativeDriver: true }),
    ]).start();
  }, [shakeAnim]);

  const hapticKey = useCallback(() => {
    if (Platform.OS !== 'web') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
  }, []);

  const hapticError = useCallback(() => {
    if (Platform.OS !== 'web') {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    }
  }, []);

  const hapticSuccess = useCallback(() => {
    if (Platform.OS !== 'web') {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    }
  }, []);

  // Handle PIN entry completion based on mode
  const handlePinComplete = useCallback(async (fullPin: string) => {
    if (mode === 'setup') {
      // First entry — store and ask for confirmation
      setFirstPin(fullPin);
      setPin('');
      setMode('confirm');
      setErrorMsg('');
      return;
    }

    if (mode === 'confirm') {
      // Second entry — must match first
      if (fullPin === firstPin) {
        setIsVerifying(true);
        const success = await setupPin(fullPin);
        setIsVerifying(false);
        if (success) {
          hapticSuccess();
          setPin('');
          setFirstPin('');
        } else {
          hapticError();
          setErrorMsg(t('pin_too_short'));
          setPin('');
          setFirstPin('');
          setMode('setup');
        }
      } else {
        hapticError();
        triggerShake();
        setErrorMsg(t('pin_mismatch'));
        setPin('');
        setFirstPin('');
        setMode('setup');
      }
      return;
    }

    if (mode === 'unlock') {
      setIsVerifying(true);
      const result = await unlockWithPin(fullPin, async () => {
        // onLockedOut — sign out the user
        await logout();
      });
      setIsVerifying(false);
      if (result.success) {
        hapticSuccess();
        setPin('');
      } else {
        hapticError();
        triggerShake();
        setPin('');
        if (result.lockedOut) {
          setErrorMsg(t('pin_locked_out'));
        } else {
          const remaining = result.attemptsLeft;
          const template = t('pin_attempts_remaining');
          setErrorMsg(`${t('pin_wrong')} ${template.replace('{n}', String(remaining))}`);
        }
      }
    }
  }, [mode, firstPin, setupPin, unlockWithPin, logout, t, hapticSuccess, hapticError, triggerShake]);

  const handleKeyPress = useCallback((digit: string) => {
    hapticKey();
    setErrorMsg('');
    if (pin.length < 4) {
      const newPin = pin + digit;
      setPin(newPin);
      if (newPin.length === 4) {
        // Small delay so the user sees the 4th dot fill
        setTimeout(() => handlePinComplete(newPin), 150);
      }
    }
  }, [pin, hapticKey, handlePinComplete]);

  const handleDelete = useCallback(() => {
    hapticKey();
    setPin(prev => prev.slice(0, -1));
  }, [hapticKey]);

  // Biometric unlock — auto-prompt when lock screen appears and biometric is enabled
  const triggerBiometric = useCallback(async () => {
    const success = await unlockWithBiometric(t('biometric_prompt_title'));
    if (success) {
      hapticSuccess();
    }
  }, [unlockWithBiometric, t, hapticSuccess]);

  useEffect(() => {
    if (mode === 'unlock' && biometricEnabled && biometricAvailable && pin.length === 0) {
      // Auto-prompt biometric on lock screen entry
      const timer = setTimeout(() => triggerBiometric(), 400);
      return () => clearTimeout(timer);
    }
  }, [mode, biometricEnabled, biometricAvailable, pin.length, triggerBiometric]);

  // Forgot PIN → clear PIN + sign out → user re-OTPs
  const handleForgotPin = useCallback(async () => {
    await forgotPin();
    await logout();
    // After logout, AuthProvider redirects to login. The lock overlay
    // disappears because lockState → 'no_pin' and auth → false.
  }, [forgotPin, logout]);

  // Don't render if unlocked or still loading
  if (lockState === 'unlocked' || lockState === 'loading') {
    return null;
  }

  const subtitle = mode === 'setup'
    ? t('pin_setup_subtitle')
    : mode === 'confirm'
    ? t('pin_confirm_subtitle')
    : t('pin_unlock_subtitle');

  const title = mode === 'setup'
    ? t('pin_setup_title')
    : mode === 'confirm'
    ? t('pin_setup_title')
    : t('pin_unlock_title');

  const KEYPAD_DIGITS: string[][] = [
    ['1', '2', '3'],
    ['4', '5', '6'],
    ['7', '8', '9'],
    ['', '0', 'del'],
  ];

  return (
    <View style={styles.container}>
      <StatusBar style="light" />
      <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
        <RNAnimated.View style={[styles.content, { opacity: fadeAnim }]}>
          {/* Logo */}
          <View style={styles.logoSection}>
            <View style={styles.logoCircle}>
              <Flame size={32} color="#FFFFFF" strokeWidth={2.5} />
            </View>
            <Text style={styles.brandName}>AnyGas</Text>
            <Text style={styles.brandNumber}>8484</Text>
          </View>

          {/* Title + subtitle — vD1: Burmese leads, MM on top and larger */}
          <View style={styles.titleSection}>
            <Text style={styles.titleMM}>
              {mode === 'setup' ? 'PIN ကုဒ် သတ်မှတ်ပါ'
                : mode === 'confirm' ? 'အတည်ပြုရန် PIN ကုဒ်ကို ထပ်ထည့်ပါ'
                : 'အက်ပ်ကို ဖွင့်ရန် PIN ထည့်ပါ'}
            </Text>
            <Text style={styles.title}>{title}</Text>
            <Text style={styles.subtitleMM}>{tMM(mode === 'setup' ? 'pin_setup_subtitle' : mode === 'confirm' ? 'pin_confirm_subtitle' : 'pin_unlock_subtitle')}</Text>
            <Text style={styles.subtitle}>{subtitle}</Text>
          </View>

          {/* PIN dots — vD-MOTION moment 6: spring bounce per digit + error flash */}
          <RNAnimated.View style={[styles.dotsRow, { transform: [{ translateX: shakeAnim }] }]}>
            {[0, 1, 2, 3].map((i) => (
              <PinDot key={i} filled={i < pin.length} hasError={!!errorMsg} />
            ))}
          </RNAnimated.View>

          {/* Error message */}
          {errorMsg ? (
            <Text style={styles.errorText}>{errorMsg}</Text>
          ) : (
            <Text style={styles.errorPlaceholder}>&nbsp;</Text>
          )}

          {/* Keypad — vD-MOTION moment 1: press-scale on keys */}
          <View style={styles.keypad}>
            {KEYPAD_DIGITS.map((row, rowIdx) => (
              <View key={rowIdx} style={styles.keypadRow}>
                {row.map((key, colIdx) => {
                  if (key === '') {
                    return <View key={colIdx} style={styles.keyPlaceholder} />;
                  }
                  if (key === 'del') {
                    return (
                      <KeypadKey key={colIdx} onPress={handleDelete} pressScale={0.92}>
                        <Delete size={28} color={Colors.textSecondary} />
                      </KeypadKey>
                    );
                  }
                  return (
                    <KeypadKey key={colIdx} onPress={() => handleKeyPress(key)} pressScale={0.92}>
                      <Text style={styles.keyText}>{key}</Text>
                    </KeypadKey>
                  );
                })}
              </View>
            ))}
          </View>

          {/* Bottom actions: biometric + forgot PIN */}
          <View style={styles.bottomActions}>
            {mode === 'unlock' && biometricEnabled && biometricAvailable ? (
              <ScalePressable
                style={styles.biometricBtn}
                onPress={triggerBiometric}
              >
                <Fingerprint size={24} color={Colors.primary} />
                <Text style={styles.biometricText}>{t('biometric_unlock')}</Text>
              </ScalePressable>
            ) : (
              <View style={{ height: 48 }} />
            )}

            {mode === 'unlock' ? (
              <ScalePressable
                style={styles.forgotBtn}
                onPress={handleForgotPin}
              >
                <HelpCircle size={16} color={Colors.textTertiary} />
                <Text style={styles.forgotText}>{t('pin_forgot')}</Text>
              </ScalePressable>
            ) : (
              <View style={{ height: 24 }} />
            )}
          </View>
        </RNAnimated.View>
      </SafeAreaView>
    </View>
  );
}

/**
 * Static PIN dot while Worklets/Reanimated are quarantined for iOS stability.
 */
function PinDot({ filled, hasError }: { filled: boolean; hasError: boolean }) {
  return (
    <View
      style={[
        styles.pinDot,
        filled && { backgroundColor: Colors.primary, borderColor: Colors.primary },
        hasError && { backgroundColor: filled ? Colors.error : 'transparent', borderColor: Colors.error },
      ]}
    />
  );
}

/**
 * vD-MOTION moment 1: keypad key with press-scale. Large touch target,
 * scales to 0.92 on press. Falls back to opacity under reduce-motion.
 */
function KeypadKey({
  children,
  onPress,
  pressScale = 0.92,
}: {
  children: React.ReactNode;
  onPress: () => void;
  pressScale?: number;
}) {
  return (
    <ScalePressable style={styles.key} onPress={onPress} pressScale={pressScale}>
      {children}
    </ScalePressable>
  );
}

const styles = StyleSheet.create({
  container: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: Colors.background,
    zIndex: 9999,
  },
  safeArea: {
    flex: 1,
  },
  content: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
    paddingBottom: 20,
  },
  logoSection: {
    alignItems: 'center',
    marginBottom: 32,
  },
  logoCircle: {
    width: 64,
    height: 64,
    borderRadius: 999,
    backgroundColor: Colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
  },
  brandName: {
    fontSize: 24,
    fontWeight: '800',
    color: Colors.textPrimary,
    letterSpacing: -0.5,
  },
  brandNumber: {
    fontSize: 16,
    fontWeight: '600',
    color: Colors.primary,
    marginTop: -2,
    letterSpacing: 3,
  },
  titleSection: {
    alignItems: 'center',
    marginBottom: 28,
  },
  // vD1: Burmese leads — MM title is primary (larger, bold, MM font)
  titleMM: {
    fontSize: mmFontSize(22),
    fontFamily: mmFontFamily('bold'),
    fontWeight: '700',
    color: Colors.textPrimary,
    marginBottom: 4,
    textAlign: 'center',
    lineHeight: 30,
  },
  title: {
    fontSize: 16,
    fontWeight: '600',
    color: Colors.textSecondary,
    marginBottom: 8,
    textAlign: 'center',
  },
  subtitleMM: {
    fontSize: mmFontSize(14),
    fontFamily: mmFontFamily('regular'),
    color: Colors.textSecondary,
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 2,
  },
  subtitle: {
    fontSize: 13,
    color: Colors.textTertiary,
    textAlign: 'center',
  },
  dotsRow: {
    flexDirection: 'row',
    gap: 16,
    marginBottom: 16,
  },
  pinDot: {
    width: 16,
    height: 16,
    borderRadius: 999,
    borderWidth: 2,
    borderColor: Colors.border,
  },
  pinDotFilled: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  pinDotError: {
    borderColor: Colors.error,
  },
  errorText: {
    fontSize: 13,
    color: Colors.error,
    textAlign: 'center',
    minHeight: 20,
    marginBottom: 8,
  },
  errorPlaceholder: {
    fontSize: 13,
    minHeight: 20,
    marginBottom: 8,
  },
  keypad: {
    gap: 12,
    marginBottom: 24,
  },
  keypadRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 24,
  },
  keyPlaceholder: {
    width: 72,
    height: 72,
  },
  key: {
    width: 72,
    height: 72,
    borderRadius: 999,
    backgroundColor: Colors.surface,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: Colors.borderLight,
  },
  keyText: {
    fontSize: 28,
    fontWeight: '600',
    color: Colors.textPrimary,
  },
  bottomActions: {
    alignItems: 'center',
    gap: 16,
    width: '100%',
  },
  // vD1: 44pt touch floor for biometric button
  biometricBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 14,
    paddingHorizontal: 20,
    minHeight: 44,
    justifyContent: 'center',
  },
  biometricText: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.primary,
  },
  // vD1: 44pt touch floor for forgot-PIN button
  forgotBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 12,
    minHeight: 44,
    justifyContent: 'center',
  },
  forgotText: {
    fontSize: 13,
    color: Colors.textTertiary,
  },
});
