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
  TouchableOpacity,
  StyleSheet,
  Animated,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { Flame, Delete, Fingerprint, HelpCircle } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import Colors from '@/constants/colors';
import { usePinLock } from '@/providers/PinLockProvider';
import { useAuth } from '@/providers/AuthProvider';
import { useI18n } from '@/providers/I18nProvider';
import { router } from 'expo-router';

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
  const shakeAnim = useRef(new Animated.Value(0)).current;
  const fadeAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(fadeAnim, {
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
    Animated.sequence([
      Animated.timing(shakeAnim, { toValue: 10, duration: 50, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: -10, duration: 50, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: 10, duration: 50, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: 0, duration: 50, useNativeDriver: true }),
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
        <Animated.View style={[styles.content, { opacity: fadeAnim }]}>
          {/* Logo */}
          <View style={styles.logoSection}>
            <View style={styles.logoCircle}>
              <Flame size={32} color="#FFFFFF" strokeWidth={2.5} />
            </View>
            <Text style={styles.brandName}>AnyGas</Text>
            <Text style={styles.brandNumber}>8484</Text>
          </View>

          {/* Title + subtitle */}
          <View style={styles.titleSection}>
            <Text style={styles.title}>{title}</Text>
            <Text style={styles.subtitle}>{subtitle}</Text>
            {mode === 'confirm' && (
              <Text style={styles.subtitleMM}>{tMM('pin_confirm_subtitle')}</Text>
            )}
          </View>

          {/* PIN dots */}
          <Animated.View style={[styles.dotsRow, { transform: [{ translateX: shakeAnim }] }]}>
            {[0, 1, 2, 3].map((i) => (
              <View
                key={i}
                style={[
                  styles.pinDot,
                  i < pin.length && styles.pinDotFilled,
                  errorMsg ? styles.pinDotError : null,
                ]}
              />
            ))}
          </Animated.View>

          {/* Error message */}
          {errorMsg ? (
            <Text style={styles.errorText}>{errorMsg}</Text>
          ) : (
            <Text style={styles.errorPlaceholder}>&nbsp;</Text>
          )}

          {/* Keypad */}
          <View style={styles.keypad}>
            {KEYPAD_DIGITS.map((row, rowIdx) => (
              <View key={rowIdx} style={styles.keypadRow}>
                {row.map((key, colIdx) => {
                  if (key === '') {
                    return <View key={colIdx} style={styles.keyPlaceholder} />;
                  }
                  if (key === 'del') {
                    return (
                      <TouchableOpacity
                        key={colIdx}
                        style={styles.key}
                        onPress={handleDelete}
                        activeOpacity={0.5}
                      >
                        <Delete size={28} color={Colors.textSecondary} />
                      </TouchableOpacity>
                    );
                  }
                  return (
                    <TouchableOpacity
                      key={colIdx}
                      style={styles.key}
                      onPress={() => handleKeyPress(key)}
                      activeOpacity={0.4}
                    >
                      <Text style={styles.keyText}>{key}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            ))}
          </View>

          {/* Bottom actions: biometric + forgot PIN */}
          <View style={styles.bottomActions}>
            {mode === 'unlock' && biometricEnabled && biometricAvailable ? (
              <TouchableOpacity
                style={styles.biometricBtn}
                onPress={triggerBiometric}
                activeOpacity={0.7}
              >
                <Fingerprint size={24} color={Colors.primary} />
                <Text style={styles.biometricText}>{t('biometric_unlock')}</Text>
              </TouchableOpacity>
            ) : (
              <View style={{ height: 48 }} />
            )}

            {mode === 'unlock' ? (
              <TouchableOpacity
                style={styles.forgotBtn}
                onPress={handleForgotPin}
                activeOpacity={0.7}
              >
                <HelpCircle size={16} color={Colors.textTertiary} />
                <Text style={styles.forgotText}>{t('pin_forgot')}</Text>
              </TouchableOpacity>
            ) : (
              <View style={{ height: 24 }} />
            )}
          </View>
        </Animated.View>
      </SafeAreaView>
    </View>
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
    borderRadius: 32,
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
  title: {
    fontSize: 22,
    fontWeight: '700',
    color: Colors.textPrimary,
    marginBottom: 6,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 14,
    color: Colors.textSecondary,
    textAlign: 'center',
  },
  subtitleMM: {
    fontSize: 12,
    color: Colors.textTertiary,
    marginTop: 2,
  },
  dotsRow: {
    flexDirection: 'row',
    gap: 16,
    marginBottom: 16,
  },
  pinDot: {
    width: 16,
    height: 16,
    borderRadius: 8,
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
    borderRadius: 36,
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
  biometricBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 12,
    paddingHorizontal: 20,
  },
  biometricText: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.primary,
  },
  forgotBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 8,
  },
  forgotText: {
    fontSize: 13,
    color: Colors.textTertiary,
  },
});
