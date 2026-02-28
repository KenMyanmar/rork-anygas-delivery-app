import React, { useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  FlatList,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { User, MapPin, Phone, Flame } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import Colors from '@/constants/colors';
import { useAuth } from '@/providers/AuthProvider';
import { Customer } from '@/types';

export default function CustomerSelectScreen() {
  const { matchedCustomers, selectCustomer } = useAuth();

  const handleSelect = useCallback(async (customerId: string) => {
    if (Platform.OS !== 'web') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    }
    console.log('[CustomerSelect] Selected customer:', customerId);
    await selectCustomer(customerId);
    router.replace('/');
  }, [selectCustomer]);

  const renderCustomer = useCallback(({ item }: { item: Customer }) => (
    <TouchableOpacity
      style={styles.customerCard}
      onPress={() => handleSelect(item.id)}
      activeOpacity={0.8}
      testID={`customer-${item.id}`}
    >
      <View style={styles.avatarWrap}>
        <User size={28} color={Colors.primary} />
      </View>
      <View style={styles.customerInfo}>
        <Text style={styles.customerName}>{item.name}</Text>
        <View style={styles.detailRow}>
          <Phone size={12} color={Colors.textTertiary} />
          <Text style={styles.detailText}>{item.phone}</Text>
        </View>
        {item.address && (
          <View style={styles.detailRow}>
            <MapPin size={12} color={Colors.textTertiary} />
            <Text style={styles.detailText} numberOfLines={1}>{item.address}</Text>
          </View>
        )}
        {item.township && (
          <Text style={styles.townshipText}>{item.township}</Text>
        )}
      </View>
    </TouchableOpacity>
  ), [handleSelect]);

  return (
    <View style={styles.container}>
      <StatusBar style="light" />
      <View style={styles.topSection}>
        <SafeAreaView edges={['top']}>
          <View style={styles.headerContent}>
            <View style={styles.logoCircle}>
              <Flame size={32} color="#FFFFFF" strokeWidth={2.5} />
            </View>
            <Text style={styles.title}>Select Your Profile</Text>
            <Text style={styles.titleMM}>သင့်ပရိုဖိုင်ကို ရွေးချယ်ပါ</Text>
            <Text style={styles.subtitle}>
              Multiple accounts found with your phone number. Please select which profile is yours.
            </Text>
          </View>
        </SafeAreaView>
      </View>

      <View style={styles.bottomSection}>
        <FlatList
          data={matchedCustomers}
          renderItem={renderCustomer}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <Text style={styles.emptyText}>No profiles found</Text>
            </View>
          }
        />
      </View>
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
    backgroundColor: Colors.background,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
  },
  listContent: {
    padding: 20,
    gap: 12,
  },
  customerCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surface,
    padding: 18,
    borderRadius: 18,
    gap: 14,
    borderWidth: 1.5,
    borderColor: Colors.borderLight,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 8,
    elevation: 2,
  },
  avatarWrap: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: Colors.primaryLight,
    justifyContent: 'center',
    alignItems: 'center',
  },
  customerInfo: {
    flex: 1,
  },
  customerName: {
    fontSize: 17,
    fontWeight: '700' as const,
    color: Colors.textPrimary,
    marginBottom: 6,
  },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 3,
  },
  detailText: {
    fontSize: 13,
    color: Colors.textSecondary,
    flex: 1,
  },
  townshipText: {
    fontSize: 12,
    color: Colors.textTertiary,
    marginTop: 4,
    fontWeight: '500' as const,
  },
  emptyState: {
    alignItems: 'center',
    paddingTop: 60,
  },
  emptyText: {
    fontSize: 16,
    color: Colors.textTertiary,
  },
});
