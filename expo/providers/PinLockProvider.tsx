/**
 * vC14 Task A — PIN / biometric app-lock (KBZ Pay pattern).
 *
 * Purely LOCAL gate on top of the Supabase session (which vC13 refresh keeps
 * alive forever). OTP (20 MMK) fires only for: new device, sign-out, or
 * forgot-PIN. Zero server writes, zero schema, zero SMS.
 *
 * - PIN stored ONLY as salted SHA-256 hash in SecureStore (never AsyncStorage,
 *   never plaintext, never the server).
 * - Biometric unlock (expo-local-authentication) when device has enrolled
 *   biometrics and user opted in. PIN is always the fallback.
 * - Lock on cold start + when returning from background after >60s.
 * - 5 wrong PIN attempts → clear PIN hash + sign out → re-OTP required.
 * - "Forgot PIN" → same path: sign out → OTP re-login → new PIN setup.
 */
import { useState, useEffect, useCallback, useRef } from 'react';
import { AppState, AppStateStatus, Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import * as Crypto from 'expo-crypto';
import * as LocalAuthentication from 'expo-local-authentication';
import createContextHook from '@nkzw/create-context-hook';

const PIN_HASH_KEY = 'anygas_pin_hash';
const PIN_SALT_KEY = 'anygas_pin_salt';
const BIOMETRIC_PREF_KEY = 'anygas_biometric_unlock';
const PIN_ATTEMPTS_KEY = 'anygas_pin_attempts'; // vC15 Task C: persisted attempt counter
const LAST_PHONE_KEY = 'anygas_last_phone'; // vC15 Task B: welcome-back prefill (AsyncStorage, not SecureStore)
const BACKGROUND_THRESHOLD_MS = 60_000; // lock after >60s in background
const MAX_PIN_ATTEMPTS = 5;

export type PinLockState = 'loading' | 'no_pin' | 'locked' | 'unlocked';

/**
 * Hash a PIN with a random salt using SHA-256.
 * Returns "salt:hash" combined string for storage.
 */
async function hashPin(pin: string, salt?: string): Promise<{ salt: string; hash: string }> {
  const useSalt = salt || Crypto.randomUUID();
  const combined = `${useSalt}:${pin}`;
  const hash = await Crypto.digestStringAsync(
    Crypto.CryptoDigestAlgorithm.SHA256,
    combined,
    { encoding: Crypto.CryptoEncoding.HEX },
  );
  return { salt: useSalt, hash };
}

/** Store the salted PIN hash in SecureStore. */
async function storePinHash(pin: string): Promise<void> {
  const { salt, hash } = await hashPin(pin);
  await SecureStore.setItemAsync(PIN_SALT_KEY, salt);
  await SecureStore.setItemAsync(PIN_HASH_KEY, hash);
}

/** Verify a PIN attempt against the stored salt+hash. */
async function verifyPin(pin: string): Promise<boolean> {
  try {
    const salt = await SecureStore.getItemAsync(PIN_SALT_KEY);
    const storedHash = await SecureStore.getItemAsync(PIN_HASH_KEY);
    if (!salt || !storedHash) return false;
    const { hash } = await hashPin(pin, salt);
    return hash === storedHash;
  } catch (e) {
    console.log('[PinLock] verifyPin error:', e);
    return false;
  }
}

/** Check if a PIN has been set up. */
async function hasPinSet(): Promise<boolean> {
  try {
    const hash = await SecureStore.getItemAsync(PIN_HASH_KEY);
    return !!hash;
  } catch {
    return false;
  }
}

/** Clear all PIN-related SecureStore entries. */
async function clearPin(): Promise<void> {
  try {
    await SecureStore.deleteItemAsync(PIN_HASH_KEY);
    await SecureStore.deleteItemAsync(PIN_SALT_KEY);
    await SecureStore.deleteItemAsync(BIOMETRIC_PREF_KEY);
    await clearStoredAttempts();
    console.log('[PinLock] PIN cleared');
  } catch (e) {
    console.log('[PinLock] clearPin error:', e);
  }
}

/** vC15 Task C — Persisted wrong-attempt counter (survives app restart). */
async function getStoredAttempts(): Promise<number> {
  try {
    const val = await SecureStore.getItemAsync(PIN_ATTEMPTS_KEY);
    return val ? parseInt(val, 10) || 0 : 0;
  } catch {
    return 0;
  }
}

async function setStoredAttempts(n: number): Promise<void> {
  try {
    await SecureStore.setItemAsync(PIN_ATTEMPTS_KEY, String(n));
  } catch (e) {
    console.log('[PinLock] setStoredAttempts error:', e);
  }
}

async function clearStoredAttempts(): Promise<void> {
  try {
    await SecureStore.deleteItemAsync(PIN_ATTEMPTS_KEY);
  } catch (e) {
    console.log('[PinLock] clearStoredAttempts error:', e);
  }
}

/** Read biometric unlock preference. */
async function getBiometricPref(): Promise<boolean> {
  try {
    const val = await SecureStore.getItemAsync(BIOMETRIC_PREF_KEY);
    return val === 'true';
  } catch {
    return false;
  }
}

/** Store biometric unlock preference. */
async function setBiometricPref(enabled: boolean): Promise<void> {
  await SecureStore.setItemAsync(BIOMETRIC_PREF_KEY, enabled ? 'true' : 'false');
}

/** Check if device has enrolled biometrics. */
async function isBiometricAvailable(): Promise<boolean> {
  try {
    if (Platform.OS === 'web') return false;
    const hasHardware = await LocalAuthentication.hasHardwareAsync();
    if (!hasHardware) return false;
    const enrolled = await LocalAuthentication.isEnrolledAsync();
    return enrolled;
  } catch {
    return false;
  }
}

/** Trigger the native biometric prompt. Returns true on success. */
async function authenticateBiometric(
  promptMessage: string,
): Promise<boolean> {
  try {
    if (Platform.OS === 'web') return false;
    const result = await LocalAuthentication.authenticateAsync({
      promptMessage,
      cancelLabel: 'Cancel',
      fallbackLabel: 'Use PIN',
      disableDeviceFallback: false,
    });
    return result.success;
  } catch (e) {
    console.log('[PinLock] Biometric auth error:', e);
    return false;
  }
}

export const [PinLockProvider, usePinLock] = createContextHook(() => {
  const [lockState, setLockState] = useState<PinLockState>('loading');
  const [attempts, setAttempts] = useState<number>(0);
  const [biometricEnabled, setBiometricEnabled] = useState<boolean>(false);
  const [biometricAvailable, setBiometricAvailable] = useState<boolean>(false);
  const backgroundTimeRef = useRef<number | null>(null);

  // Initialize: check if PIN is set, load biometric prefs, load persisted attempts
  const initialize = useCallback(async () => {
    console.log('[PinLock] Initializing...');
    // vC15.1 — PIN lock is a native-only feature. On web (browser preview),
    // bypass entirely: no SecureStore reads, no setup, no lock screen. The web
    // preview exists for layout checks only; PIN behavior is tested on device.
    if (Platform.OS === 'web') {
      console.log('[PinLock] web platform → unlocked (PIN lock is native-only)');
      setBiometricAvailable(false);
      setLockState('unlocked');
      return;
    }
    const hasPin = await hasPinSet();
    const bioAvail = await isBiometricAvailable();
    setBiometricAvailable(bioAvail);

    if (!hasPin) {
      console.log('[PinLock] No PIN set → state=no_pin');
      setLockState('no_pin');
      return;
    }

    const bioPref = await getBiometricPref();
    setBiometricEnabled(bioPref);
    // vC15 Task C: restore persisted attempt counter so restart doesn't reset it
    const storedAttempts = await getStoredAttempts();
    setAttempts(storedAttempts);
    console.log('[PinLock] PIN exists, biometric pref:', bioPref, 'stored attempts:', storedAttempts);
    setLockState('locked');
  }, []);

  // Track background → foreground transitions for the 60s lock rule
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextState: AppStateStatus) => {
      if (nextState === 'background' || nextState === 'inactive') {
        backgroundTimeRef.current = Date.now();
        console.log('[PinLock] App went background at', backgroundTimeRef.current);
      } else if (nextState === 'active' && backgroundTimeRef.current !== null) {
        const elapsed = Date.now() - backgroundTimeRef.current;
        backgroundTimeRef.current = null;
        console.log('[PinLock] App returned to active after', elapsed, 'ms');
        if (elapsed > BACKGROUND_THRESHOLD_MS && lockState === 'unlocked') {
          console.log('[PinLock] Background >60s → locking');
          setLockState('locked');
          setAttempts(0);
        }
      }
    });
    return () => subscription.remove();
  }, [lockState]);

  // On mount, initialize lock state
  useEffect(() => {
    initialize();
  }, [initialize]);

  /** Set up a new PIN (setup flow). Stores salted hash in SecureStore. */
  const setupPin = useCallback(async (pin: string): Promise<boolean> => {
    if (pin.length !== 4 || !/^\d{4}$/.test(pin)) {
      console.log('[PinLock] setupPin: invalid PIN');
      return false;
    }
    try {
      await storePinHash(pin);
      await clearStoredAttempts(); // vC15 Task C
      console.log('[PinLock] PIN set up successfully');
      setAttempts(0);
      setLockState('unlocked');
      return true;
    } catch (e) {
      console.log('[PinLock] setupPin error:', e);
      return false;
    }
  }, []);

  /**
   * Attempt to unlock with a PIN.
   * Returns { success, attemptsLeft, lockedOut }.
   * On 5 wrong attempts: clears PIN + triggers signOut callback.
   * vC15 Task C: counter persisted in SecureStore — survives app restart.
   */
  const unlockWithPin = useCallback(async (
    pin: string,
    onLockedOut?: () => Promise<void>,
  ): Promise<{ success: boolean; attemptsLeft: number; lockedOut: boolean }> => {
    const valid = await verifyPin(pin);
    if (valid) {
      console.log('[PinLock] PIN correct → unlocked');
      setAttempts(0);
      await clearStoredAttempts();
      setLockState('unlocked');
      return { success: true, attemptsLeft: MAX_PIN_ATTEMPTS, lockedOut: false };
    }

    // vC15 Task C: read the persisted counter so a restart doesn't reset it.
    const currentStored = await getStoredAttempts();
    const newAttempts = currentStored + 1;
    await setStoredAttempts(newAttempts);
    setAttempts(newAttempts);
    console.log('[PinLock] Wrong PIN, attempt', newAttempts, 'of', MAX_PIN_ATTEMPTS, '(persisted)');

    if (newAttempts >= MAX_PIN_ATTEMPTS) {
      console.log('[PinLock] 5 wrong attempts → lockout: clear PIN + sign out');
      await clearPin();
      setAttempts(0);
      setLockState('no_pin');
      if (onLockedOut) {
        await onLockedOut();
      }
      return { success: false, attemptsLeft: 0, lockedOut: true };
    }

    return {
      success: false,
      attemptsLeft: MAX_PIN_ATTEMPTS - newAttempts,
      lockedOut: false,
    };
  }, []);

  /** Attempt biometric unlock. Returns true on success. */
  const unlockWithBiometric = useCallback(async (
    promptMessage: string,
  ): Promise<boolean> => {
    if (!biometricEnabled || !biometricAvailable) return false;
    const success = await authenticateBiometric(promptMessage);
    if (success) {
      console.log('[PinLock] Biometric unlock success');
      setAttempts(0);
      await clearStoredAttempts(); // vC15 Task C
      setLockState('unlocked');
    }
    return success;
  }, [biometricEnabled, biometricAvailable]);

  /** Toggle biometric unlock preference (only if device supports it). */
  const toggleBiometric = useCallback(async (enabled: boolean): Promise<void> => {
    if (enabled && !biometricAvailable) {
      console.log('[PinLock] Cannot enable biometric — not available');
      return;
    }
    await setBiometricPref(enabled);
    setBiometricEnabled(enabled);
    console.log('[PinLock] Biometric preference set to', enabled);
  }, [biometricAvailable]);

  /**
   * Forgot PIN path: clear PIN + sign out. User must re-OTP and set up a new PIN.
   * Returns void; the caller performs the signOut.
   */
  const forgotPin = useCallback(async (): Promise<void> => {
    console.log('[PinLock] Forgot PIN → clearing PIN + resetting to no_pin');
    await clearPin();
    setAttempts(0);
    setLockState('no_pin');
  }, []); // clearPin now also clears persisted attempts (vC15 Task C)

  /** Clear PIN on explicit sign-out (called from AuthProvider.logout). */
  const clearPinOnSignOut = useCallback(async (): Promise<void> => {
    await clearPin(); // vC15 Task C: also clears persisted attempts
    setAttempts(0);
    setBiometricEnabled(false);
    setLockState('no_pin');
  }, []);

  /** Manually lock (e.g. from Profile "Lock app" button — vC15 Task A). */
  const lock = useCallback(() => {
    setLockState('locked');
    setAttempts(0);
    // vC15 Task C: also clear persisted attempts on voluntary lock — a fresh
    // unlock attempt should start at 0, not carry stale failures.
    clearStoredAttempts();
  }, []);

  /** Re-run the initialization (e.g. after a new OTP login completes). */
  const recheckPin = useCallback(async () => {
    await initialize();
  }, [initialize]);

  const maxAttempts = MAX_PIN_ATTEMPTS;

  return {
    lockState,
    attempts,
    maxAttempts,
    biometricEnabled,
    biometricAvailable,
    setupPin,
    unlockWithPin,
    unlockWithBiometric,
    toggleBiometric,
    forgotPin,
    clearPinOnSignOut,
    lock,
    recheckPin,
  };
});
