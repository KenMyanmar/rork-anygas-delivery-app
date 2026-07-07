/**
 * vC16 Task B — Profile Delivery Address screen (modal).
 *
 * View + edit address (text), township (canon picker), landmark (optional),
 * and GPS (optional "Use my location"). Saves via the existing customers
 * self-update (RLS customers_update_own_profile, verified in prod).
 *
 * This fixes the core gap: today the only way to edit an address is to start
 * an order. Now it's a first-class Profile screen.
 */
import React, { useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { ChevronLeft, MapPin, Check } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import Colors from '@/constants/colors';
import { useAuth } from '@/providers/AuthProvider';
import { useI18n } from '@/providers/I18nProvider';
import AddressForm, { AddressFormValues } from '@/components/AddressForm';

export default function EditAddressScreen() {
  const { activeCustomer, updateCustomerAddress } = useAuth();
  const { t, tMM, isMM } = useI18n();

  const handleSave = useCallback(async (values: AddressFormValues): Promise<boolean> => {
    try {
      await updateCustomerAddress(
        values.address,
        values.township,
        values.landmark || null,
        values.gpsLat,
        values.gpsLng,
      );
      if (Platform.OS !== 'web') {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }
      // Brief delay so the user sees the success state, then go back.
      setTimeout(() => router.back(), 600);
      return true;
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : (isMM ? 'လိပ်စာ သိမ်းဆည်၍ မရပါ' : 'Failed to save address');
      console.log('[EditAddress] Save error:', msg);
      if (Platform.OS !== 'web') {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      }
      return false;
    }
  }, [updateCustomerAddress, isMM]);

  return (
    <View style={styles.container}>
      <StatusBar style="dark" />
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity
            onPress={() => router.back()}
            style={styles.backBtn}
            activeOpacity={0.7}
          >
            <ChevronLeft size={22} color={Colors.textPrimary} />
          </TouchableOpacity>
          <View style={styles.headerTitleWrap}>
            <Text style={styles.headerTitle}>{t('edit_address_title')}</Text>
            <Text style={styles.headerTitleMM}>{tMM('edit_address_title')}</Text>
          </View>
          <View style={styles.backBtn} />
        </View>

        <ScrollView
          style={styles.scrollArea}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {/* Current address summary (if exists) */}
          {activeCustomer?.address && (
            <View style={styles.currentCard}>
              <View style={styles.currentIconWrap}>
                <MapPin size={18} color={Colors.primary} />
              </View>
              <View style={styles.currentInfo}>
                <Text style={styles.currentLabel}>{t('delivering_to')}</Text>
                <Text style={styles.currentAddress} numberOfLines={2}>
                  {activeCustomer.address}
                  {activeCustomer.township ? `, ${activeCustomer.township}` : ''}
                </Text>
                {activeCustomer.landmark ? (
                  <Text style={styles.currentLandmark}>
                    {isMM ? 'အမှတ်အသား' : 'Landmark'}: {activeCustomer.landmark}
                  </Text>
                ) : null}
              </View>
            </View>
          )}

          {/* Reusable address form */}
          <AddressForm
            initialValues={{
              address: activeCustomer?.address || '',
              township: activeCustomer?.township || '',
              landmark: activeCustomer?.landmark || '',
              gpsLat: activeCustomer?.gps_lat ?? null,
              gpsLng: activeCustomer?.gps_lng ?? null,
            }}
            onSave={handleSave}
            testID="profile-address-save"
          />
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  safeArea: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 12,
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: Colors.surface,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: Colors.borderLight,
  },
  headerTitleWrap: {
    flex: 1,
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: '700' as const,
    color: Colors.textPrimary,
  },
  headerTitleMM: {
    fontSize: 11,
    color: Colors.textTertiary,
    marginTop: 1,
  },
  scrollArea: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 40,
  },
  currentCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: Colors.successLight,
    borderRadius: 12,
    padding: 14,
    gap: 12,
    marginBottom: 24,
    borderWidth: 1,
    borderColor: Colors.success,
  },
  currentIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 12,
    backgroundColor: 'rgba(22,163,74,0.12)',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 2,
  },
  currentInfo: {
    flex: 1,
  },
  currentLabel: {
    fontSize: 11,
    fontWeight: '700' as const,
    color: Colors.success,
    textTransform: 'uppercase' as const,
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  currentAddress: {
    fontSize: 14,
    color: Colors.textPrimary,
    lineHeight: 20,
  },
  currentLandmark: {
    fontSize: 12,
    color: Colors.textSecondary,
    marginTop: 4,
  },
});
