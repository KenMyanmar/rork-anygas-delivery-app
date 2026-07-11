import React from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ChevronLeft } from 'lucide-react-native';
import { router, useLocalSearchParams } from 'expo-router';
import Colors from '@/constants/colors';

type LegalSection = {
  heading: string;
  body: string;
};

const PRIVACY_SECTIONS: LegalSection[] = [
  {
    heading: 'Information we collect',
    body: 'AnyGas collects the phone number used to sign in, your name, delivery address, township, optional landmark and optional precise location, together with order and delivery history. The app may also process technical usage and diagnostic information through service providers used to operate the app.',
  },
  {
    heading: 'How we use information',
    body: 'We use this information to authenticate you, connect you to your AnyGas customer record, price and fulfil LPG orders, communicate order status, provide support, prevent abuse and improve reliability.',
  },
  {
    heading: 'Sharing',
    body: 'Information is shared only as needed with AnyGas operations staff, participating suppliers, delivery personnel and infrastructure providers that help run the service. AnyGas does not sell personal information.',
  },
  {
    heading: 'Location choice',
    body: 'Sharing precise location is optional. You can always enter a delivery address manually. You can withdraw location permission in iOS Settings.',
  },
  {
    heading: 'Retention and deletion',
    body: 'Use “Delete my account permanently” in Profile to delete your app account. Order and hotline business records may be retained in anonymous form for service, safety, accounting and legal requirements. For access, correction or full PII-erasure support, call 8484.',
  },
  {
    heading: 'Contact',
    body: 'For privacy questions or requests, contact AnyGas by calling 8484 in Myanmar.',
  },
];

const TERMS_SECTIONS: LegalSection[] = [
  {
    heading: 'Service',
    body: 'AnyGas helps customers request LPG cylinders and related physical goods for delivery. Product availability, delivery time and service area may vary by supplier and location.',
  },
  {
    heading: 'Orders and prices',
    body: 'Review the displayed product, quantity, address and total before confirming. Server-confirmed prices apply. AnyGas may contact you if an item is unavailable or order details require clarification.',
  },
  {
    heading: 'Customer responsibilities',
    body: 'Provide accurate contact and delivery information, keep your phone and PIN secure, and use LPG products according to supplier and safety instructions. Do not use the service for unlawful or unsafe activity.',
  },
  {
    heading: 'Cancellations and failed delivery',
    body: 'Contact 8484 as soon as possible if an order must be changed or cancelled. Delivery may fail when the address cannot be reached, the customer is unavailable or fulfilment would be unsafe.',
  },
  {
    heading: 'Support',
    body: 'For questions about an order or these terms, call AnyGas at 8484.',
  },
];

export default function LegalScreen() {
  const { type } = useLocalSearchParams<{ type?: string }>();
  const isPrivacy = type === 'privacy';
  const title = isPrivacy ? 'Privacy Policy' : 'Terms of Service';
  const titleMM = isPrivacy ? 'ကိုယ်ရေးအချက်အလက် မူဝါဒ' : 'ဝန်ဆောင်မှု စည်းမျဉ်းများ';
  const sections = isPrivacy ? PRIVACY_SECTIONS : TERMS_SECTIONS;

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => router.back()}
          accessibilityRole="button"
          accessibilityLabel="Close"
        >
          <ChevronLeft size={24} color={Colors.textPrimary} />
        </TouchableOpacity>
        <View style={styles.headerTitles}>
          <Text style={styles.title}>{title}</Text>
          <Text style={styles.titleMM}>{titleMM}</Text>
        </View>
        <View style={styles.headerSpacer} />
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Text style={styles.updated}>Effective 11 July 2026</Text>
        {sections.map((section) => (
          <View key={section.heading} style={styles.section}>
            <Text style={styles.heading}>{section.heading}</Text>
            <Text style={styles.body}>{section.body}</Text>
          </View>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: Colors.background },
  header: {
    minHeight: 64,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: Colors.borderLight,
    backgroundColor: Colors.surface,
  },
  backButton: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 22,
  },
  headerTitles: { flex: 1, alignItems: 'center' },
  headerSpacer: { width: 44 },
  title: { fontSize: 18, fontWeight: '700', color: Colors.textPrimary },
  titleMM: { marginTop: 2, fontSize: 12, color: Colors.textSecondary },
  content: { padding: 20, paddingBottom: 48 },
  updated: { fontSize: 13, color: Colors.textTertiary, marginBottom: 20 },
  section: {
    backgroundColor: Colors.surface,
    borderRadius: 16,
    padding: 18,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: Colors.borderLight,
  },
  heading: { fontSize: 16, fontWeight: '700', color: Colors.textPrimary, marginBottom: 8 },
  body: { fontSize: 14, lineHeight: 21, color: Colors.textSecondary },
});
