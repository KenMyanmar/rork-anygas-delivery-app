import React from 'react';
import {
  View,
  Text,
  StyleSheet,
} from 'react-native';
import { Bell } from 'lucide-react-native';
import Colors from '@/constants/colors';
import { useI18n } from '@/providers/I18nProvider';

export default function NotificationsScreen() {
  const { t, tMM } = useI18n();
  return (
    <View style={styles.container}>
      <View style={styles.emptyState}>
        <View style={styles.iconWrap}>
          <Bell size={48} color={Colors.textTertiary} />
        </View>
        <Text style={styles.emptyText}>{t('no_notifications')}</Text>
        <Text style={styles.emptyTextMM}>{tMM('no_notifications')}</Text>
        <Text style={styles.emptySubtext}>{t('no_notifications_sub')}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 120,
    paddingHorizontal: 32,
    gap: 8,
  },
  iconWrap: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: Colors.surface,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 8,
  },
  emptyText: {
    fontSize: 18,
    fontWeight: '700' as const,
    color: Colors.textPrimary,
  },
  emptyTextMM: {
    fontSize: 14,
    color: Colors.textSecondary,
  },
  emptySubtext: {
    fontSize: 14,
    color: Colors.textTertiary,
    textAlign: 'center' as const,
    marginTop: 4,
  },
});
