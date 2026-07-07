/**
 * vC16 Task B — Registration screen with canon township picker + landmark.
 *
 * Collects the same 3 fields as the address form (address, township, landmark)
 * using the same components (canon township picker, landmark optional) so the
 * form is identical everywhere.
 */
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
import { Flame, UserPlus, ArrowRight, ChevronDown, Check } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import Colors from '@/constants/colors';
import { mmFontFamily, mmFontSize } from '@/constants/design';
import { useAuth } from '@/providers/AuthProvider';
import { useI18n } from '@/providers/I18nProvider';
import { YANGON_TOWNSHIPS } from '@/constants/townships';

export default function CustomerRegisterScreen() {
  const { registerNewCustomer, phoneNumber } = useAuth();
  const { t } = useI18n();
  const [name, setName] = useState<string>('');
  const [township, setTownship] = useState<string>('');
  const [townshipPickerOpen, setTownshipPickerOpen] = useState<boolean>(false);
  const [address, setAddress] = useState<string>('');
  const [landmark, setLandmark] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  const formattedPhone = phoneNumber
    ? (phoneNumber.startsWith('+95')
        ? '0' + phoneNumber.substring(3)
        : phoneNumber.startsWith('0') ? phoneNumber : '0' + phoneNumber)
    : '';

  const isValid = name.trim().length >= 2 && address.trim().length >= 5 && township.trim().length >= 2;

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
        landmark: landmark.trim() || null,
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
  }, [isValid, name, formattedPhone, phoneNumber, township, address, landmark, registerNewCustomer]);

  return (
    <View style={styles.container}>
      <StatusBar style="light" />
      <View style={styles.topSection}>
        <SafeAreaView edges={['top']}>
          <View style={styles.headerContent}>
            <View style={styles.logoCircle}>
              <Flame size={32} color="#FFFFFF" strokeWidth={2.5} />
            </View>
            {/* vD1: Burmese leads — MM on top and larger */}
            <Text style={styles.titleMM}>ဖောက်သည်အသစ် မှတ်ပုံတင်ပါ</Text>
            <Text style={styles.title}>New Customer</Text>
            <Text style={styles.subtitleMM}>
              အကောင့်အသစ်ဖွင့်ရန် သင့်အချက်အလက်များ ထည့်ပါ
            </Text>
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

          {/* vC16 Task B: canon township picker (replaces free-text input) */}
          <View style={styles.inputGroup}>
            <Text style={styles.label}>{t('select_township')}</Text>
            <TouchableOpacity
              style={styles.picker}
              onPress={() => setTownshipPickerOpen(!townshipPickerOpen)}
              activeOpacity={0.7}
              testID="register-township-picker"
            >
              <Text
                style={[styles.pickerText, !township && styles.pickerPlaceholder]}
                numberOfLines={1}
              >
                {township || t('select_township')}
              </Text>
              <ChevronDown size={18} color={Colors.textTertiary} />
            </TouchableOpacity>
            {townshipPickerOpen && (
              <ScrollView style={styles.townshipList} nestedScrollEnabled>
                {YANGON_TOWNSHIPS.map((tw) => (
                  <TouchableOpacity
                    key={tw}
                    style={[
                      styles.townshipItem,
                      township === tw && styles.townshipItemSelected,
                    ]}
                    onPress={() => {
                      setTownship(tw);
                      setTownshipPickerOpen(false);
                      if (Platform.OS !== 'web') {
                        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                      }
                    }}
                    activeOpacity={0.7}
                  >
                    <Text
                      style={[
                        styles.townshipItemText,
                        township === tw && styles.townshipItemTextSelected,
                      ]}
                    >
                      {tw}
                    </Text>
                    {township === tw && <Check size={16} color={Colors.primary} />}
                  </TouchableOpacity>
                ))}
              </ScrollView>
            )}
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>{t('address_label')}</Text>
            <TextInput
              style={[styles.input, styles.addressInput]}
              placeholder={t('address_placeholder')}
              placeholderTextColor={Colors.textTertiary}
              value={address}
              onChangeText={setAddress}
              multiline
              numberOfLines={3}
              textAlignVertical="top"
              testID="register-address"
            />
          </View>

          {/* vC16 Task B: landmark field (optional, same as address form) */}
          <View style={styles.inputGroup}>
            <Text style={styles.label}>{t('landmark_label')}</Text>
            <TextInput
              style={styles.input}
              placeholder={t('landmark_placeholder')}
              placeholderTextColor={Colors.textTertiary}
              value={landmark}
              onChangeText={setLandmark}
              maxLength={100}
              testID="register-landmark"
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
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.2)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  // vD1: Burmese leads — MM title is primary (larger, bold, MM font)
  titleMM: {
    fontSize: mmFontSize(24),
    fontFamily: mmFontFamily('bold'),
    fontWeight: '800' as const,
    color: '#FFFFFF',
    textAlign: 'center',
    lineHeight: 32,
  },
  title: {
    fontSize: 17,
    fontWeight: '700' as const,
    color: 'rgba(255,255,255,0.92)',
    textAlign: 'center',
    marginTop: 4,
  },
  subtitleMM: {
    fontSize: mmFontSize(14),
    fontFamily: mmFontFamily('regular'),
    color: 'rgba(255,255,255,0.92)',
    textAlign: 'center',
    marginTop: 8,
    lineHeight: 22,
  },
  subtitle: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.92)',
    textAlign: 'center',
    marginTop: 2,
    lineHeight: 18,
  },
  bottomSection: {
    flex: 1,
    backgroundColor: Colors.surface,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
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
    borderRadius: 12,
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
    borderRadius: 12,
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
  // vC16 Task B: canon township picker
  picker: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: Colors.background,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 16,
    borderWidth: 1.5,
    borderColor: Colors.border,
  },
  pickerText: {
    fontSize: 16,
    color: Colors.textPrimary,
    flex: 1,
  },
  pickerPlaceholder: {
    color: Colors.textTertiary,
  },
  townshipList: {
    marginTop: 8,
    maxHeight: 220,
    backgroundColor: Colors.surface,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: Colors.border,
  },
  townshipItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: Colors.borderLight,
  },
  townshipItemSelected: {
    backgroundColor: Colors.primaryLight,
  },
  townshipItemText: {
    fontSize: 15,
    color: Colors.textSecondary,
  },
  townshipItemTextSelected: {
    color: Colors.primary,
    fontWeight: '700' as const,
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
