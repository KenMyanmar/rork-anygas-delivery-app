import React, { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Linking,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { ChevronLeft, CircleAlert, Phone, ShieldCheck, Trash2 } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import Colors from '@/constants/colors';
import { mmFontFamily, mmFontSize } from '@/constants/design';
import { supabase } from '@/lib/supabase';
import { devLog } from '@/lib/logger';
import { useAuth } from '@/providers/AuthProvider';
import { useI18n } from '@/providers/I18nProvider';
import { usePinLock } from '@/providers/PinLockProvider';

type Step = 'warning' | 'pin' | 'confirm' | 'success';
type DeleteError = 'active_orders' | 'session' | 'server' | null;

function readErrorCode(payload: unknown): string {
  if (typeof payload === 'string') return payload;
  if (!payload || typeof payload !== 'object') return '';
  const value = payload as Record<string, unknown>;
  for (const key of ['code', 'error', 'message']) {
    const nested = readErrorCode(value[key]);
    if (nested) return nested;
  }
  return '';
}

export default function DeleteAccountScreen() {
  const { isMM } = useI18n();
  const { logout, removeAccount, clearDeletedAccountLocally } = useAuth();
  const { unlockWithPin } = usePinLock();
  const [step, setStep] = useState<Step>('warning');
  const [pin, setPin] = useState('');
  const [pinError, setPinError] = useState('');
  const [isVerifyingPin, setIsVerifyingPin] = useState(false);
  const [confirmation, setConfirmation] = useState('');
  const [deleteError, setDeleteError] = useState<DeleteError>(null);
  const [serverMessage, setServerMessage] = useState('');
  const [isDeleting, setIsDeleting] = useState(false);

  const expectedConfirmation = isMM ? 'ဖျက်မည်' : 'DELETE';
  const confirmationMatches = useMemo(
    () => confirmation.trim() === expectedConfirmation,
    [confirmation, expectedConfirmation],
  );

  const goBack = useCallback(() => {
    if (isDeleting || step === 'success') return;
    if (step === 'warning') {
      router.back();
      return;
    }
    if (step === 'pin') setStep('warning');
    if (step === 'confirm') setStep('pin');
    setPin('');
    setPinError('');
    setDeleteError(null);
    setServerMessage('');
  }, [isDeleting, step]);

  const verifyPin = useCallback(async () => {
    if (pin.length !== 4 || isVerifyingPin) return;
    setIsVerifyingPin(true);
    setPinError('');
    const result = await unlockWithPin(pin, async () => {
      await logout();
      router.replace('/login');
    });
    setIsVerifyingPin(false);

    if (result.success) {
      if (Platform.OS !== 'web') {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }
      setPin('');
      setStep('confirm');
      return;
    }

    if (Platform.OS !== 'web') {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    }
    setPin('');
    if (result.lockedOut) {
      setPinError(isMM
        ? 'PIN ၅ ကြိမ် မှားယွင်းခဲ့သဖြင့် လုံခြုံရေးအရ ထွက်သွားပါပြီ။'
        : 'Too many wrong attempts. You have been signed out for security.');
    } else {
      setPinError(isMM
        ? `PIN မမှန်ပါ။ ကြိုးစားရန် ${result.attemptsLeft} ကြိမ်ကျန်ပါသည်။`
        : `Wrong PIN. ${result.attemptsLeft} attempts remaining.`);
    }
  }, [pin, isVerifyingPin, unlockWithPin, logout, isMM]);

  const deleteAccount = useCallback(async () => {
    if (!confirmationMatches || isDeleting) return;
    setIsDeleting(true);
    setDeleteError(null);
    setServerMessage('');

    try {
      // getSession refreshes an expired access token through the existing,
      // verified session-refresh engine before this irreversible request.
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) {
        setDeleteError('session');
        return;
      }

      const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
      const anonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
      if (!supabaseUrl || !anonKey) {
        throw new Error('Account deletion service is not configured.');
      }

      const response = await fetch(`${supabaseUrl}/functions/v1/delete-customer-account`, {
        method: 'POST',
        headers: {
          apikey: anonKey,
          Authorization: `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
        },
      });

      const responseText = await response.text();
      let payload: unknown = null;
      if (responseText) {
        try {
          payload = JSON.parse(responseText);
        } catch {
          payload = responseText;
        }
      }

      if (response.ok) {
        devLog('[DeleteAccount] Account deletion completed');
        setStep('success');
        if (Platform.OS !== 'web') {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        }
        // The server deletion has succeeded, so local cleanup is best-effort:
        // even if device storage reports an error, never misreport this as a
        // failed deletion or leave the user on a retry screen.
        try {
          await clearDeletedAccountLocally();
        } catch (cleanupError) {
          devLog('[DeleteAccount] Server deletion succeeded; local cleanup reported:', cleanupError);
        } finally {
          setTimeout(() => router.replace('/login'), 1400);
        }
        return;
      }

      const code = readErrorCode(payload);
      devLog('[DeleteAccount] Request failed:', response.status, code);
      if (response.status === 409 && code.includes('active_orders')) {
        setDeleteError('active_orders');
        return;
      }
      if (response.status === 401) {
        setDeleteError('session');
        return;
      }

      setDeleteError('server');
      setServerMessage(code);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Network error';
      devLog('[DeleteAccount] Network/server failure:', message);
      setDeleteError('server');
      setServerMessage(message);
    } finally {
      setIsDeleting(false);
    }
  }, [confirmationMatches, isDeleting, clearDeletedAccountLocally]);

  if (step === 'success') {
    return (
      <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
        <StatusBar style="dark" />
        <View style={styles.successContent}>
          <View style={styles.successIcon}>
            <ShieldCheck size={38} color={Colors.success} />
          </View>
          <Text style={styles.titleMM}>အကောင့်ကို ဖျက်ပြီးပါပြီ</Text>
          <Text style={styles.titleEN}>Account deleted — thank you</Text>
          <Text style={styles.successBody}>
            ဤစက်မှ အချက်အလက်များကို ရှင်းလင်းနေပါသည်။{`\n`}
            Clearing account data from this device…
          </Text>
          <ActivityIndicator color={Colors.primary} style={styles.successSpinner} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
      <StatusBar style="dark" />
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={goBack}
          disabled={isDeleting}
          accessibilityRole="button"
          accessibilityLabel="Back"
        >
          <ChevronLeft size={24} color={Colors.textPrimary} />
        </TouchableOpacity>
        <View style={styles.headerTitles}>
          <Text style={styles.headerTitleMM}>အကောင့် အပြီးဖျက်ရန်</Text>
          <Text style={styles.headerTitleEN}>Permanently delete account</Text>
        </View>
        <View style={styles.headerSpacer} />
      </View>

      <View style={styles.progressRow}>
        {(['warning', 'pin', 'confirm'] as Step[]).map((item, index) => {
          const current = ['warning', 'pin', 'confirm'].indexOf(step);
          return <View key={item} style={[styles.progressBar, index <= current && styles.progressBarActive]} />;
        })}
      </View>

      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {step === 'warning' && (
            <>
              <View style={styles.dangerIcon}>
                <CircleAlert size={34} color={Colors.error} />
              </View>
              <Text style={styles.titleMM}>ဤလုပ်ဆောင်ချက်ကို ပြန်ပြင်၍ မရပါ</Text>
              <Text style={styles.titleEN}>This cannot be undone</Text>
              <View style={styles.warningCard}>
                <WarningRow mm="မှာယူမှုမှတ်တမ်းကို အမည်မဲ့ သိမ်းထားမည်" en="Your order history becomes anonymous" />
                <WarningRow mm="SMS များ ထပ်မံရရှိမည် မဟုတ်ပါ" en="You will receive no more SMS" />
                <WarningRow mm="8484 ဟော့လိုင်း ဖောက်သည်မှတ်တမ်းကို ထိန်းသိမ်းထားမည်" en="Your 8484 hotline customer record is kept" />
                <WarningRow mm="ဤအကောင့်နှင့် အက်ပ်အချက်အလက်များကို အပြီးဖျက်မည်" en="Your account and app data will be permanently deleted" />
              </View>
              <TouchableOpacity
                style={styles.primaryDangerButton}
                onPress={() => setStep('pin')}
                accessibilityRole="button"
                accessibilityLabel="Continue to PIN verification"
              >
                <Text style={styles.primaryDangerTextMM}>PIN ဖြင့် အတည်ပြုမည်</Text>
                <Text style={styles.primaryDangerTextEN}>Continue with PIN</Text>
              </TouchableOpacity>
            </>
          )}

          {step === 'pin' && (
            <>
              <View style={styles.dangerIcon}>
                <ShieldCheck size={34} color={Colors.primary} />
              </View>
              <Text style={styles.titleMM}>သင့် PIN ကို ထပ်ထည့်ပါ</Text>
              <Text style={styles.titleEN}>Re-enter your 4-digit PIN</Text>
              <Text style={styles.bodyText}>
                အကောင့်ပိုင်ရှင်ဖြစ်ကြောင်း အတည်ပြုရန် PIN လိုအပ်ပါသည်။{`\n`}
                Your PIN confirms that this request is really yours.
              </Text>
              <TextInput
                style={[styles.pinInput, pinError ? styles.inputError : null]}
                value={pin}
                onChangeText={(value) => {
                  setPin(value.replace(/\D/g, '').slice(0, 4));
                  setPinError('');
                }}
                keyboardType="number-pad"
                secureTextEntry
                maxLength={4}
                textContentType="oneTimeCode"
                autoFocus
                editable={!isVerifyingPin}
                accessibilityLabel="Four digit PIN"
              />
              {pinError ? <Text style={styles.errorText}>{pinError}</Text> : null}
              <TouchableOpacity
                style={[styles.primaryButton, pin.length !== 4 && styles.buttonDisabled]}
                onPress={verifyPin}
                disabled={pin.length !== 4 || isVerifyingPin}
                accessibilityRole="button"
              >
                {isVerifyingPin ? (
                  <ActivityIndicator color="#FFFFFF" />
                ) : (
                  <>
                    <Text style={styles.primaryTextMM}>PIN အတည်ပြုမည်</Text>
                    <Text style={styles.primaryTextEN}>Verify PIN</Text>
                  </>
                )}
              </TouchableOpacity>
            </>
          )}

          {step === 'confirm' && (
            <>
              <View style={styles.dangerIcon}>
                <Trash2 size={34} color={Colors.error} />
              </View>
              <Text style={styles.titleMM}>နောက်ဆုံး အတည်ပြုချက်</Text>
              <Text style={styles.titleEN}>Final confirmation</Text>
              <Text style={styles.bodyText}>
                ဆက်လုပ်ရန် <Text style={styles.confirmWord}>{expectedConfirmation}</Text> ဟု ရိုက်ထည့်ပါ။{`\n`}
                Type <Text style={styles.confirmWord}>{expectedConfirmation}</Text> to enable permanent deletion.
              </Text>
              <TextInput
                style={styles.confirmInput}
                value={confirmation}
                onChangeText={(value) => {
                  setConfirmation(value);
                  setDeleteError(null);
                  setServerMessage('');
                }}
                placeholder={expectedConfirmation}
                placeholderTextColor={Colors.textTertiary}
                autoCapitalize={isMM ? 'none' : 'characters'}
                autoCorrect={false}
                editable={!isDeleting}
                accessibilityLabel={`Type ${expectedConfirmation} to confirm`}
              />

              {deleteError === 'active_orders' && (
                <View style={styles.errorCard}>
                  <Text style={styles.errorTitleMM}>လုပ်ဆောင်ဆဲ မှာယူမှု ရှိနေပါသည်</Text>
                  <Text style={styles.errorTitleEN}>Please complete or cancel your active order first</Text>
                  <TouchableOpacity style={styles.callButton} onPress={() => Linking.openURL('tel:8484')}>
                    <Phone size={18} color={Colors.primary} />
                    <Text style={styles.callButtonText}>8484 သို့ ခေါ်မည် · Call 8484</Text>
                  </TouchableOpacity>
                </View>
              )}

              {deleteError === 'session' && (
                <View style={styles.errorCard}>
                  <Text style={styles.errorTitleMM}>လုံခြုံရေး session သက်တမ်းကုန်သွားပါပြီ</Text>
                  <Text style={styles.errorTitleEN}>Your session expired. Sign in again before retrying.</Text>
                  <TouchableOpacity style={styles.callButton} onPress={async () => {
                    await removeAccount();
                    router.replace('/login');
                  }}>
                    <Text style={styles.callButtonText}>ပြန်လည် လော့ဂ်အင်မည် · Return to login</Text>
                  </TouchableOpacity>
                </View>
              )}

              {deleteError === 'server' && (
                <View style={styles.errorCard}>
                  <Text style={styles.errorTitleMM}>အကောင့်ကို မဖျက်နိုင်သေးပါ</Text>
                  <Text style={styles.errorTitleEN}>Something went wrong. Nothing was deleted. Please retry.</Text>
                  {serverMessage ? <Text style={styles.serverMessage}>{serverMessage}</Text> : null}
                </View>
              )}

              <TouchableOpacity
                style={[styles.primaryDangerButton, !confirmationMatches && styles.buttonDisabled]}
                onPress={deleteAccount}
                disabled={!confirmationMatches || isDeleting}
                accessibilityRole="button"
                accessibilityState={{ disabled: !confirmationMatches || isDeleting }}
              >
                {isDeleting ? (
                  <ActivityIndicator color="#FFFFFF" />
                ) : (
                  <>
                    <Text style={styles.primaryDangerTextMM}>
                      {deleteError === 'server' ? 'ပြန်လည်ကြိုးစားမည်' : 'အကောင့်ကို အပြီးဖျက်မည်'}
                    </Text>
                    <Text style={styles.primaryDangerTextEN}>
                      {deleteError === 'server' ? 'Retry deletion' : 'Delete account permanently'}
                    </Text>
                  </>
                )}
              </TouchableOpacity>
            </>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function WarningRow({ mm, en }: { mm: string; en: string }) {
  return (
    <View style={styles.warningRow}>
      <View style={styles.warningDot} />
      <View style={styles.warningTextWrap}>
        <Text style={styles.warningMM}>{mm}</Text>
        <Text style={styles.warningEN}>{en}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  safeArea: { flex: 1, backgroundColor: Colors.background },
  header: {
    minHeight: 68,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: Colors.borderLight,
  },
  backButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  headerTitles: { flex: 1, alignItems: 'center' },
  headerSpacer: { width: 44 },
  headerTitleMM: { fontSize: mmFontSize(16), fontFamily: mmFontFamily('bold'), color: Colors.textPrimary },
  headerTitleEN: { marginTop: 2, fontSize: 11, color: Colors.textSecondary },
  progressRow: { flexDirection: 'row', gap: 8, paddingHorizontal: 20, paddingTop: 16 },
  progressBar: { flex: 1, height: 4, borderRadius: 999, backgroundColor: Colors.border },
  progressBarActive: { backgroundColor: Colors.error },
  content: { flexGrow: 1, padding: 20, paddingBottom: 44 },
  dangerIcon: {
    width: 64,
    height: 64,
    borderRadius: 999,
    alignSelf: 'center',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.errorLight,
    marginTop: 8,
    marginBottom: 18,
  },
  titleMM: { textAlign: 'center', fontSize: mmFontSize(22), fontFamily: mmFontFamily('bold'), color: Colors.textPrimary },
  titleEN: { marginTop: 6, textAlign: 'center', fontSize: 16, fontWeight: '700', color: Colors.textSecondary },
  bodyText: { marginTop: 16, textAlign: 'center', fontSize: 14, lineHeight: 23, color: Colors.textSecondary },
  warningCard: {
    marginTop: 24,
    padding: 18,
    borderRadius: 16,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.borderLight,
    gap: 18,
  },
  warningRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  warningDot: { width: 8, height: 8, borderRadius: 999, backgroundColor: Colors.error, marginTop: 8 },
  warningTextWrap: { flex: 1 },
  warningMM: { fontSize: mmFontSize(14), lineHeight: 24, fontFamily: mmFontFamily('medium'), color: Colors.textPrimary },
  warningEN: { marginTop: 3, fontSize: 12, lineHeight: 18, color: Colors.textSecondary },
  primaryButton: {
    minHeight: 58,
    marginTop: 24,
    borderRadius: 16,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 18,
  },
  primaryDangerButton: {
    minHeight: 62,
    marginTop: 24,
    borderRadius: 16,
    backgroundColor: Colors.error,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 18,
  },
  buttonDisabled: { opacity: 0.42 },
  primaryTextMM: { fontSize: mmFontSize(15), fontFamily: mmFontFamily('bold'), color: '#FFFFFF' },
  primaryTextEN: { marginTop: 2, fontSize: 11, color: '#FFFFFF' },
  primaryDangerTextMM: { fontSize: mmFontSize(15), fontFamily: mmFontFamily('bold'), color: '#FFFFFF' },
  primaryDangerTextEN: { marginTop: 2, fontSize: 11, color: '#FFFFFF' },
  pinInput: {
    alignSelf: 'center',
    width: 180,
    height: 64,
    marginTop: 28,
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: Colors.border,
    backgroundColor: Colors.surface,
    textAlign: 'center',
    fontSize: 26,
    letterSpacing: 14,
    color: Colors.textPrimary,
  },
  inputError: { borderColor: Colors.error },
  errorText: { marginTop: 12, textAlign: 'center', fontSize: 13, lineHeight: 20, color: Colors.error },
  confirmWord: { fontWeight: '800', color: Colors.error },
  confirmInput: {
    height: 58,
    marginTop: 24,
    paddingHorizontal: 16,
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: Colors.border,
    backgroundColor: Colors.surface,
    textAlign: 'center',
    fontSize: 18,
    fontWeight: '700',
    color: Colors.textPrimary,
  },
  errorCard: {
    marginTop: 16,
    padding: 16,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Colors.error,
    backgroundColor: Colors.errorLight,
  },
  errorTitleMM: { fontSize: mmFontSize(14), lineHeight: 24, fontFamily: mmFontFamily('bold'), color: Colors.error },
  errorTitleEN: { marginTop: 4, fontSize: 13, lineHeight: 19, color: Colors.textSecondary },
  serverMessage: { marginTop: 8, fontSize: 11, color: Colors.textTertiary },
  callButton: {
    minHeight: 48,
    marginTop: 14,
    paddingHorizontal: 14,
    borderRadius: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: Colors.surface,
  },
  callButtonText: { fontSize: 13, fontWeight: '700', color: Colors.primary },
  successContent: { flex: 1, padding: 28, alignItems: 'center', justifyContent: 'center' },
  successIcon: {
    width: 76,
    height: 76,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.successLight,
    marginBottom: 24,
  },
  successBody: { marginTop: 18, textAlign: 'center', fontSize: 14, lineHeight: 24, color: Colors.textSecondary },
  successSpinner: { marginTop: 24 },
});
