import React, { useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Alert,
  Platform,
  Linking,
} from 'react-native';
import {
  User,
  MapPin,
  Phone,
  ChevronRight,
  LogOut,
  Check,
  Shield,
  HelpCircle,
  FileText,
  Building2,
  Lock,
  Trash2,
  Navigation,
} from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import Colors from '@/constants/colors';
import { useAuth } from '@/providers/AuthProvider';
import { useI18n } from '@/providers/I18nProvider';
import { usePinLock } from '@/providers/PinLockProvider';

export default function ProfileScreen() {
  const { activeCustomer, activeProfile, savedAddresses, phoneNumber, softSignOut, removeAccount } = useAuth();
  const { t, tMM, tEN, isMM, isEN, changeLanguage } = useI18n();
  const { lock } = usePinLock();

  // vC15 Task A: "Lock app" is the prominent, free action — instant PIN screen,
  // session untouched.
  const handleLockApp = useCallback(() => {
    if (Platform.OS !== 'web') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    console.log('[Profile] Lock app requested');
    lock();
  }, [lock]);

  // vC16 Task A: "Sign out" is now SOFT — parks the session, shows account
  // tile. No OTP, no SMS to return. Confirm dialog steers users here over
  // the destructive "Remove account" path.
  const handleSignOut = useCallback(() => {
    Alert.alert(
      t('sign_out_soft'),
      t('sign_out_soft_confirm'),
      [
        { text: t('cancel'), style: 'cancel' },
        {
          // Primary: Lock app (free, no SMS)
          text: t('lock_app'),
          style: 'default',
          onPress: () => {
            console.log('[Profile] User chose Lock app over sign out');
            handleLockApp();
          },
        },
        {
          // Soft sign-out: parks session, PIN re-enters
          text: t('sign_out_soft'),
          style: 'destructive',
          onPress: async () => {
            console.log('[Profile] User confirmed soft sign-out');
            await softSignOut();
          },
        },
      ]
    );
  }, [softSignOut, t, handleLockApp]);

  // vC16 Task A: "Remove account from this device" — the old hard logout,
  // correctly named. Revokes session, wipes everything, OTP required to return.
  const handleRemoveAccount = useCallback(() => {
    Alert.alert(
      t('remove_account'),
      t('remove_account_confirm'),
      [
        { text: t('cancel'), style: 'cancel' },
        {
          text: t('remove_account'),
          style: 'destructive',
          onPress: async () => {
            console.log('[Profile] User confirmed remove account');
            await removeAccount();
            router.replace('/login');
          },
        },
      ]
    );
  }, [removeAccount, t]);

  // vC16 Task B: navigate to the Delivery Address edit screen.
  const handleEditAddress = useCallback(() => {
    if (Platform.OS !== 'web') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    router.push('/edit-address');
  }, []);

  const handlePrivacy = useCallback(() => {
    router.push({ pathname: '/legal', params: { type: 'privacy' } });
  }, []);

  const handleTerms = useCallback(() => {
    router.push({ pathname: '/legal', params: { type: 'terms' } });
  }, []);

  const handleSupport = useCallback(() => {
    Linking.openURL('tel:8484');
  }, []);

  const handleDeleteAccount = useCallback(() => {
    if (Platform.OS !== 'web') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    }
    router.push('/delete-account');
  }, []);

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.scrollContent}
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.profileHeader}>
        <View style={styles.avatarWrap}>
          <User size={32} color={Colors.primary} />
        </View>
        <View style={styles.profileInfo}>
          <Text style={styles.profileName}>{activeCustomer?.full_name || activeCustomer?.name || 'User'}</Text>
          <View style={styles.phoneRow}>
            <Phone size={13} color={Colors.textTertiary} />
            <Text style={styles.phoneText}>{activeCustomer?.phone || phoneNumber}</Text>
          </View>
          {activeCustomer?.township && (
            <View style={styles.phoneRow}>
              <Building2 size={13} color={Colors.textTertiary} />
              <Text style={styles.phoneText}>{activeCustomer.township}</Text>
            </View>
          )}
        </View>
      </View>

      {activeCustomer?.address && (
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <MapPin size={18} color={Colors.primary} />
            <Text style={styles.sectionTitle}>{t('delivery_address')}</Text>
            <Text style={styles.sectionTitleMM}>{tMM('delivery_address')}</Text>
          </View>
          {/* vC16 Task B: tappable card → edit-address modal */}
          <TouchableOpacity
            style={styles.addressCard}
            onPress={handleEditAddress}
            activeOpacity={0.7}
            accessibilityRole="button"
            accessibilityLabel={t('delivery_address')}
          >
            <View style={styles.addressIcon}>
              <MapPin size={16} color={Colors.primary} />
            </View>
            <View style={styles.addressInfo}>
              <Text style={styles.addressText}>{activeCustomer.address}</Text>
              {activeCustomer.township && (
                <Text style={styles.addressTownship}>{activeCustomer.township}</Text>
              )}
              {activeCustomer.landmark && (
                <Text style={styles.addressLandmark} numberOfLines={1}>
                  {isMM ? 'အမှတ်အသား' : 'Landmark'}: {activeCustomer.landmark}
                </Text>
              )}
              {activeCustomer.gps_lat != null && activeCustomer.gps_lng != null && (
                <View style={styles.gpsBadge}>
                  <Navigation size={11} color={Colors.success} />
                  <Text style={styles.gpsBadgeText}>GPS</Text>
                </View>
              )}
            </View>
            <ChevronRight size={18} color={Colors.textTertiary} />
          </TouchableOpacity>
        </View>
      )}

      {/* vC16 Task B: if no address, show a prominent add-address CTA */}
      {!activeCustomer?.address && (
        <View style={styles.section}>
          <TouchableOpacity
            style={styles.addAddressCard}
            onPress={handleEditAddress}
            activeOpacity={0.7}
            accessibilityRole="button"
            accessibilityLabel={t('add_delivery_address')}
          >
            <View style={styles.addAddressIcon}>
              <MapPin size={20} color={Colors.primary} />
            </View>
            <View style={styles.addAddressInfo}>
              <Text style={styles.addAddressTitle}>{t('add_delivery_address')}</Text>
              <Text style={styles.addAddressSub}>
                {isMM ? 'မှာယူရန် လိပ်စာ ထည့်ပါ' : 'Add your address to start ordering'}
              </Text>
            </View>
            <ChevronRight size={18} color={Colors.primary} />
          </TouchableOpacity>
        </View>
      )}

      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <MapPin size={18} color={Colors.primary} />
          <Text style={styles.sectionTitle}>{t('saved_addresses')}</Text>
          <Text style={styles.sectionTitleMM}>{tMM('saved_addresses')}</Text>
        </View>
        <View style={styles.addressesList}>
          {savedAddresses.length > 0 ? (
            savedAddresses.map((addr) => (
              <View key={addr.id} style={styles.addressItem}>
                <View style={styles.addressItemIcon}>
                  <MapPin size={16} color={Colors.primary} />
                </View>
                <View style={styles.addressItemInfo}>
                  <Text style={styles.addressLabel}>{addr.label}</Text>
                  <Text style={styles.addressItemText} numberOfLines={2}>{addr.address}</Text>
                </View>
                {addr.isDefault && (
                  <View style={styles.defaultBadge}>
                    <Text style={styles.defaultBadgeText}>{t('default')}</Text>
                  </View>
                )}
              </View>
            ))
          ) : (
            <View style={styles.emptyAddresses}>
              <Text style={styles.emptyText}>{t('no_saved_addresses')}</Text>
            </View>
          )}
        </View>
      </View>

      <View style={styles.section}>
        <View style={styles.langCard}>
          <Text style={styles.langTitle}>{isMM ? 'ဘာသာစကား' : 'Language'}</Text>
          <View style={styles.langToggle}>
            <TouchableOpacity
              style={[styles.langBtn, isMM && styles.langBtnActive]}
              onPress={() => changeLanguage('mm')}
              activeOpacity={0.7}
              accessibilityRole="button"
              accessibilityState={{ selected: isMM }}
              accessibilityLabel="မြန်မာဘာသာ"
            >
              <Text style={[styles.langBtnText, isMM && styles.langBtnTextActive]}>မြန်မာ</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.langBtn, isEN && styles.langBtnActive]}
              onPress={() => changeLanguage('en')}
              activeOpacity={0.7}
              accessibilityRole="button"
              accessibilityState={{ selected: isEN }}
              accessibilityLabel="English"
            >
              <Text style={[styles.langBtnText, isEN && styles.langBtnTextActive]}>English</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>

      <View style={styles.section}>
        <TouchableOpacity
          style={styles.menuItem}
          activeOpacity={0.7}
          onPress={handlePrivacy}
          accessibilityRole="button"
          accessibilityLabel={t('privacy_security')}
        >
          <Shield size={20} color={Colors.textSecondary} />
          <Text style={styles.menuItemText}>{t('privacy_security')}</Text>
          <ChevronRight size={18} color={Colors.textTertiary} />
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.menuItem}
          activeOpacity={0.7}
          onPress={handleSupport}
          accessibilityRole="button"
          accessibilityLabel={t('help_support')}
        >
          <HelpCircle size={20} color={Colors.textSecondary} />
          <Text style={styles.menuItemText}>{t('help_support')}</Text>
          <ChevronRight size={18} color={Colors.textTertiary} />
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.menuItem}
          activeOpacity={0.7}
          onPress={handleTerms}
          accessibilityRole="button"
          accessibilityLabel={t('terms')}
        >
          <FileText size={20} color={Colors.textSecondary} />
          <Text style={styles.menuItemText}>{t('terms')}</Text>
          <ChevronRight size={18} color={Colors.textTertiary} />
        </TouchableOpacity>
      </View>

      {/* vC15 Task A — Lock app (prominent, free) */}
      <TouchableOpacity
        style={styles.lockButton}
        onPress={handleLockApp}
        activeOpacity={0.7}
        accessibilityRole="button"
        accessibilityLabel={t('lock_app')}
      >
        <Lock size={20} color={Colors.primary} />
        <View style={styles.lockButtonTextWrap}>
          <Text style={styles.lockButtonText}>{t('lock_app')}</Text>
          <Text style={styles.lockButtonSub}>{t('lock_app_desc')}</Text>
        </View>
      </TouchableOpacity>

      {/* vC16 Task A — Sign out (soft, demoted text link) */}
      <TouchableOpacity
        style={styles.logoutLink}
        onPress={handleSignOut}
        activeOpacity={0.7}
        accessibilityRole="button"
        accessibilityLabel={t('sign_out_soft')}
      >
        <LogOut size={16} color={Colors.textTertiary} />
        <Text style={styles.logoutLinkText}>{t('sign_out_soft')}</Text>
      </TouchableOpacity>

      {/* vC16 Task A — Remove account from this device (destructive, bottom) */}
      <TouchableOpacity
        style={styles.removeAccountLink}
        onPress={handleRemoveAccount}
        activeOpacity={0.7}
        accessibilityRole="button"
        accessibilityLabel={t('remove_account')}
      >
        <Trash2 size={15} color={Colors.error} />
        <Text style={styles.removeAccountText}>{t('remove_account')}</Text>
      </TouchableOpacity>

      <TouchableOpacity
        style={styles.deleteAccountLink}
        onPress={handleDeleteAccount}
        activeOpacity={0.7}
        accessibilityRole="button"
        accessibilityLabel={tEN('delete_account_permanently')}
      >
        <Trash2 size={17} color={Colors.error} />
        <View style={styles.deleteAccountTextWrap}>
          <Text style={styles.deleteAccountTextMM}>{tMM('delete_account_permanently')}</Text>
          <Text style={styles.deleteAccountTextEN}>{tEN('delete_account_permanently')}</Text>
        </View>
        <ChevronRight size={18} color={Colors.error} />
      </TouchableOpacity>

      <Text style={styles.version}>AnyGas 8484 v1.0.0</Text>
      {activeCustomer && (
        <Text style={styles.customerId}>Customer ID: {activeCustomer.id}</Text>
      )}
      <View style={{ height: 30 }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  scrollContent: {
    padding: 20,
  },
  profileHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surface,
    padding: 20,
    borderRadius: 20,
    marginBottom: 24,
    gap: 16,
    borderWidth: 1,
    borderColor: Colors.borderLight,
  },
  avatarWrap: {
    width: 60,
    height: 60,
    borderRadius: 999,
    backgroundColor: Colors.primaryLight,
    justifyContent: 'center',
    alignItems: 'center',
  },
  profileInfo: {
    flex: 1,
  },
  profileName: {
    fontSize: 20,
    fontWeight: '700' as const,
    color: Colors.textPrimary,
  },
  phoneRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginTop: 4,
  },
  phoneText: {
    fontSize: 14,
    color: Colors.textTertiary,
  },
  section: {
    marginBottom: 24,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700' as const,
    color: Colors.textPrimary,
  },
  sectionTitleMM: {
    fontSize: 12,
    color: Colors.textTertiary,
  },
  addressCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: Colors.surface,
    padding: 16,
    borderRadius: 16,
    gap: 12,
    borderWidth: 1,
    borderColor: Colors.borderLight,
  },
  addressIcon: {
    width: 36,
    height: 36,
    borderRadius: 12,
    backgroundColor: Colors.primaryLight,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 2,
  },
  addressInfo: {
    flex: 1,
  },
  addressText: {
    fontSize: 14,
    color: Colors.textSecondary,
    lineHeight: 20,
  },
  addressTownship: {
    fontSize: 13,
    color: Colors.textTertiary,
    marginTop: 2,
  },
  addressLandmark: {
    fontSize: 12,
    color: Colors.textTertiary,
    marginTop: 2,
  },
  gpsBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 6,
    backgroundColor: Colors.successLight,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
    alignSelf: 'flex-start',
  },
  gpsBadgeText: {
    fontSize: 10,
    fontWeight: '700' as const,
    color: Colors.success,
  },
  // vC16 Task B: no-address CTA card
  addAddressCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surface,
    padding: 16,
    borderRadius: 16,
    gap: 14,
    borderWidth: 1.5,
    borderColor: Colors.primaryLight,
  },
  addAddressIcon: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: Colors.primaryLight,
    justifyContent: 'center',
    alignItems: 'center',
  },
  addAddressInfo: {
    flex: 1,
  },
  addAddressTitle: {
    fontSize: 15,
    fontWeight: '700' as const,
    color: Colors.primary,
  },
  addAddressSub: {
    fontSize: 12,
    color: Colors.textTertiary,
    marginTop: 2,
  },
  addressesList: {
    backgroundColor: Colors.surface,
    borderRadius: 16,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: Colors.borderLight,
  },
  addressItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    gap: 12,
    borderBottomWidth: 1,
    borderBottomColor: Colors.borderLight,
  },
  addressItemIcon: {
    width: 36,
    height: 36,
    borderRadius: 12,
    backgroundColor: Colors.primaryLight,
    justifyContent: 'center',
    alignItems: 'center',
  },
  addressItemInfo: {
    flex: 1,
  },
  addressLabel: {
    fontSize: 14,
    fontWeight: '700' as const,
    color: Colors.textPrimary,
  },
  addressItemText: {
    fontSize: 12,
    color: Colors.textSecondary,
    marginTop: 2,
  },
  defaultBadge: {
    backgroundColor: Colors.primaryLight,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
  },
  defaultBadgeText: {
    fontSize: 11,
    fontWeight: '700' as const,
    color: Colors.primary,
  },
  emptyAddresses: {
    padding: 24,
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 14,
    color: Colors.textTertiary,
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surface,
    padding: 16,
    borderRadius: 16,
    gap: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: Colors.borderLight,
  },
  menuItemText: {
    flex: 1,
    fontSize: 15,
    fontWeight: '500' as const,
    color: Colors.textPrimary,
  },
  langCard: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'space-between' as const,
    backgroundColor: Colors.surface,
    padding: 16,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Colors.borderLight,
  },
  langTitle: {
    fontSize: 15,
    fontWeight: '600' as const,
    color: Colors.textPrimary,
  },
  langToggle: {
    flexDirection: 'row' as const,
    backgroundColor: Colors.background,
    borderRadius: 12,
    padding: 3,
    gap: 2,
  },
  // vD1: 44pt touch floor for language toggle buttons
  langBtn: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 999,
    minHeight: 44,
    justifyContent: 'center',
  },
  langBtnActive: {
    backgroundColor: Colors.primary,
  },
  langBtnText: {
    fontSize: 13,
    fontWeight: '600' as const,
    color: Colors.textSecondary,
  },
  langBtnTextActive: {
    color: '#FFFFFF',
  },
  // vC15 Task A — Lock app button (prominent, primary color)
  lockButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surface,
    padding: 16,
    borderRadius: 16,
    gap: 12,
    marginBottom: 12,
    borderWidth: 1.5,
    borderColor: Colors.primaryLight,
  },
  lockButtonTextWrap: {
    flex: 1,
  },
  lockButtonText: {
    fontSize: 16,
    fontWeight: '700' as const,
    color: Colors.primary,
  },
  lockButtonSub: {
    fontSize: 12,
    color: Colors.textTertiary,
    marginTop: 2,
  },
  // vC15 Task A — Log out demoted to text link
  // vD1: 44pt touch floor for logout link
  logoutLink: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    gap: 8,
    marginBottom: 16,
    minHeight: 44,
  },
  logoutLinkText: {
    fontSize: 14,
    fontWeight: '500' as const,
    color: Colors.textTertiary,
  },
  // vC16 Task A — Remove account (destructive, bottom)
  // vD1: 44pt touch floor for remove account link
  removeAccountLink: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    gap: 6,
    marginBottom: 8,
    minHeight: 44,
  },
  removeAccountText: {
    fontSize: 13,
    fontWeight: '500' as const,
    color: Colors.error,
  },
  deleteAccountLink: {
    minHeight: 64,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    marginBottom: 20,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Colors.error,
    backgroundColor: Colors.errorLight,
  },
  deleteAccountTextWrap: {
    flex: 1,
  },
  deleteAccountTextMM: {
    fontSize: 15,
    fontFamily: 'NotoSansMyanmar-Medium',
    color: Colors.error,
  },
  deleteAccountTextEN: {
    marginTop: 3,
    fontSize: 12,
    color: Colors.textSecondary,
  },
  // vC14 legacy logout button styles (removed in vC15, kept for reference)
  logoutButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.errorLight,
    padding: 16,
    borderRadius: 16,
    gap: 10,
    marginBottom: 16,
  },
  logoutText: {
    fontSize: 16,
    fontWeight: '700' as const,
    color: Colors.error,
  },
  version: {
    textAlign: 'center',
    fontSize: 12,
    color: Colors.textTertiary,
    marginBottom: 4,
  },
  customerId: {
    textAlign: 'center',
    fontSize: 10,
    color: Colors.textTertiary,
  },
});
