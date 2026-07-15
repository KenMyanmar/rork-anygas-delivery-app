import React, { useCallback } from 'react';
import {
  Alert,
  Linking,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { router } from 'expo-router';
import { ChevronLeft, ChevronRight, ExternalLink, Phone, ShieldCheck, Trash2 } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import Colors from '@/constants/colors';
import { mmFontFamily, mmFontSize } from '@/constants/design';

const SUPPORT_URL = 'https://anygas.org/support';

export default function SupportScreen() {
  const callHotline = useCallback(async () => {
    const phoneUrl = 'tel:8484';
    try {
      const supported = await Linking.canOpenURL(phoneUrl);
      if (!supported) {
        Alert.alert(
          'Call 8484',
          'Phone calls are not available on this device. Please dial 8484 from your phone.',
        );
        return;
      }
      if (Platform.OS !== 'web') {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      }
      await Linking.openURL(phoneUrl);
    } catch {
      Alert.alert(
        'Call 8484',
        'We could not open the Phone app. Please dial 8484 manually.',
      );
    }
  }, []);

  const openSupportWebsite = useCallback(async () => {
    try {
      await Linking.openURL(SUPPORT_URL);
    } catch {
      Alert.alert('Support website', SUPPORT_URL);
    }
  }, []);

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']} testID="support-screen">
      <StatusBar style="dark" />
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => router.back()}
          accessibilityRole="button"
          accessibilityLabel="Back"
        >
          <ChevronLeft size={24} color={Colors.textPrimary} />
        </TouchableOpacity>
        <View style={styles.headerTitles}>
          <Text style={styles.headerTitleMM}>အကူအညီနှင့် ပံ့ပိုးမှု</Text>
          <Text style={styles.headerTitleEN}>Help &amp; Support</Text>
        </View>
        <View style={styles.headerSpacer} />
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.heroIcon}>
          <Phone size={34} color={Colors.primary} />
        </View>
        <Text style={styles.titleMM}>AnyGas 8484 ကို ဆက်သွယ်ပါ</Text>
        <Text style={styles.titleEN}>Contact AnyGas 8484</Text>
        <Text style={styles.body}>
          မှာယူမှု၊ ပို့ဆောင်မှု၊ အကောင့်ဝင်ရောက်မှုနှင့် အကောင့်ဖျက်ခြင်းဆိုင်ရာ အကူအညီအတွက် 8484 သို့ ခေါ်ဆိုပါ။{`\n`}
          Call 8484 for help with orders, delivery, account access, or account deletion.
        </Text>

        <TouchableOpacity
          style={styles.primaryButton}
          onPress={callHotline}
          accessibilityRole="button"
          accessibilityLabel="Call AnyGas hotline 8484"
          testID="call-8484-button"
        >
          <Phone size={22} color="#FFFFFF" />
          <View style={styles.buttonTextWrap}>
            <Text style={styles.primaryTextMM}>8484 သို့ ခေါ်မည်</Text>
            <Text style={styles.primaryTextEN}>Call 8484</Text>
          </View>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.secondaryButton}
          onPress={openSupportWebsite}
          accessibilityRole="link"
          accessibilityLabel="Open AnyGas support website"
          testID="support-website-button"
        >
          <ExternalLink size={20} color={Colors.primary} />
          <View style={styles.buttonTextWrap}>
            <Text style={styles.secondaryTextMM}>ပံ့ပိုးမှု ဝဘ်စာမျက်နှာ</Text>
            <Text style={styles.secondaryTextEN}>Open anygas.org/support</Text>
          </View>
          <ChevronRight size={18} color={Colors.primary} />
        </TouchableOpacity>

        <View style={styles.sectionCard}>
          <View style={styles.sectionIcon}>
            <ShieldCheck size={22} color={Colors.primary} />
          </View>
          <View style={styles.sectionText}>
            <Text style={styles.sectionTitleMM}>ကိုယ်ရေးအချက်အလက်နှင့် စည်းမျဉ်းများ</Text>
            <Text style={styles.sectionTitleEN}>Privacy and Terms</Text>
          </View>
          <View style={styles.smallActions}>
            <TouchableOpacity
              style={styles.smallButton}
              onPress={() => router.push({ pathname: '/legal', params: { type: 'privacy' } })}
              accessibilityRole="button"
              accessibilityLabel="Privacy Policy"
            >
              <Text style={styles.smallButtonText}>Privacy</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.smallButton}
              onPress={() => router.push({ pathname: '/legal', params: { type: 'terms' } })}
              accessibilityRole="button"
              accessibilityLabel="Terms of Service"
            >
              <Text style={styles.smallButtonText}>Terms</Text>
            </TouchableOpacity>
          </View>
        </View>

        <TouchableOpacity
          style={styles.deleteCard}
          onPress={() => router.push('/delete-account')}
          accessibilityRole="button"
          accessibilityLabel="Delete my account permanently"
          testID="support-delete-account-button"
        >
          <Trash2 size={21} color={Colors.error} />
          <View style={styles.buttonTextWrap}>
            <Text style={styles.deleteTextMM}>အကောင့်ကို အပြီးဖျက်မည်</Text>
            <Text style={styles.deleteTextEN}>Delete my account permanently</Text>
          </View>
          <ChevronRight size={18} color={Colors.error} />
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
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
  headerTitleMM: {
    fontSize: mmFontSize(16),
    fontFamily: mmFontFamily('bold'),
    color: Colors.textPrimary,
  },
  headerTitleEN: { marginTop: 2, fontSize: 11, color: Colors.textSecondary },
  content: { flexGrow: 1, padding: 20, paddingBottom: 44 },
  heroIcon: {
    width: 68,
    height: 68,
    borderRadius: 999,
    alignSelf: 'center',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.primaryLight,
    marginTop: 8,
    marginBottom: 18,
  },
  titleMM: {
    textAlign: 'center',
    fontSize: mmFontSize(22),
    fontFamily: mmFontFamily('bold'),
    color: Colors.textPrimary,
  },
  titleEN: { marginTop: 6, textAlign: 'center', fontSize: 17, fontWeight: '700', color: Colors.textSecondary },
  body: { marginTop: 16, textAlign: 'center', fontSize: 14, lineHeight: 24, color: Colors.textSecondary },
  primaryButton: {
    minHeight: 68,
    marginTop: 26,
    paddingHorizontal: 18,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    borderRadius: 16,
    backgroundColor: Colors.primary,
  },
  secondaryButton: {
    minHeight: 64,
    marginTop: 12,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Colors.primaryLight,
    backgroundColor: Colors.surface,
  },
  buttonTextWrap: { flex: 1 },
  primaryTextMM: { fontSize: mmFontSize(15), fontFamily: mmFontFamily('bold'), color: '#FFFFFF' },
  primaryTextEN: { marginTop: 2, fontSize: 12, color: '#FFFFFF' },
  secondaryTextMM: { fontSize: mmFontSize(14), fontFamily: mmFontFamily('medium'), color: Colors.primary },
  secondaryTextEN: { marginTop: 2, fontSize: 12, color: Colors.textSecondary },
  sectionCard: {
    minHeight: 72,
    marginTop: 24,
    padding: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Colors.borderLight,
    backgroundColor: Colors.surface,
  },
  sectionIcon: {
    width: 42,
    height: 42,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.primaryLight,
  },
  sectionText: { flex: 1 },
  sectionTitleMM: { fontSize: mmFontSize(13), fontFamily: mmFontFamily('medium'), color: Colors.textPrimary },
  sectionTitleEN: { marginTop: 2, fontSize: 12, color: Colors.textSecondary },
  smallActions: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  smallButton: { minHeight: 44, paddingHorizontal: 8, alignItems: 'center', justifyContent: 'center' },
  smallButtonText: { fontSize: 13, fontWeight: '700', color: Colors.primary },
  deleteCard: {
    minHeight: 68,
    marginTop: 12,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Colors.error,
    backgroundColor: Colors.errorLight,
  },
  deleteTextMM: { fontSize: mmFontSize(14), fontFamily: mmFontFamily('medium'), color: Colors.error },
  deleteTextEN: { marginTop: 3, fontSize: 12, color: Colors.textSecondary },
});
