import React, { useState, useRef, useCallback, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Animated,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  Alert,
  ScrollView,
  Keyboard,
  TouchableWithoutFeedback,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { Flame, Phone, ArrowRight, Shield } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import Colors from '@/constants/colors';
import { mmFontFamily, mmFontSize } from '@/constants/design';
import { useAuth } from '@/providers/AuthProvider';
import { useI18n } from '@/providers/I18nProvider';
import { router } from 'expo-router';

const LAST_PHONE_KEY = 'anygas_last_phone'; // vC15 Task B

export default function LoginScreen() {
  const { sendOtp, verifyOtp } = useAuth();
  const { t } = useI18n();
  const [phone, setPhone] = useState<string>('');
  const [otp, setOtp] = useState<string>('');
  const [step, setStep] = useState<'phone' | 'otp'>('phone');
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string>('');
  // vC15 Task B: welcome-back prefill state
  const [prefilledPhone, setPrefilledPhone] = useState<string | null>(null);
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(50)).current;
  const logoScale = useRef(new Animated.Value(0.5)).current;

  React.useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, { toValue: 1, duration: 800, useNativeDriver: true }),
      Animated.spring(slideAnim, { toValue: 0, tension: 50, friction: 8, useNativeDriver: true }),
      Animated.spring(logoScale, { toValue: 1, tension: 60, friction: 6, useNativeDriver: true }),
    ]).start();
  }, []);

  // vC15 Task B: load the last-used phone number for welcome-back prefill.
  // Stored on logout (AuthProvider) in display format (e.g. 095119900). Not a
  // secret — AsyncStorage is appropriate. Clears on "Not you?" tap.
  useEffect(() => {
    (async () => {
      try {
        const stored = await AsyncStorage.getItem(LAST_PHONE_KEY);
        if (stored && stored.length >= 6) {
          console.log('[Login] Welcome-back prefill loaded:', stored);
          setPhone(stored);
          setPrefilledPhone(stored);
        }
      } catch (e) {
        console.log('[Login] Failed to load prefill phone:', e);
      }
    })();
  }, []);

  // vC15 Task B: "Not you?" clears the prefill and shows the empty form.
  const handleNotYou = useCallback(() => {
    console.log('[Login] Clearing prefill — user wants another number');
    setPhone('');
    setPrefilledPhone(null);
    setErrorMsg('');
  }, []);

  const handleSendOtp = useCallback(async () => {
    if (phone.length < 6) return;
    if (Platform.OS !== 'web') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    setIsLoading(true);
    setErrorMsg('');
    try {
      await sendOtp(phone);
      // vC15 Task B: successful OTP send under a different number replaces
      // the stored prefill value.
      if (!prefilledPhone || prefilledPhone !== phone) {
        await AsyncStorage.setItem(LAST_PHONE_KEY, phone);
        setPrefilledPhone(phone);
      }
      setStep('otp');
      console.log('[Login] OTP sent to:', phone);
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : 'Failed to send OTP. Please try again.';
      console.log('[Login] OTP send error:', message);
      setErrorMsg(message);
      Alert.alert('Error', message);
    } finally {
      setIsLoading(false);
    }
  }, [phone, sendOtp, prefilledPhone]);

  const handleVerifyOtp = useCallback(async () => {
    if (otp.length < 4) return;
    if (Platform.OS !== 'web') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    }
    setIsLoading(true);
    setErrorMsg('');
    try {
      const result = await verifyOtp(phone, otp);
      console.log('[Login] OTP verified, linking state:', result.linkingState);

      if (result.linkingState === 'linked') {
        console.log('[Login] Customer auto-linked, going home');
        router.replace('/');
      } else if (result.linkingState === 'select_profile') {
        console.log('[Login] Multiple customers found, showing picker');
        router.replace('/customer-select');
      } else if (result.linkingState === 'register_new') {
        console.log('[Login] No customer found, showing registration');
        router.replace('/customer-register');
      } else {
        router.replace('/');
      }
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : 'Invalid OTP. Please try again.';
      console.log('[Login] OTP verify error:', message);
      setErrorMsg(message);
      Alert.alert('Verification Failed', message);
    } finally {
      setIsLoading(false);
    }
  }, [otp, phone, verifyOtp]);

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={0}
    >
      <StatusBar style="light" />
      <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
        <View style={styles.topSection}>
          <SafeAreaView edges={['top']}>
            <Animated.View style={[styles.logoContainer, { transform: [{ scale: logoScale }] }]}>
              <View style={styles.logoCircle}>
                <Flame size={48} color="#FFFFFF" strokeWidth={2.5} />
              </View>
              <Text style={styles.brandName}>AnyGas</Text>
              <Text style={styles.brandNumber}>8484</Text>
              <Text style={styles.brandTagline}>ဂက်စ်မှာမယ် • Order Gas</Text>
            </Animated.View>
          </SafeAreaView>
        </View>
      </TouchableWithoutFeedback>

      <Animated.View
        style={[
          styles.formCard,
          { opacity: fadeAnim, transform: [{ translateY: slideAnim }] },
        ]}
      >
        <ScrollView
          contentContainerStyle={styles.formContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          bounces={false}
        >
          {step === 'phone' ? (
            <>
              {/* vD1: Burmese leads — MM on top and larger, EN is the subtitle */}
              <Text style={styles.formTitleMM}>
                {prefilledPhone ? 'ပြန်လည် ကြိုဆိုပါတယ်' : 'ကြိုဆိုပါတယ်'}
              </Text>
              <Text style={styles.formTitle}>
                {prefilledPhone ? t('welcome_back') : 'Welcome'}
              </Text>
              <Text style={styles.formSubtitleMM}>
                {prefilledPhone ? 'OTP ပို့ရန် တစ်ချက်နှိပ်ပါ' : 'ဖုန်းနံပါတ် ထည့်သွင်းပါ'}
              </Text>
              <Text style={styles.formSubtitle}>
                {prefilledPhone
                  ? t('welcome_back_sub')
                  : 'Enter your phone number to get started'}
              </Text>

              <View style={styles.inputGroup}>
                <View style={styles.countryCode}>
                  <Text style={styles.flag}>🇲🇲</Text>
                </View>
                <TextInput
                  style={styles.phoneInput}
                  placeholder="09XX XXX XXXX"
                  placeholderTextColor={Colors.textTertiary}
                  keyboardType="phone-pad"
                  value={phone}
                  onChangeText={(t) => {
                    const cleaned = t.replace(/[^\d]/g, '');
                    setPhone(cleaned);
                    setErrorMsg('');
                  }}
                  maxLength={14}
                  testID="phone-input"
                />
              </View>

              {errorMsg ? <Text style={styles.errorText}>{errorMsg}</Text> : null}

              <TouchableOpacity
                style={[styles.primaryButton, phone.length < 6 && styles.buttonDisabled]}
                onPress={handleSendOtp}
                disabled={phone.length < 6 || isLoading}
                activeOpacity={0.8}
                testID="send-otp-button"
              >
                {isLoading ? (
                  <ActivityIndicator color="#FFFFFF" />
                ) : (
                  <>
                    <Text style={styles.buttonText}>Send OTP</Text>
                    <ArrowRight size={20} color="#FFFFFF" />
                  </>
                )}
              </TouchableOpacity>

              {/* vC15 Task B: "Not you?" link to clear the prefill */}
              {prefilledPhone ? (
                <TouchableOpacity
                  style={styles.notYouLink}
                  onPress={handleNotYou}
                  activeOpacity={0.7}
                >
                  <Text style={styles.notYouText}>{t('not_you')}</Text>
                </TouchableOpacity>
              ) : null}
            </>
          ) : (
            <>
              {/* vD1: Burmese leads — MM on top and larger */}
              <Text style={styles.formTitleMM}>
                ကုဒ်နံပါတ် ၆ လုံး ထည့်ပါ
              </Text>
              <Text style={styles.formTitle}>Verify OTP</Text>
              <Text style={styles.formSubtitleMM}>
                {phone} သို့ ပို့ထားသော ကုဒ် ထည့်ပါ
              </Text>
              <Text style={styles.formSubtitle}>
                Enter the 6-digit code sent to {phone}
              </Text>

              <TextInput
                style={styles.otpInput}
                placeholder="● ● ● ● ● ●"
                placeholderTextColor={Colors.textTertiary}
                keyboardType="number-pad"
                value={otp}
                onChangeText={(t) => { setOtp(t); setErrorMsg(''); }}
                maxLength={6}
                textAlign="center"
                testID="otp-input"
              />

              {errorMsg ? <Text style={styles.errorText}>{errorMsg}</Text> : null}

              <TouchableOpacity
                style={[styles.primaryButton, otp.length < 4 && styles.buttonDisabled]}
                onPress={handleVerifyOtp}
                disabled={otp.length < 4 || isLoading}
                activeOpacity={0.8}
                testID="verify-otp-button"
              >
                {isLoading ? (
                  <ActivityIndicator color="#FFFFFF" />
                ) : (
                  <>
                    <Text style={styles.buttonText}>Verify & Login</Text>
                    <Shield size={20} color="#FFFFFF" />
                  </>
                )}
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.backLink}
                onPress={() => { setStep('phone'); setOtp(''); setErrorMsg(''); }}
              >
                <Text style={styles.backLinkText}>Change phone number</Text>
              </TouchableOpacity>
            </>
          )}

          <View style={styles.termsRow}>
            <Text style={styles.termsText}>
              By continuing, you agree to our Terms of Service
            </Text>
          </View>
        </ScrollView>
      </Animated.View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.primary,
  },
  topSection: {
    flex: 0.42,
    justifyContent: 'center',
    alignItems: 'center',
  },
  logoContainer: {
    alignItems: 'center',
    paddingTop: 20,
  },
  logoCircle: {
    width: 96,
    height: 96,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.2)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  brandName: {
    fontSize: 36,
    fontWeight: '800' as const,
    color: '#FFFFFF',
    letterSpacing: -1,
  },
  brandNumber: {
    fontSize: 20,
    fontWeight: '600' as const,
    color: 'rgba(255,255,255,0.92)',
    marginTop: -4,
    letterSpacing: 4,
  },
  brandTagline: {
    fontSize: 14,
    fontFamily: mmFontFamily('medium'),
    color: 'rgba(255,255,255,0.92)',
    marginTop: 8,
  },
  formCard: {
    flex: 1,
    backgroundColor: Colors.surface,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
  },
  formContent: {
    paddingHorizontal: 28,
    paddingTop: 36,
    paddingBottom: 40,
  },
  // vD1: Burmese leads — MM title is primary (larger, bold, MM font)
  formTitleMM: {
    fontSize: 26,
    fontFamily: mmFontFamily('bold'),
    fontWeight: '700' as const,
    color: Colors.textPrimary,
    marginBottom: 4,
    lineHeight: 34,
  },
  formTitle: {
    fontSize: 18,
    fontWeight: '700' as const,
    color: Colors.textSecondary,
    marginBottom: 12,
  },
  formSubtitleMM: {
    fontSize: mmFontSize(15),
    fontFamily: mmFontFamily('regular'),
    color: Colors.textSecondary,
    lineHeight: 24,
    marginBottom: 2,
  },
  formSubtitle: {
    fontSize: 14,
    color: Colors.textTertiary,
    lineHeight: 20,
    marginBottom: 28,
  },
  inputGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 24,
    gap: 12,
  },
  countryCode: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.background,
    paddingHorizontal: 14,
    paddingVertical: 16,
    borderRadius: 12,
    gap: 6,
    borderWidth: 1.5,
    borderColor: Colors.border,
  },
  flag: {
    fontSize: 20,
  },
  phoneInput: {
    flex: 1,
    fontSize: 18,
    fontWeight: '500' as const,
    color: Colors.textPrimary,
    backgroundColor: Colors.background,
    paddingHorizontal: 16,
    paddingVertical: 16,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: Colors.border,
    letterSpacing: 1,
  },
  otpInput: {
    fontSize: 28,
    fontWeight: '600' as const,
    color: Colors.textPrimary,
    backgroundColor: Colors.background,
    paddingHorizontal: 20,
    paddingVertical: 18,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: Colors.border,
    letterSpacing: 8,
    marginBottom: 24,
  },
  errorText: {
    fontSize: 13,
    color: Colors.error,
    marginBottom: 12,
    marginTop: -8,
  },
  primaryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.primary,
    paddingVertical: 18,
    borderRadius: 16,
    gap: 10,
    shadowColor: Colors.primary,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.35,
    shadowRadius: 12,
    elevation: 8,
  },
  buttonDisabled: {
    backgroundColor: Colors.primaryMuted,
    shadowOpacity: 0,
    elevation: 0,
  },
  buttonText: {
    fontSize: 17,
    fontWeight: '700' as const,
    color: '#FFFFFF',
  },
  // vD1: 44pt touch floor for back link
  backLink: {
    alignItems: 'center',
    marginTop: 16,
    paddingVertical: 12,
    minHeight: 44,
    justifyContent: 'center',
  },
  backLinkText: {
    fontSize: 14,
    color: Colors.primary,
    fontWeight: '600' as const,
  },
  termsRow: {
    alignItems: 'center',
    marginTop: 24,
  },
  termsText: {
    fontSize: 12,
    color: Colors.textTertiary,
    textAlign: 'center',
  },
  // vC15 Task B: "Not you?" link
  // vD1: 44pt touch floor for not-you link
  notYouLink: {
    alignItems: 'center',
    marginTop: 14,
    paddingVertical: 12,
    minHeight: 44,
    justifyContent: 'center',
  },
  notYouText: {
    fontSize: 13,
    color: Colors.primary,
    fontWeight: '600' as const,
  },
});
