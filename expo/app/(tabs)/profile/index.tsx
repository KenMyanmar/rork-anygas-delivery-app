import React, { useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Alert,
  Platform,
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
} from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import Colors from '@/constants/colors';
import { useAuth } from '@/providers/AuthProvider';
import { useI18n } from '@/providers/I18nProvider';

export default function ProfileScreen() {
  const { activeCustomer, activeProfile, savedAddresses, phoneNumber, logout } = useAuth();
  const { t, tMM, isMM, isEN, changeLanguage } = useI18n();

  const handleLogout = useCallback(() => {
    Alert.alert(
      t('log_out'),
      t('log_out_confirm'),
      [
        { text: t('cancel'), style: 'cancel' },
        {
          text: t('log_out'),
          style: 'destructive',
          onPress: async () => {
            console.log('[Profile] User confirmed logout');
            await logout();
            router.replace('/login');
          },
        },
      ]
    );
  }, [logout, t]);

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
            <Text style={styles.sectionTitle}>{t('registered_address')}</Text>
            <Text style={styles.sectionTitleMM}>{tMM('registered_address')}</Text>
          </View>
          <View style={styles.addressCard}>
            <View style={styles.addressIcon}>
              <MapPin size={16} color={Colors.primary} />
            </View>
            <Text style={styles.addressText}>{activeCustomer.address}</Text>
          </View>
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
            >
              <Text style={[styles.langBtnText, isMM && styles.langBtnTextActive]}>မြန်မာ</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.langBtn, isEN && styles.langBtnActive]}
              onPress={() => changeLanguage('en')}
              activeOpacity={0.7}
            >
              <Text style={[styles.langBtnText, isEN && styles.langBtnTextActive]}>English</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>

      <View style={styles.section}>
        <TouchableOpacity style={styles.menuItem} activeOpacity={0.7}>
          <Shield size={20} color={Colors.textSecondary} />
          <Text style={styles.menuItemText}>{t('privacy_security')}</Text>
          <ChevronRight size={18} color={Colors.textTertiary} />
        </TouchableOpacity>
        <TouchableOpacity style={styles.menuItem} activeOpacity={0.7}>
          <HelpCircle size={20} color={Colors.textSecondary} />
          <Text style={styles.menuItemText}>{t('help_support')}</Text>
          <ChevronRight size={18} color={Colors.textTertiary} />
        </TouchableOpacity>
        <TouchableOpacity style={styles.menuItem} activeOpacity={0.7}>
          <FileText size={20} color={Colors.textSecondary} />
          <Text style={styles.menuItemText}>{t('terms')}</Text>
          <ChevronRight size={18} color={Colors.textTertiary} />
        </TouchableOpacity>
      </View>

      <TouchableOpacity
        style={styles.logoutButton}
        onPress={handleLogout}
        activeOpacity={0.7}
      >
        <LogOut size={20} color={Colors.error} />
        <Text style={styles.logoutText}>{t('log_out')}</Text>
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
    borderRadius: 30,
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
    borderRadius: 10,
    backgroundColor: Colors.primaryLight,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 2,
  },
  addressText: {
    flex: 1,
    fontSize: 14,
    color: Colors.textSecondary,
    lineHeight: 20,
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
    borderRadius: 10,
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
    borderRadius: 8,
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
    borderRadius: 14,
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
    borderRadius: 14,
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
    borderRadius: 10,
    padding: 3,
    gap: 2,
  },
  langBtn: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 8,
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
  logoutButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.errorLight,
    padding: 16,
    borderRadius: 14,
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
