/**
 * vC16 Task A — Account tile overlay (soft sign-out re-entry).
 *
 * Shown after a soft sign-out: the session is parked in SecureStore, and this
 * screen offers "Continue as 095119900" → PIN/biometric → resume session,
 * no OTP, no SMS. Also offers "Use another number" → full OTP flow (switching
 * accounts hard-logs-out the parked one first).
 *
 * 5 wrong PIN attempts on the tile = same wipe rule: parked session revoked
 * via signOut + cleared → OTP required.
 *
 * Native-only (same as PinLockScreen — web bypass via _layout).
 */
import React, { useState, useCallback, useRef, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Animated,
  Platform,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { Flame, Delete, Fingerprint, UserCog, ArrowRight } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import Colors from '@/constants/colors';
import { usePinLock } from '@/providers/PinLockProvider';
import { useAuth } from '@/providers/AuthProvider';
import { useI18n } from '@/providers/I18nProvider';
import { router } from 'expo-router';

export default function AccountTileScreen() {
  const {
    unlockWithPin,
    unlockWithBiometric,
    biometricEnabled,
    biometricAvailable,
    forgotPin,
  } = usePinLock();
  const { parkedAccount, resumeParkedSession, logout, clearParkedSession } = useAuth();
  const { t, tMM } = useI18n();

  const [pin, setPin] = useState<string>('');
  const [errorMsg, setErrorMsg] = useState<string>('');
  const [isVerifying, setIsVerifying] = useState<boolean>(false);
  const [isSwitching, setIsSwitching] = useState<boolean>(false);
  const shakeAnim = useRef(new Animated.Value(0)).current;
  const fadeAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(fadeAnim, {
      toValue: 1,
      duration: 300,
      useNativeDriver: true,
    }).start();
  }, [fadeAnim]);

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

  // PIN entry → unlock → resume parked session
  const handlePinComplete = useCallback(async (fullPin: string) => {
    setIsVerifying(true);
    const result = await unlockWithPin(fullPin, async () => {
      // onLockedOut — 5 wrong attempts: revoke parked session + hard sign out
      await clearParkedSession();
      await logout();
    });
    setIsVerifying(false);

    if (result.success) {
      hapticSuccess();
      setPin('');
      // Resume the parked session — no OTP, no SMS
      const resumed = await resumeParkedSession();
      if (resumed) {
        console.log('[AccountTile] Session resumed, navigating home');
        router.replace('/');
      } else {
        // Resume failed — fall back to login
        console.log('[AccountTile] Resume failed, falling back to login');
        await logout();
        router.replace('/login');
      }
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
  }, [unlockWithPin, clearParkedSession, logout, resumeParkedSession, t, hapticSuccess, hapticError, triggerShake]);

  const handleKeyPress = useCallback((digit: string) => {
    hapticKey();
    setErrorMsg('');
    if (pin.length < 4) {
      const newPin = pin + digit;
      setPin(newPin);
      if (newPin.length === 4) {
        setTimeout(() => handlePinComplete(newPin), 150);
      }
    }
  }, [pin, hapticKey, handlePinComplete]);

  const handleDelete = useCallback(() => {
    hapticKey();
    setPin(prev => prev.slice(0, -1));
  }, [hapticKey]);

  // Biometric unlock
  const triggerBiometric = useCallback(async () => {
    const success = await unlockWithBiometric(t('biometric_prompt_title'));
    if (success) {
      hapticSuccess();
      const resumed = await resumeParkedSession();
      if (resumed) {
        router.replace('/');
      } else {
        await logout();
        router.replace('/login');
      }
    }
  }, [unlockWithBiometric, t, hapticSuccess, resumeParkedSession, logout]);

  // Auto-prompt biometric on mount if enabled
  useEffect(() => {
    if (biometricEnabled && biometricAvailable && pin.length === 0) {
      const timer = setTimeout(() => triggerBiometric(), 400);
      return () => clearTimeout(timer);
    }
  }, [biometricEnabled, biometricAvailable, pin.length, triggerBiometric]);

  // "Use another number" → hard-logout the parked account, then go to login
  const handleSwitchAccount = useCallback(async () => {
    setIsSwitching(true);
    console.log('[AccountTile] Switching account — clearing parked session');
    await clearParkedSession();
    await logout();
    setIsSwitching(false);
    router.replace('/login');
  }, [clearParkedSession, logout]);

  // Forgot PIN → clear PIN + revoke parked session + hard sign out → OTP
  const handleForgotPin = useCallback(async () => {
    await forgotPin();
    await clearParkedSession();
    await logout();
  }, [forgotPin, clearParkedSession, logout]);

  if (!parkedAccount) return null;

  const phoneDisplay = parkedAccount.phone || '';
  const nameDisplay = parkedAccount.name || '';

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
              <Flame size={28} color="#FFFFFF" strokeWidth={2.5} />
            </View>
            <Text style={styles.brandName}>AnyGas</Text>
            <Text style={styles.brandNumber}>8484</Text>
          </View>

          {/* Account tile — "Continue as 095119900" */}
          <View style={styles.tileCard}>
            <View style={styles.tileIconWrap}>
              <UserCog size={24} color={Colors.primary} />
            </View>
            <View style={styles.tileInfo}>
              {nameDisplay ? (
                <Text style={styles.tileName}>{nameDisplay}</Text>
              ) : null}
              <Text style={styles.tilePhone}>{phoneDisplay}</Text>
            </View>
          </View>

          {/* Title */}
          <View style={styles.titleSection}>
            <Text style={styles.title}>{t('account_tile_enter_pin')}</Text>
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

          {/* Error */}
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

          {/* Bottom actions */}
          <View style={styles.bottomActions}>
            {biometricEnabled && biometricAvailable ? (
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

            {/* Switch account + forgot PIN */}
            <View style={styles.linkRow}>
              <TouchableOpacity
                style={styles.linkBtn}
                onPress={handleSwitchAccount}
                disabled={isSwitching}
                activeOpacity={0.7}
              >
                {isSwitching ? (
                  <ActivityIndicator size="small" color={Colors.textTertiary} />
                ) : (
                  <Text style={styles.linkText}>{t('switch_account')}</Text>
                )}
              </TouchableOpacity>
              <Text style={styles.linkDivider}>·</Text>
              <TouchableOpacity
                style={styles.linkBtn}
                onPress={handleForgotPin}
                activeOpacity={0.7}
              >
                <Text style={styles.linkText}>{t('pin_forgot')}</Text>
              </TouchableOpacity>
            </View>
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
    zIndex: 9998,
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
    marginBottom: 24,
  },
  logoCircle: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: Colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 10,
  },
  brandName: {
    fontSize: 20,
    fontWeight: '800' as const,
    color: Colors.textPrimary,
    letterSpacing: -0.5,
  },
  brandNumber: {
    fontSize: 14,
    fontWeight: '600' as const,
    color: Colors.primary,
    marginTop: -2,
    letterSpacing: 3,
  },
  tileCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surface,
    borderRadius: 18,
    padding: 16,
    gap: 14,
    borderWidth: 1.5,
    borderColor: Colors.primaryLight,
    marginBottom: 28,
    width: '100%',
  },
  tileIconWrap: {
    width: 48,
    height: 48,
    borderRadius: 14,
    backgroundColor: Colors.primaryLight,
    justifyContent: 'center',
    alignItems: 'center',
  },
  tileInfo: {
    flex: 1,
  },
  tileName: {
    fontSize: 16,
    fontWeight: '700' as const,
    color: Colors.textPrimary,
    marginBottom: 2,
  },
  tilePhone: {
    fontSize: 18,
    fontWeight: '600' as const,
    color: Colors.primary,
    letterSpacing: 1,
  },
  titleSection: {
    alignItems: 'center',
    marginBottom: 24,
  },
  title: {
    fontSize: 18,
    fontWeight: '700' as const,
    color: Colors.textPrimary,
    textAlign: 'center',
  },
  dotsRow: {
    flexDirection: 'row',
    gap: 16,
    marginBottom: 14,
  },
  pinDot: {
    width: 14,
    height: 14,
    borderRadius: 7,
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
    fontSize: 12,
    color: Colors.error,
    textAlign: 'center',
    minHeight: 18,
    marginBottom: 8,
  },
  errorPlaceholder: {
    fontSize: 12,
    minHeight: 18,
    marginBottom: 8,
  },
  keypad: {
    gap: 10,
    marginBottom: 20,
  },
  keypadRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 22,
  },
  keyPlaceholder: {
    width: 68,
    height: 68,
  },
  key: {
    width: 68,
    height: 68,
    borderRadius: 34,
    backgroundColor: Colors.surface,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: Colors.borderLight,
  },
  keyText: {
    fontSize: 26,
    fontWeight: '600' as const,
    color: Colors.textPrimary,
  },
  bottomActions: {
    alignItems: 'center',
    gap: 14,
    width: '100%',
  },
  biometricBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 10,
    paddingHorizontal: 20,
  },
  biometricText: {
    fontSize: 14,
    fontWeight: '600' as const,
    color: Colors.primary,
  },
  linkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  linkBtn: {
    paddingVertical: 6,
  },
  linkText: {
    fontSize: 13,
    color: Colors.textTertiary,
  },
  linkDivider: {
    fontSize: 13,
    color: Colors.textTertiary,
  },
});
