/**
 * vC16 Task B — Reusable address form with landmark + GPS capture.
 *
 * Used by: Profile address edit screen, registration screen, order flow gate.
 * Fields: address (required), township (canon picker, required), landmark
 * (optional), gps_lat/gps_lng (optional via "Use my location").
 *
 * Column allowlist for ALL customer writes: address, township, landmark,
 * gps_lat, gps_lng. Nothing else, ever.
 */
import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Platform,
  ActivityIndicator,
} from 'react-native';
import {
  MapPin,
  ChevronDown,
  Check,
  Crosshair,
  Navigation,
} from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import * as Location from 'expo-location';
import Colors from '@/constants/colors';
import { YANGON_TOWNSHIPS } from '@/constants/townships';
import { useI18n } from '@/providers/I18nProvider';

export interface AddressFormValues {
  address: string;
  township: string;
  landmark: string;
  gpsLat: number | null;
  gpsLng: number | null;
}

interface AddressFormProps {
  initialValues?: Partial<AddressFormValues>;
  onSave: (values: AddressFormValues) => Promise<boolean>;
  submitLabel?: string;
  testID?: string;
}

export default function AddressForm({
  initialValues,
  onSave,
  submitLabel,
  testID,
}: AddressFormProps) {
  const { t, isMM } = useI18n();
  const [address, setAddress] = useState<string>(initialValues?.address || '');
  const [township, setTownship] = useState<string>(initialValues?.township || '');
  const [landmark, setLandmark] = useState<string>(initialValues?.landmark || '');
  const [gpsLat, setGpsLat] = useState<number | null>(initialValues?.gpsLat ?? null);
  const [gpsLng, setGpsLng] = useState<number | null>(initialValues?.gpsLng ?? null);
  const [townshipPickerOpen, setTownshipPickerOpen] = useState<boolean>(false);
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [locationStatus, setLocationStatus] = useState<'idle' | 'loading' | 'saved' | 'denied'>('idle');

  const isValid = address.trim().length >= 5 && township.trim().length >= 2;

  const handleUseLocation = useCallback(async () => {
    if (Platform.OS !== 'web') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    setLocationStatus('loading');
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        setLocationStatus('denied');
        console.log('[AddressForm] Location permission denied');
        return;
      }
      const pos = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });
      setGpsLat(pos.coords.latitude);
      setGpsLng(pos.coords.longitude);
      setLocationStatus('saved');
      console.log('[AddressForm] GPS captured:', pos.coords.latitude, pos.coords.longitude);
      if (Platform.OS !== 'web') {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }
    } catch (e) {
      console.log('[AddressForm] Location error:', e);
      setLocationStatus('denied');
    }
  }, []);

  const handleSave = useCallback(async () => {
    if (!isValid) return;
    setIsSaving(true);
    setSaveError(null);
    try {
      const values: AddressFormValues = {
        address: address.trim(),
        township: township.trim(),
        landmark: landmark.trim(),
        gpsLat,
        gpsLng,
      };
      const success = await onSave(values);
      if (!success) {
        setSaveError(isMM ? 'လိပ်စာ သိမ်းဆည်၍ မရပါ' : 'Failed to save address');
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : (isMM ? 'လိပ်စာ သိမ်းဆည်၍ မရပါ' : 'Failed to save address');
      console.log('[AddressForm] Save error:', msg);
      setSaveError(msg);
    } finally {
      setIsSaving(false);
    }
  }, [isValid, address, township, landmark, gpsLat, gpsLng, onSave, isMM]);

  return (
    <View style={styles.container}>
      {/* Address text */}
      <View style={styles.fieldGroup}>
        <Text style={styles.label}>{t('address_label')}</Text>
        <TextInput
          style={[styles.input, styles.textArea]}
          placeholder={t('address_placeholder')}
          placeholderTextColor={Colors.textTertiary}
          value={address}
          onChangeText={setAddress}
          multiline
          numberOfLines={3}
          textAlignVertical="top"
        />
      </View>

      {/* Township picker (canon) */}
      <View style={styles.fieldGroup}>
        <Text style={styles.label}>{t('select_township')}</Text>
        <TouchableOpacity
          style={styles.picker}
          onPress={() => setTownshipPickerOpen(!townshipPickerOpen)}
          activeOpacity={0.7}
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

      {/* Landmark (optional, critical for Myanmar addressing) */}
      <View style={styles.fieldGroup}>
        <Text style={styles.label}>{t('landmark_label')}</Text>
        <TextInput
          style={styles.input}
          placeholder={t('landmark_placeholder')}
          placeholderTextColor={Colors.textTertiary}
          value={landmark}
          onChangeText={setLandmark}
          maxLength={100}
        />
      </View>

      {/* Use my location (optional GPS capture) */}
      <TouchableOpacity
        style={[
          styles.locationBtn,
          locationStatus === 'saved' && styles.locationBtnSaved,
          locationStatus === 'loading' && styles.locationBtnLoading,
        ]}
        onPress={handleUseLocation}
        disabled={locationStatus === 'loading'}
        activeOpacity={0.7}
      >
        {locationStatus === 'loading' ? (
          <ActivityIndicator size="small" color={Colors.primary} />
        ) : locationStatus === 'saved' ? (
          <Check size={18} color={Colors.success} />
        ) : (
          <Crosshair size={18} color={Colors.primary} />
        )}
        <Text
          style={[
            styles.locationBtnText,
            locationStatus === 'saved' && styles.locationBtnTextSaved,
          ]}
        >
          {locationStatus === 'loading'
            ? t('location_loading')
            : locationStatus === 'saved'
            ? t('location_saved')
            : t('use_my_location')}
        </Text>
      </TouchableOpacity>

      {locationStatus === 'denied' && (
        <Text style={styles.locationDeniedText}>{t('location_denied')}</Text>
      )}

      {/* Error */}
      {saveError && (
        <View style={styles.errorBox}>
          <Text style={styles.errorText}>{saveError}</Text>
        </View>
      )}

      {/* Save button */}
      <TouchableOpacity
        style={[styles.saveBtn, (!isValid || isSaving) && styles.saveBtnDisabled]}
        onPress={handleSave}
        disabled={!isValid || isSaving}
        activeOpacity={0.85}
        testID={testID}
      >
        {isSaving ? (
          <ActivityIndicator color="#FFFFFF" />
        ) : (
          <>
            <MapPin size={18} color="#FFFFFF" />
            <Text style={styles.saveBtnText}>
              {submitLabel || t('save_and_continue')}
            </Text>
          </>
        )}
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {},
  fieldGroup: {
    marginBottom: 18,
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
  textArea: {
    minHeight: 80,
    paddingTop: 14,
  },
  picker: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: Colors.background,
    borderRadius: 14,
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
    borderRadius: 14,
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
  locationBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 14,
    backgroundColor: Colors.primaryLight,
    borderWidth: 1.5,
    borderColor: Colors.primaryMuted,
    marginBottom: 16,
  },
  locationBtnSaved: {
    backgroundColor: Colors.successLight,
    borderColor: Colors.success,
  },
  locationBtnLoading: {
    opacity: 0.7,
  },
  locationBtnText: {
    fontSize: 15,
    fontWeight: '600' as const,
    color: Colors.primary,
  },
  locationBtnTextSaved: {
    color: Colors.success,
  },
  locationDeniedText: {
    fontSize: 12,
    color: Colors.textTertiary,
    marginBottom: 16,
    fontStyle: 'italic' as const,
  },
  errorBox: {
    backgroundColor: Colors.errorLight,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    marginBottom: 16,
  },
  errorText: {
    fontSize: 13,
    color: Colors.error,
  },
  saveBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.primary,
    paddingVertical: 16,
    borderRadius: 16,
    gap: 10,
  },
  saveBtnDisabled: {
    backgroundColor: Colors.primaryMuted,
  },
  saveBtnText: {
    fontSize: 16,
    fontWeight: '700' as const,
    color: '#FFFFFF',
  },
});
