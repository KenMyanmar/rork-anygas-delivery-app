import React, { useState, useRef, useCallback } from 'react';
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
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { Flame, Phone, ArrowRight, Shield } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import Colors from '@/constants/colors';
import { useAuth } from '@/providers/AuthProvider';
import { router } from 'expo-router';

export default function LoginScreen() {
  const { sendOtp, verifyOtp } = useAuth();
  const [phone, setPhone] = useState<string>('');
  const [otp, setOtp] = useState<string>('');
  const [step, setStep] = useState<'phone' | 'otp'>('phone');
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string>('');
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

  const handleSendOtp = useCallback(async () => {
    if (phone.length < 6) return;
    if (Platform.OS !== 'web') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    setIsLoading(true);
    setErrorMsg('');
    try {
      await sendOtp(phone);
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
  }, [phone, sendOtp]);

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
              <Text style={styles.formTitle}>Welcome</Text>
              <Text style={styles.formSubtitle}>
                Enter your phone number to get started
              </Text>
              <Text style={styles.formSubtitleMM}>
                ဖုန်းနံပါတ် ထည့်သွင်းပါ
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
            </>
          ) : (
            <>
              <Text style={styles.formTitle}>Verify OTP</Text>
              <Text style={styles.formSubtitle}>
                Enter the 6-digit code sent to {phone}
              </Text>
              <Text style={styles.formSubtitleMM}>
                ကုဒ်နံပါတ် ၆ လုံး ထည့်ပါ
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
    borderRadius: 48,
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
    color: 'rgba(255,255,255,0.8)',
    marginTop: -4,
    letterSpacing: 4,
  },
  brandTagline: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.7)',
    marginTop: 8,
  },
  formCard: {
    flex: 1,
    backgroundColor: Colors.surface,
    borderTopLeftRadius: 32,
    borderTopRightRadius: 32,
  },
  formContent: {
    paddingHorizontal: 28,
    paddingTop: 36,
    paddingBottom: 40,
  },
  formTitle: {
    fontSize: 28,
    fontWeight: '700' as const,
    color: Colors.textPrimary,
    marginBottom: 8,
  },
  formSubtitle: {
    fontSize: 15,
    color: Colors.textSecondary,
    lineHeight: 22,
  },
  formSubtitleMM: {
    fontSize: 14,
    color: Colors.textTertiary,
    marginTop: 2,
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
    borderRadius: 14,
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
    borderRadius: 14,
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
    borderRadius: 14,
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
  backLink: {
    alignItems: 'center',
    marginTop: 16,
    paddingVertical: 8,
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
});
