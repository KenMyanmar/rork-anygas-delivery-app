import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { Flame, UserPlus, ArrowRight } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import Colors from '@/constants/colors';
import { useAuth } from '@/providers/AuthProvider';

export default function CustomerRegisterScreen() {
  const { registerNewCustomer, phoneNumber } = useAuth();
  const [name, setName] = useState<string>('');
  const [township, setTownship] = useState<string>('');
  const [address, setAddress] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  const formattedPhone = phoneNumber
    ? (phoneNumber.startsWith('+95')
        ? '0' + phoneNumber.substring(3)
        : phoneNumber.startsWith('0') ? phoneNumber : '0' + phoneNumber)
    : '';

  const isValid = name.trim().length >= 2 && address.trim().length >= 5;

  const handleSubmit = useCallback(async () => {
    if (!isValid) return;
    if (Platform.OS !== 'web') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    }
    setIsSubmitting(true);
    try {
      console.log('[CustomerRegister] Submitting new customer:', name);
      await registerNewCustomer({
        name: name.trim(),
        phone: formattedPhone || phoneNumber,
        township: township.trim(),
        address: address.trim(),
      });
      console.log('[CustomerRegister] Customer registered, navigating home');
      if (Platform.OS !== 'web') {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }
      router.replace('/');
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : 'Registration failed. Please try again.';
      console.log('[CustomerRegister] Error:', message);
      Alert.alert('Registration Error', message);
    } finally {
      setIsSubmitting(false);
    }
  }, [isValid, name, formattedPhone, phoneNumber, township, address, registerNewCustomer]);

  return (
    <View style={styles.container}>
      <StatusBar style="light" />
      <View style={styles.topSection}>
        <SafeAreaView edges={['top']}>
          <View style={styles.headerContent}>
            <View style={styles.logoCircle}>
              <Flame size={32} color="#FFFFFF" strokeWidth={2.5} />
            </View>
            <Text style={styles.title}>New Customer</Text>
            <Text style={styles.titleMM}>ဖောက်သည်အသစ် မှတ်ပုံတင်ပါ</Text>
            <Text style={styles.subtitle}>
              No existing account found. Please fill in your details to get started.
            </Text>
          </View>
        </SafeAreaView>
      </View>

      <KeyboardAvoidingView
        style={styles.bottomSection}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={styles.formContent}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.inputGroup}>
            <Text style={styles.label}>Name / အမည်</Text>
            <TextInput
              style={styles.input}
              placeholder="Enter your name"
              placeholderTextColor={Colors.textTertiary}
              value={name}
              onChangeText={setName}
              testID="register-name"
            />
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>Phone / ဖုန်းနံပါတ်</Text>
            <View style={styles.phoneDisplay}>
              <Text style={styles.phoneText}>{formattedPhone || phoneNumber || 'N/A'}</Text>
            </View>
            <Text style={styles.hintText}>Auto-filled from your login phone</Text>
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>Township / မြို့နယ်</Text>
            <TextInput
              style={styles.input}
              placeholder="e.g. Hlaing, Insein, Bahan"
              placeholderTextColor={Colors.textTertiary}
              value={township}
              onChangeText={setTownship}
              testID="register-township"
            />
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>Address / လိပ်စာ</Text>
            <TextInput
              style={[styles.input, styles.addressInput]}
              placeholder="Building name, street, floor, room number"
              placeholderTextColor={Colors.textTertiary}
              value={address}
              onChangeText={setAddress}
              multiline
              numberOfLines={3}
              textAlignVertical="top"
              testID="register-address"
            />
          </View>

          <TouchableOpacity
            style={[styles.submitButton, !isValid && styles.buttonDisabled]}
            onPress={handleSubmit}
            disabled={!isValid || isSubmitting}
            activeOpacity={0.8}
            testID="register-submit"
          >
            {isSubmitting ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <>
                <UserPlus size={20} color="#FFFFFF" />
                <Text style={styles.submitText}>Register & Continue</Text>
                <ArrowRight size={18} color="#FFFFFF" />
              </>
            )}
          </TouchableOpacity>

          <View style={{ height: 40 }} />
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.primary,
  },
  topSection: {
    paddingBottom: 24,
  },
  headerContent: {
    alignItems: 'center',
    paddingTop: 20,
    paddingHorizontal: 28,
  },
  logoCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: 'rgba(255,255,255,0.2)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  title: {
    fontSize: 24,
    fontWeight: '800' as const,
    color: '#FFFFFF',
    textAlign: 'center',
  },
  titleMM: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.75)',
    marginTop: 4,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.7)',
    textAlign: 'center',
    marginTop: 10,
    lineHeight: 20,
  },
  bottomSection: {
    flex: 1,
    backgroundColor: Colors.surface,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
  },
  formContent: {
    padding: 24,
  },
  inputGroup: {
    marginBottom: 22,
  },
  label: {
    fontSize: 14,
    fontWeight: '700' as const,
    color: Colors.textPrimary,
    marginBottom: 8,
  },
  input: {
    backgroundColor: Colors.background,
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 16,
    color: Colors.textPrimary,
    borderWidth: 1.5,
    borderColor: Colors.border,
  },
  addressInput: {
    minHeight: 80,
    paddingTop: 14,
  },
  phoneDisplay: {
    backgroundColor: Colors.background,
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderWidth: 1.5,
    borderColor: Colors.borderLight,
  },
  phoneText: {
    fontSize: 16,
    color: Colors.textSecondary,
    fontWeight: '500' as const,
  },
  hintText: {
    fontSize: 12,
    color: Colors.textTertiary,
    marginTop: 4,
  },
  submitButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.primary,
    paddingVertical: 18,
    borderRadius: 16,
    gap: 10,
    marginTop: 8,
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
  submitText: {
    fontSize: 17,
    fontWeight: '700' as const,
    color: '#FFFFFF',
  },
});
