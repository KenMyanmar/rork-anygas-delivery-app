import React, { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Animated as RNAnimated,
  Platform,
  ActivityIndicator,
  Linking,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, router } from 'expo-router';
import {
  X,
  ChevronLeft,
  ChevronDown,
  Check,
  Package,
  Ruler,
  Settings,
  Receipt,
  MapPin,
  CreditCard,
  Banknote,
  Smartphone,
  Wifi,
  Flame,
  Cylinder,
  Crosshair,
  Navigation,
  Minus,
  Plus,
  RotateCw,
  Sparkles,
} from 'lucide-react-native';
import { Image } from 'react-native';
import * as Haptics from 'expo-haptics';
import { useQuery } from '@tanstack/react-query';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
  runOnJS,
  FadeIn,
  FadeOut,
  SlideInRight,
  SlideInLeft,
  SlideOutLeft,
  SlideOutRight,
  FadeInDown,
} from 'react-native-reanimated';
import Colors from '@/constants/colors';
import { useAuth } from '@/providers/AuthProvider';
import { useOrders } from '@/providers/OrderProvider';
import { YANGON_TOWNSHIPS } from '@/constants/townships';
import { Alert } from 'react-native';
import * as Location from 'expo-location';
import { ORDER_TYPES, PAYMENT_OPTIONS } from '@/constants/brands';
import {
  OrderType,
  PaymentMethod,
  PricingBreakdown,
  SavedAddress,
  CylinderOption,
  EquipmentBundle,
} from '@/types';
import { fetchCatalog, displayBrandName, CatalogEntry } from '@/lib/catalog';
import { fetchEquipmentBundles, bundleBrandLabel, computeComponentValue } from '@/lib/bundles';
import { useI18n } from '@/providers/I18nProvider';
import {
  ScalePressable,
  Skeleton,
  SPRING,
  DURATION,
  EASE_OUT,
  useReduceMotion,
  AnimatedNumber,
} from '@/lib/motion';
import { SuccessOverlay } from '@/components/SuccessOverlay';

// Derived from catalog-list response — single source of truth.
interface CatalogBrand {
  id: string;
  name: string;
  logo_url: string | null;
  sort_order: number;
  refill_delivery_fee: number;
  allow_new_setup: boolean;
}

// vC17 r2: intent-first flow. Intent (Refill/New Set) is the first screen;
// the memory shortcut ("Your usual") appears for repeat refill customers.
// The old standalone 'type' step is gone — intent replaces it.
type Step = 'intent' | 'usual' | 'brand' | 'size' | 'pricing' | 'bundles' | 'address' | 'payment' | 'confirm';

const STEP_LABELS: Record<Step, string> = {
  intent: 'Order',
  usual: 'Usual',
  brand: 'Brand',
  size: 'Size',
  pricing: 'Price',
  bundles: 'Sets',
  address: 'Address',
  payment: 'Payment',
  confirm: 'Confirm',
};

// vC17: client-side quantity cap. EF accepts 1–10; 5 is the sane household ceiling.
const MAX_QUANTITY = 5;
const MIN_QUANTITY = 1;

const BRAND_COLORS: Record<string, string> = {
  'Parami': '#DC2626',
  'Easy': '#2563EB',
  'World': '#059669',
};

function getBrandColor(name: string): string {
  for (const [key, color] of Object.entries(BRAND_COLORS)) {
    if (name.toLowerCase().includes(key.toLowerCase())) return color;
  }
  return Colors.primary;
}

// Server v45 contract: refill = 6000 for Other Partners (brand 62a6da96...), 3000 for all others;
// new_setup = 0. Server recomputes and rejects >1% client mismatch (409).
// vC13: exchange/service_call removed from the customer surface (2-SKU).
// Brand identified by name ('Other Partners') since the full UUID isn't in the client repo.
// Fallback only — the catalog-list edge function supplies refill_delivery_fee per brand,
// so the live DB value is authoritative. These are safety nets if a brand row is missing the column.
const REFILL_FEE_STANDARD = 3000;
const REFILL_FEE_OTHER_PARTNERS = 6000;

function getPaymentIcon(iconName: string, color: string) {
  const size = 22;
  switch (iconName) {
    case 'banknote': return <Banknote size={size} color={color} />;
    case 'smartphone': return <Smartphone size={size} color={color} />;
    case 'wifi': return <Wifi size={size} color={color} />;
    case 'credit-card': return <CreditCard size={size} color={color} />;
    default: return <CreditCard size={size} color={color} />;
  }
}

function formatPrice(amount: number): string {
  return Math.round(amount).toLocaleString();
}

export default function OrderScreen() {
  const params = useLocalSearchParams<{
    reorderBrand?: string;
    reorderSize?: string;
    reorderType?: string;
  }>();
  const { savedAddresses, getDefaultAddress, customerId, activeCustomer, updateCustomerAddress } = useAuth();
  const { placeOrder, placeBundleOrder, getLastDeliveredOrder, orders } = useOrders();
  const { t, tMM, language, isMM } = useI18n();

  // vC17 r2: intent-first flow. Intent is the first screen; the memory
  // shortcut ("Your usual") appears for repeat refill customers.
  const [currentStep, setCurrentStep] = useState<Step>('intent');
  const [selectedBrandId, setSelectedBrandId] = useState<string | null>(
    params.reorderBrand || null
  );
  const [selectedCylinder, setSelectedCylinder] = useState<CylinderOption | null>(null);
  const [selectedType, setSelectedType] = useState<OrderType | null>(
    (params.reorderType as OrderType) || null
  );
  // vC17: quantity stepper — floor 1, cap 5 client-side (EF accepts 10).
  const [quantity, setQuantity] = useState<number>(1);
  // vC13 Task B: address gate — checks activeCustomer.address only (orders.address
  // is NOT NULL; create-customer-order inserts customer.address → NULL crashes 500).
  // 80% of app-linked customers have no address. The gate prompts before checkout.
  const customerHasAddress = !!activeCustomer?.address;
  const customerAddress: SavedAddress | null = customerHasAddress
    ? {
        id: 'customer_default',
        label: activeCustomer?.township || 'Township',
        address: activeCustomer?.township
          ? `${activeCustomer.address}, ${activeCustomer.township}`
          : activeCustomer.address!,
        latitude: 0,
        longitude: 0,
        isDefault: true,
      }
    : null;

  const [selectedAddress, setSelectedAddress] = useState<SavedAddress | null>(
    customerAddress || getDefaultAddress()
  );
  const [showAddressStep, setShowAddressStep] = useState<boolean>(false);
  // vC13 Task B: address gate form state. The form doubles as add + edit.
  const [editingAddress, setEditingAddress] = useState<boolean>(!customerHasAddress);
  const [pendingAddress, setPendingAddress] = useState<string>(activeCustomer?.address || '');
  const [pendingTownship, setPendingTownship] = useState<string>(activeCustomer?.township || '');
  // vC16 Task B: landmark + GPS capture in the address gate form
  const [pendingLandmark, setPendingLandmark] = useState<string>(activeCustomer?.landmark || '');
  const [pendingGpsLat, setPendingGpsLat] = useState<number | null>(activeCustomer?.gps_lat ?? null);
  const [pendingGpsLng, setPendingGpsLng] = useState<number | null>(activeCustomer?.gps_lng ?? null);
  const [locationStatus, setLocationStatus] = useState<'idle' | 'loading' | 'saved' | 'denied'>('idle');
  const [addressSaveError, setAddressSaveError] = useState<string | null>(null);
  const [isSavingAddress, setIsSavingAddress] = useState<boolean>(false);
  const [townshipPickerOpen, setTownshipPickerOpen] = useState<boolean>(false);
  const [selectedPayment, setSelectedPayment] = useState<PaymentMethod | null>(null);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const slideAnim = useRef(new RNAnimated.Value(0)).current;
  // vD-MOTION: step direction for directional transitions (moment 2).
  const stepDirection = useRef<'forward' | 'back'>('forward');
  // vD-MOTION: order-placed celebration (moment 4).
  const [showSuccess, setShowSuccess] = useState<boolean>(false);
  const [successSummary, setSuccessSummary] = useState<string>('');
  const [successTotal, setSuccessTotal] = useState<string>('');

  // NS-2: selected equipment bundle (New Set path). When set, the confirm
  // screen shows the bundle name and placeBundleOrder is used instead of
  // placeOrder. The server prices from bundle_price — no client computation.
  const [selectedBundle, setSelectedBundle] = useState<EquipmentBundle | null>(null);

  // Single fetch via the catalog-list edge function — same source the Mini App uses.
  // Returns brands (with refill_delivery_fee + allow_new_setup) and their products in one call.
  const catalogQuery = useQuery({
    queryKey: ['catalog'],
    queryFn: async () => {
      console.log('[Order] Fetching catalog via catalog-list');
      return await fetchCatalog();
    },
  });

  // NS-2: equipment bundles (New Set showcase). RLS exposes only visible bundles
  // (active + show_in_app + validity window). Empty result → the New Set intent
  // card shows a disabled "promotions coming" state and does not navigate.
  const bundlesQuery = useQuery({
    queryKey: ['equipment_bundles'],
    queryFn: async () => {
      console.log('[Order] Fetching equipment_bundles');
      return await fetchEquipmentBundles();
    },
  });
  const visibleBundles: EquipmentBundle[] = useMemo(() => bundlesQuery.data || [], [bundlesQuery.data]);
  const hasVisibleBundles = visibleBundles.length > 0;

  const brands: CatalogBrand[] = useMemo(() => {
    if (!catalogQuery.data) return [];
    return catalogQuery.data.map(entry => ({
      id: entry.brand.id,
      name: entry.brand.name,
      logo_url: entry.brand.logo_url,
      sort_order: entry.brand.sort_order,
      refill_delivery_fee: entry.brand.refill_delivery_fee,
      allow_new_setup: entry.brand.allow_new_setup,
    }));
  }, [catalogQuery.data]);

  const selectedCatalogEntry: CatalogEntry | null = useMemo(() => {
    if (!catalogQuery.data || !selectedBrandId) return null;
    return catalogQuery.data.find(e => e.brand.id === selectedBrandId) || null;
  }, [catalogQuery.data, selectedBrandId]);

  const cylindersLoading = catalogQuery.isLoading;
  const cylindersError = catalogQuery.isError;

  // Build cylinder options from the selected brand's products in the catalog response.
  const cylinderOptions: CylinderOption[] = useMemo(() => {
    if (!selectedCatalogEntry) return [];
    const pricePerKg = selectedCatalogEntry.price_per_kg ?? selectedCatalogEntry.brand?.refill_delivery_fee ?? 0;
    return selectedCatalogEntry.products.map(p => ({
      id: p.cylinder_type_id,
      size: p.size_kg,
      displayName: p.display_name,
      cylinderPrice: p.cylinder_price,
      pricePerKg: p.price_per_kg,
      gasPrice: Math.round(p.price_per_kg * p.size_kg),
      imageUrl: p.image_url,
    }));
  }, [selectedCatalogEntry]);

  // vC17 r2: reorder deep-link from the home "Quick reorder" card. Prefills
  // brand/size/type and jumps straight to pricing (skipping the intent screen).
  useEffect(() => {
    if (params.reorderBrand && params.reorderSize && params.reorderType) {
      setSelectedType((params.reorderType as OrderType) || null);
      setCurrentStep('pricing');
    }
  }, []);

  // vC17 r2: memory shortcut — last delivered (or most recent) order for the
  // "Your usual" card. Only shown for refill intent + customers with history.
  const lastDeliveredOrder = useMemo(() => getLastDeliveredOrder(), [getLastDeliveredOrder, orders]);
  const usualBrandId = lastDeliveredOrder?.brandId || null;
  const usualCylinderSize = lastDeliveredOrder?.cylinderSize || null;
  const usualQuantity = lastDeliveredOrder?.quantity || 1;
  const usualOrderType = lastDeliveredOrder?.orderType || null;
  const usualBrandName = lastDeliveredOrder?.brandName || null;
  const usualCylinderType = lastDeliveredOrder?.cylinderType || null;
  const usualTotal = lastDeliveredOrder?.pricing?.total || null;
  const hasUsual = !!(usualBrandId && usualCylinderSize && usualOrderType);
  // Catalog entry for the usual brand — needed to resolve the cylinder option
  // object when the customer taps "Order again".
  const usualCatalogEntry = useMemo(() => {
    if (!catalogQuery.data || !usualBrandId) return null;
    return catalogQuery.data.find(e => e.brand.id === usualBrandId) || null;
  }, [catalogQuery.data, usualBrandId]);

  const selectedBrand = useMemo(() => {
    const brand = brands.find(b => b.id === selectedBrandId) || null;
    if (brand) {
      return { ...brand, name: displayBrandName(brand.name) };
    }
    return brand;
  }, [brands, selectedBrandId]);

  // vC17 r2: step sequence is dynamic. Intent is always first. For refill,
  // the path is brand → size → pricing. For New Set (NS-2), the brand step is
  // GONE — the customer picks a bundle directly; brand is baked into each
  // bundle and shown as a label on the card, never as a choice. The address
  // step is gated as before.
  const needsAddressStep = !customerHasAddress || showAddressStep || editingAddress;
  const buildSteps = useCallback((): Step[] => {
    if (selectedType === 'new_setup') {
      // NS-2: New Set path skips brand + size entirely.
      const base: Step[] = ['intent', 'bundles'];
      if (needsAddressStep) base.push('address');
      base.push('payment', 'confirm');
      return base;
    }
    const base: Step[] = ['intent', 'brand', 'size', 'pricing'];
    if (needsAddressStep) base.push('address');
    base.push('payment', 'confirm');
    return base;
  }, [needsAddressStep, selectedType]);
  const steps = buildSteps();
  const currentStepIndex = steps.indexOf(currentStep);
  const progress = currentStepIndex >= 0 ? (currentStepIndex + 1) / steps.length : 0;

  const animateTransition = useCallback(() => {
    slideAnim.setValue(30);
    RNAnimated.spring(slideAnim, { toValue: 0, tension: 80, friction: 12, useNativeDriver: true }).start();
  }, [slideAnim]);

  const goNext = useCallback(() => {
    const idx = steps.indexOf(currentStep);
    if (idx < steps.length - 1) {
      if (Platform.OS !== 'web') {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      }
      stepDirection.current = 'forward';
      setCurrentStep(steps[idx + 1]);
      animateTransition();
    }
  }, [currentStep, animateTransition, steps]);

  // vC17 r2: selecting an intent card drives the whole downstream flow.
  // Refill + history → show the "Your usual" card (inline on the intent step).
  // NS-2: New Set → bundle showcase (brand is baked into each bundle, never
  // a standalone step). If no visible bundles exist, the New Set card is
  // disabled and shows a "promotions coming" state — it does not navigate.
  const handleSelectIntent = useCallback((intent: OrderType) => {
    if (Platform.OS !== 'web') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    }
    setSelectedType(intent);
    // Reset downstream selections so a prior brand/cylinder from a different
    // intent doesn't bleed through (e.g. a new_setup-only brand for refill).
    setSelectedBrandId(null);
    setSelectedCylinder(null);
    setQuantity(1);
    setSelectedBundle(null);
    stepDirection.current = 'forward';
    if (intent === 'new_setup') {
      // NS-2: New Set goes straight to the bundle showcase (no brand step).
      setCurrentStep('bundles');
    } else {
      setCurrentStep('brand');
    }
    animateTransition();
  }, [animateTransition]);

  // vC17 r2: "Order again" from the usual card — prefill brand/cylinder/qty
  // from the last delivered order and jump straight to confirm (pricing step).
  const handleOrderAgain = useCallback(() => {
    if (!hasUsual || !usualCatalogEntry) return;
    if (Platform.OS !== 'web') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    }
    const cyl = usualCatalogEntry.products.find(p => p.size_kg === usualCylinderSize);
    if (cyl) {
      const pricePerKg = cyl.price_per_kg ?? usualCatalogEntry.price_per_kg ?? 0;
      setSelectedCylinder({
        id: cyl.cylinder_type_id,
        size: cyl.size_kg,
        displayName: cyl.display_name,
        cylinderPrice: cyl.cylinder_price,
        pricePerKg,
        gasPrice: Math.round(pricePerKg * cyl.size_kg),
        imageUrl: cyl.image_url,
      });
    }
    setSelectedBrandId(usualBrandId);
    setSelectedType(usualOrderType);
    setQuantity(usualQuantity);
    stepDirection.current = 'forward';
    setCurrentStep('pricing');
    animateTransition();
  }, [hasUsual, usualCatalogEntry, usualCylinderSize, usualBrandId, usualOrderType, usualQuantity, animateTransition]);

  // vC17: quantity stepper handlers with haptics.
  const incrementQty = useCallback(() => {
    setQuantity(prev => {
      const next = Math.min(prev + 1, MAX_QUANTITY);
      if (next !== prev && Platform.OS !== 'web') {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      }
      return next;
    });
  }, []);
  const decrementQty = useCallback(() => {
    setQuantity(prev => {
      const next = Math.max(prev - 1, MIN_QUANTITY);
      if (next !== prev && Platform.OS !== 'web') {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      }
      return next;
    });
  }, []);

  const goBack = useCallback(() => {
    if (currentStep === 'address' && customerHasAddress && !editingAddress) {
      setShowAddressStep(false);
      setEditingAddress(false);
      stepDirection.current = 'back';
      setCurrentStep('pricing');
      animateTransition();
      return;
    }
    if (currentStep === 'address' && editingAddress && customerHasAddress) {
      // Was editing an existing address — go back to address display, not the form.
      setEditingAddress(false);
      setAddressSaveError(null);
      animateTransition();
      return;
    }
    const idx = steps.indexOf(currentStep);
    if (idx > 0) {
      stepDirection.current = 'back';
      setCurrentStep(steps[idx - 1]);
      animateTransition();
    } else {
      router.back();
    }
  }, [currentStep, animateTransition, steps, showAddressStep, customerHasAddress, editingAddress]);

  const calculatePricing = useCallback((): PricingBreakdown => {
    if (!selectedCylinder || !selectedType) {
      return { gasPrice: 0, cylinderPrice: 0, deliveryFee: 0, total: 0 };
    }
    const gasPrice = Math.round(selectedCylinder.pricePerKg * selectedCylinder.size * quantity);
    let cylinderPrice = 0;
    let deliveryFee = 0;

    if (selectedType === 'refill') {
      // Authoritative: refill_delivery_fee from the catalog-list response (DB-sourced).
      // Fallback to the v45 contract constants only if the column is missing.
      // vC17: delivery fee is per-trip by business design — never multiplied by qty.
      const dbFee = selectedCatalogEntry?.brand?.refill_delivery_fee;
      if (dbFee != null) {
        deliveryFee = dbFee;
      } else {
        deliveryFee = selectedBrand?.name === 'Other Partners'
          ? REFILL_FEE_OTHER_PARTNERS
          : REFILL_FEE_STANDARD;
      }
    } else if (selectedType === 'new_setup') {
      // vC17: cylinder cost scales with quantity; delivery is free for new setups.
      cylinderPrice = selectedCylinder.cylinderPrice * quantity;
      deliveryFee = 0;
    }
    // vC13: exchange/service_call removed from the customer surface (2-SKU).
    // They remain in the EF contract for hotline/CRM operations.

    const total = gasPrice + cylinderPrice + deliveryFee;
    return { gasPrice, cylinderPrice, deliveryFee, total };
  }, [selectedCylinder, selectedType, quantity, selectedBrand, selectedCatalogEntry]);

  const handleConfirmOrder = useCallback(async () => {
    if (!selectedType || !selectedAddress || !selectedPayment || !customerId) return;
    setIsSubmitting(true);
    try {
      // NS-2: bundle path — the server prices from bundle_price. We send ONLY
      // {bundleId, clientTotal, orderType, quantity, paymentMethod}. No
      // cylinderType/sizeKg/brandId on the bundle path — the server derives them.
      if (selectedType === 'new_setup' && selectedBundle) {
        await placeBundleOrder({
          bundleId: selectedBundle.id,
          bundleName: selectedBundle.name,
          bundlePrice: selectedBundle.bundle_price,
          paymentMethod: selectedPayment,
          address: selectedAddress,
        });
        // vD-MOTION moment 4: fire the celebration, then navigate on dismiss.
        setSuccessSummary(selectedBundle.name);
        setSuccessTotal(`${formatPrice(selectedBundle.bundle_price)} MMK`);
        setShowSuccess(true);
        return;
      }
      // Refill path — existing flow.
      if (!selectedBrandId || !selectedCylinder) return;
      const pricingData = calculatePricing();
      await placeOrder({
        brandId: selectedBrandId,
        brandName: selectedBrand?.name,
        cylinderTypeId: selectedCylinder.id,
        cylinderDisplayName: selectedCylinder.displayName,
        cylinderSize: selectedCylinder.size,
        orderType: selectedType,
        quantity,
        paymentMethod: selectedPayment,
        deliveryFee: pricingData.deliveryFee,
        totalAmount: pricingData.total,
        address: selectedAddress,
        pricing: pricingData,
      });
      // vD-MOTION moment 4: fire the celebration, then navigate on dismiss.
      const sumQty = quantity > 1 ? `${quantity}× ` : '';
      setSuccessSummary(`${sumQty}${selectedBrand?.name || 'Gas'} ${selectedCylinder.size}kg`);
      setSuccessTotal(`${formatPrice(pricingData.total)} MMK`);
      setShowSuccess(true);
    } catch (e: unknown) {
      const errorMessage = e instanceof Error ? e.message : t('order_failed');
      console.log('[Order] Error placing order:', errorMessage);
      // NS-2: handle bundle_not_available (promotion ended mid-flow).
      if (errorMessage === 'bundle_not_available') {
        Alert.alert(
          isMM ? 'ပရိုမိုးရှင်း' : 'Promotion',
          t('bundle_not_available'),
          [
            {
              text: 'OK',
              onPress: () => {
                bundlesQuery.refetch();
                setSelectedBundle(null);
                setCurrentStep('bundles');
                animateTransition();
              },
            },
          ],
        );
        return;
      }
      Alert.alert(t('order_failed'), errorMessage);
    } finally {
      setIsSubmitting(false);
    }
  }, [selectedBrandId, selectedBrand, selectedCylinder, selectedType, selectedBundle, selectedAddress, selectedPayment, customerId, quantity, calculatePricing, placeOrder, placeBundleOrder, t, isMM, bundlesQuery, animateTransition]);

  // vD-MOTION moment 4: when the success overlay dismisses, navigate to tracking.
  const handleSuccessDone = useCallback(() => {
    setShowSuccess(false);
    router.replace('/(tabs)/(home)/tracking');
  }, []);

  const pricing = calculatePricing();

  const renderStepContent = () => {
    switch (currentStep) {
      // vC17 r2: Step 1 — Intent (Refill / New Set). Two big cards, Burmese-first.
      // For refill + history, the "Your usual" memory shortcut appears above.
      case 'intent':
        return (
          <View style={styles.stepContent}>
            <Text style={styles.stepTitle}>{t('intent_title')}</Text>
            <Text style={styles.stepTitleMM}>{tMM('intent_title')}</Text>

            {/* vC17 r2: memory shortcut — only for refill intent + history. */}
            {hasUsual && (
              <View style={styles.usualCard}>
                <View style={styles.usualHeader}>
                  <RotateCw size={16} color={Colors.primary} />
                  <Text style={styles.usualTitle}>{t('usual_card_title')}</Text>
                </View>
                <Text style={styles.usualDetail}>
                  {usualQuantity > 1 ? `${usualQuantity}× ` : ''}{usualBrandName || 'Gas'} {usualCylinderSize}kg{usualCylinderType ? ` · ${usualCylinderType}` : ''}
                </Text>
                {usualTotal != null && (
                  <Text style={styles.usualPrice}>{formatPrice(usualTotal)} MMK</Text>
                )}
                <View style={styles.usualActions}>
                  <ScalePressable
                    style={styles.usualOrderBtn}
                    onPress={handleOrderAgain}
                    testID="usual-order-again"
                  >
                    <Flame size={16} color="#FFFFFF" />
                    <Text style={styles.usualOrderBtnText}>{t('order_again')}</Text>
                  </ScalePressable>
                  <ScalePressable
                    style={styles.usualChangeBtn}
                    onPress={() => handleSelectIntent('refill')}
                  >
                    <Text style={styles.usualChangeBtnText}>{t('usual_change')}</Text>
                  </ScalePressable>
                </View>
              </View>
            )}

            <View style={styles.intentGrid}>
              {/* Refill — the default highway (94.9% of orders). */}
              <ScalePressable
                style={styles.intentCard}
                onPress={() => handleSelectIntent('refill')}
                testID="intent-refill"
              >
                <View style={[styles.intentIconWrap, styles.intentIconRefill]}>
                  <Flame size={28} color="#FFFFFF" />
                </View>
                <Text style={styles.intentTitleMM}>{tMM('intent_refill_title')}</Text>
                <Text style={styles.intentTitle}>{t('intent_refill_title')}</Text>
                <Text style={styles.intentDesc}>{t('intent_refill_desc')}</Text>
              </ScalePressable>

              {/* New Set — cylinder + regulator. NS-2: when no visible bundles
                  exist, the card shows a disabled "promotions coming" state and
                  does not navigate. Brand is baked into each bundle, never a step. */}
              <ScalePressable
                style={[
                  styles.intentCard,
                  !hasVisibleBundles && styles.intentCardDisabled,
                ]}
                onPress={() => hasVisibleBundles && handleSelectIntent('new_setup')}
                disabled={!hasVisibleBundles}
                testID="intent-newset"
              >
                <View style={[styles.intentIconWrap, styles.intentIconNewSet, !hasVisibleBundles && styles.intentIconWrapDisabled]}>
                  <Sparkles size={28} color={hasVisibleBundles ? '#FFFFFF' : Colors.textTertiary} />
                </View>
                <Text style={[styles.intentTitleMM, !hasVisibleBundles && styles.intentTitleDisabled]}>{tMM('intent_newset_title')}</Text>
                <Text style={[styles.intentTitle, !hasVisibleBundles && styles.intentTitleDisabled]}>{t('intent_newset_title')}</Text>
                <Text style={styles.intentDesc}>{t('intent_newset_desc')}</Text>
                <View style={[
                  styles.intentBadge,
                  hasVisibleBundles ? styles.intentBadgeActive : styles.intentBadgeComingSoon,
                ]}>
                  <Text style={[
                    styles.intentBadgeText,
                    hasVisibleBundles ? styles.intentBadgeTextActive : styles.intentBadgeTextComingSoon,
                  ]}>
                    {hasVisibleBundles
                      ? `${visibleBundles.length} ${isMM ? 'ပက်ကေ့ဂျ်' : 'packages'}`
                      : t('intent_promotions_soon')}
                  </Text>
                </View>
              </ScalePressable>
            </View>
          </View>
        );

      // NS-2: New Set path — bundle showcase. Brand is baked into each bundle
      // (shown as a label on the card, never a choice). RLS exposes only
      // visible bundles; empty result → empty state with a hotline prompt.
      case 'bundles':
        return (
          <View style={styles.stepContent}>
            <Text style={styles.stepTitle}>{t('bundles_title')}</Text>
            <Text style={styles.stepTitleMM}>{tMM('bundles_title')}</Text>
            <Text style={styles.bundlesSub}>{t('bundles_sub')}</Text>
            {bundlesQuery.isLoading ? (
              <View style={styles.bundlesList}>
                {[1, 2].map((i) => (
                  <View key={i} style={styles.bundleCard}>
                    <View style={styles.bundleCardTop}>
                      <Skeleton width={80} height={80} borderRadius={12} />
                      <View style={{ flex: 1, gap: 6 }}>
                        <Skeleton width={120} height={18} />
                        <Skeleton width={80} height={12} />
                      </View>
                    </View>
                    <Skeleton width="100%" height={60} borderRadius={12} style={{ marginBottom: 14 }} />
                    <Skeleton width={100} height={22} />
                  </View>
                ))}
              </View>
            ) : bundlesQuery.isError ? (
              <View style={styles.errorWrap}>
                <Text style={styles.errorText}>{isMM ? 'ပက်ကေ့ဂျ်များ ရှာမတွေ့ပါ' : 'Failed to load packages'}</Text>
                <TouchableOpacity
                  style={styles.retryBtn}
                  onPress={() => bundlesQuery.refetch()}
                >
                  <Text style={styles.retryText}>{t('retry')}</Text>
                </TouchableOpacity>
              </View>
            ) : visibleBundles.length === 0 ? (
              <View style={styles.bundlesEmpty}>
                <Sparkles size={48} color={Colors.textTertiary} />
                <Text style={styles.bundlesEmptyTitle}>{t('bundles_empty')}</Text>
                <Text style={styles.bundlesEmptySub}>{t('bundles_empty_sub')}</Text>
                <TouchableOpacity
                  style={styles.bundlesHotlineBtn}
                  onPress={() => Linking.openURL('tel:8484')}
                  activeOpacity={0.7}
                >
                  <Text style={styles.bundlesHotlineBtnText}>8484</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <View style={styles.bundlesList}>
                {visibleBundles.map((bundle, bundleIdx) => {
                  const componentValue = computeComponentValue(bundle);
                  const savings = componentValue > bundle.bundle_price ? componentValue - bundle.bundle_price : 0;
                  const brandLabel = bundleBrandLabel(bundle);
                  const isSelected = selectedBundle?.id === bundle.id;
                  return (
                    <ScalePressable
                      key={bundle.id}
                      style={[
                        styles.bundleCard,
                        isSelected && styles.bundleCardSelected,
                      ]}
                      onPress={() => {
                        if (Platform.OS !== 'web') {
                          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                        }
                        setSelectedBundle(bundle);
                      }}
                      testID={`bundle-card-${bundle.id}`}
                      entering={FadeInDown.delay(Math.min(bundleIdx, 6) * 40).springify().damping(18).stiffness(180)}
                    >
                      <View style={styles.bundleCardTop}>
                        {bundle.image_url ? (
                          <Image
                            source={{ uri: bundle.image_url }}
                            style={styles.bundleImage}
                            resizeMode="cover"
                          />
                        ) : (
                          <View style={styles.bundleImageFallback}>
                            <Package size={36} color={Colors.primary} />
                          </View>
                        )}
                        <View style={styles.bundleInfo}>
                          <Text style={styles.bundleName}>{bundle.name}</Text>
                          {brandLabel ? (
                            <View style={styles.bundleBrandRow}>
                              <Text style={styles.bundleBrandLabel}>{t('bundle_brand_label')}: </Text>
                              <Text style={styles.bundleBrandValue}>{brandLabel}</Text>
                            </View>
                          ) : null}
                        </View>
                      </View>

                      {/* Itemized component value with strikethrough where computable */}
                      {(bundle.cylinder_type || bundle.stove || (bundle.bundle_accessories && bundle.bundle_accessories.length > 0)) && (
                        <View style={styles.bundleComponents}>
                          <Text style={styles.bundleComponentsTitle}>{t('bundle_includes')}</Text>
                          {bundle.cylinder_type && (
                            <View style={styles.bundleComponentRow}>
                              <Text style={styles.bundleComponentName}>
                                {bundle.cylinder_type.display_name || `${bundle.cylinder_type.size_kg}kg cylinder`}
                              </Text>
                              {bundle.cylinder_type.cylinder_price != null && !Number.isNaN(bundle.cylinder_type.cylinder_price) && (
                                <Text style={styles.bundleComponentValue}>
                                  {formatPrice(bundle.cylinder_type.cylinder_price)} K
                                </Text>
                              )}
                            </View>
                          )}
                          {bundle.stove && (
                            <View style={styles.bundleComponentRow}>
                              <Text style={styles.bundleComponentName}>{bundle.stove.name}</Text>
                              {bundle.stove.price != null && !Number.isNaN(bundle.stove.price) && (
                                <Text style={styles.bundleComponentValue}>
                                  {formatPrice(bundle.stove.price)} K
                                </Text>
                              )}
                            </View>
                          )}
                          {(bundle.bundle_accessories || []).map((acc, i) => {
                            if (!acc.accessory) return null;
                            const unitPrice = acc.accessory.price;
                            const lineTotal = unitPrice != null && !Number.isNaN(unitPrice) ? unitPrice * (acc.quantity || 1) : null;
                            return (
                              <View key={`acc-${i}`} style={styles.bundleComponentRow}>
                                <Text style={styles.bundleComponentName}>
                                  {acc.quantity > 1 ? `${acc.quantity}× ` : ''}{acc.accessory.name}
                                </Text>
                                {lineTotal != null && (
                                  <Text style={styles.bundleComponentValue}>
                                    {formatPrice(lineTotal)} K
                                  </Text>
                                )}
                              </View>
                            );
                          })}
                        </View>
                      )}

                      {/* Price row with optional savings */}
                      <View style={styles.bundlePriceRow}>
                        <View style={styles.bundlePriceLeft}>
                          <Text style={styles.bundlePriceLabel}>{t('bundle_price')}</Text>
                          {savings > 0 && componentValue > 0 && (
                            <Text style={styles.bundleValueStrikethrough}>
                              {formatPrice(componentValue)} K
                            </Text>
                          )}
                        </View>
                        <Text style={styles.bundlePriceValue}>{formatPrice(bundle.bundle_price)} K</Text>
                      </View>
                      {savings > 0 && (
                        <View style={styles.bundleSavingsChip}>
                          <Text style={styles.bundleSavingsText}>
                            {t('bundle_save').replace('{n}', formatPrice(savings))}
                          </Text>
                        </View>
                      )}
                      <View style={styles.bundleFreeDeliveryRow}>
                        <Text style={styles.bundleFreeDeliveryText}>{t('bundle_free_delivery')}</Text>
                      </View>
                      {isSelected && (
                        <View style={styles.bundleSelectedBadge}>
                          <Check size={16} color="#FFFFFF" />
                        </View>
                      )}
                    </ScalePressable>
                  );
                })}
              </View>
            )}
          </View>
        );

      case 'brand':
        return (
          <View style={styles.stepContent}>
            <Text style={styles.stepTitle}>{t('select_brand')}</Text>
            <Text style={styles.stepTitleMM}>{tMM('select_brand')}</Text>
            {/* vC17 r2: show the selected intent as a context chip. */}
            <View style={styles.intentContextRow}>
              <View style={styles.intentContextChip}>
                <Text style={styles.intentContextText}>
                  {selectedType === 'new_setup' ? t('intent_newset_title') : t('intent_refill_title')}
                </Text>
              </View>
            </View>
            {catalogQuery.isLoading ? (
              <View style={styles.optionsGrid}>
                {[1, 2, 3, 4].map((i) => (
                  <View key={i} style={styles.brandOption}>
                    <Skeleton width={72} height={72} borderRadius={16} style={{ marginBottom: 12 }} />
                    <Skeleton width={60} height={14} />
                  </View>
                ))}
              </View>
            ) : catalogQuery.isError ? (
              <View style={styles.errorWrap}>
                <Text style={styles.errorText}>{t('failed_brands')}</Text>
                <TouchableOpacity
                  style={styles.retryBtn}
                  onPress={() => catalogQuery.refetch()}
                >
                  <Text style={styles.retryText}>{t('retry')}</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <View style={styles.optionsGrid}>
                {/* vC17 r2: filter brands by intent. New Set shows only
                    allow_new_setup brands; Refill shows all. */}
                {brands.filter(b => selectedType !== 'new_setup' || b.allow_new_setup).map((brand, brandIdx) => {
                  const color = getBrandColor(brand.name);
                  const displayName = displayBrandName(brand.name);
                  return (
                    <ScalePressable
                      key={brand.id}
                      style={[
                        styles.brandOption,
                        selectedBrandId === brand.id && { borderColor: color, borderWidth: 2.5, backgroundColor: color + '08' },
                      ]}
                      onPress={() => {
                        setSelectedBrandId(brand.id);
                        setSelectedCylinder(null);
                      }}
                      entering={FadeInDown.delay(Math.min(brandIdx, 6) * 40).springify().damping(18).stiffness(180)}
                    >
                      {brand.logo_url ? (
                        <Image
                          source={{ uri: brand.logo_url }}
                          style={styles.brandLogoImage}
                          resizeMode="contain"
                        />
                      ) : (
                        <View style={[styles.brandLogoFallback, { backgroundColor: color + '15' }]}>
                          <Text style={[styles.brandLogoLetter, { color }]}>{displayName.charAt(0)}</Text>
                        </View>
                      )}
                      <Text style={styles.brandOptionName}>{displayName}</Text>
                      {selectedBrandId === brand.id && (
                        <View style={[styles.checkBadge, { backgroundColor: color }]}>
                          <Check size={14} color="#FFF" />
                        </View>
                      )}
                    </ScalePressable>
                  );
                })}
              </View>
            )}
          </View>
        );

      // vC17 r2: Step 4 — Cylinder + Quantity. Size selection + stepper.
      case 'size':
        return (
          <View style={styles.stepContent}>
            <Text style={styles.stepTitle}>{t('select_size')}</Text>
            <Text style={styles.stepTitleMM}>{tMM('select_size')}</Text>
            {cylindersLoading ? (
              <View style={styles.sizeGrid}>
                {[1, 2].map((i) => (
                  <View key={i} style={styles.sizeOption}>
                    <Skeleton width={56} height={56} borderRadius={12} style={{ marginBottom: 8 }} />
                    <Skeleton width={40} height={32} style={{ marginBottom: 4 }} />
                    <Skeleton width={50} height={12} />
                  </View>
                ))}
              </View>
            ) : cylindersError ? (
              <View style={styles.errorWrap}>
                <Text style={styles.errorText}>{t('failed_sizes')}</Text>
                <TouchableOpacity
                  style={styles.retryBtn}
                  onPress={() => catalogQuery.refetch()}
                >
                  <Text style={styles.retryText}>{t('retry')}</Text>
                </TouchableOpacity>
              </View>
            ) : cylinderOptions.length === 0 ? (
              <View style={styles.errorWrap}>
                <Text style={styles.errorText}>{t('no_sizes')}</Text>
              </View>
            ) : (
              <>
                <View style={styles.sizeGrid}>
                  {cylinderOptions.map((cyl, cylIdx) => {
                    const isSelected = selectedCylinder?.id === cyl.id;
                    return (
                      <ScalePressable
                        key={cyl.id}
                        style={[
                          styles.sizeOption,
                          isSelected && styles.sizeOptionSelected,
                        ]}
                        onPress={() => setSelectedCylinder(cyl)}
                        entering={FadeInDown.delay(Math.min(cylIdx, 6) * 40).springify().damping(18).stiffness(180)}
                      >
                        {cyl.imageUrl ? (
                          <Image
                            source={{ uri: cyl.imageUrl }}
                            style={styles.cylinderImage}
                            resizeMode="contain"
                          />
                        ) : (
                          <View style={[styles.cylinderIconWrap, isSelected && styles.cylinderIconWrapSelected]}>
                            <Cylinder size={28} color={isSelected ? Colors.primary : Colors.textTertiary} />
                          </View>
                        )}
                        <Text style={[styles.sizeNumber, isSelected && styles.sizeNumberSelected]}>
                          {cyl.size}
                        </Text>
                        <Text style={[styles.sizeUnit, isSelected && styles.sizeUnitSelected]}>kg</Text>
                        <Text style={[styles.sizeLabelMM, isSelected && styles.sizeLabelMMSelected]}>
                          {cyl.displayName}
                        </Text>
                        <Text style={[styles.sizePrice, isSelected && styles.sizePriceSelected]}>
                          {formatPrice(cyl.gasPrice)} MMK
                        </Text>
                      </ScalePressable>
                    );
                  })}
                </View>

                {/* vC17: quantity stepper — shown once a cylinder is selected. */}
                {selectedCylinder && (
                  <View style={styles.qtySection}>
                    <Text style={styles.qtyLabel}>{t('quantity')}</Text>
                    <Text style={styles.qtyLabelMM}>{tMM('quantity')}</Text>
                    <View style={styles.qtyStepper}>
                      <ScalePressable
                        style={[styles.qtyBtn, quantity <= MIN_QUANTITY && styles.qtyBtnDisabled]}
                        onPress={decrementQty}
                        disabled={quantity <= MIN_QUANTITY}
                        testID="qty-minus"
                      >
                        <Minus size={22} color={quantity <= MIN_QUANTITY ? Colors.textTertiary : Colors.primary} />
                      </ScalePressable>
                      <Text style={styles.qtyValue}>{quantity}</Text>
                      <ScalePressable
                        style={[styles.qtyBtn, quantity >= MAX_QUANTITY && styles.qtyBtnDisabled]}
                        onPress={incrementQty}
                        disabled={quantity >= MAX_QUANTITY}
                        testID="qty-plus"
                      >
                        <Plus size={22} color={quantity >= MAX_QUANTITY ? Colors.textTertiary : Colors.primary} />
                      </ScalePressable>
                    </View>
                    {/* vC17: live math preview — 2 × 23,000 = 46,000. */}
                    <Text style={styles.qtyMath}>
                      {quantity} × {formatPrice(selectedCylinder.gasPrice)} = {formatPrice(selectedCylinder.gasPrice * quantity)} MMK
                    </Text>
                  </View>
                )}
              </>
            )}
          </View>
        );

      case 'pricing':
        return (
          <View style={styles.stepContent}>
            {customerHasAddress && selectedAddress && (
              <TouchableOpacity
                style={styles.deliveryBar}
                onPress={() => {
                  setShowAddressStep(true);
                  setCurrentStep('address');
                  animateTransition();
                }}
                activeOpacity={0.7}
              >
                <View style={styles.deliveryBarLeft}>
                  <View style={styles.deliveryBarIcon}>
                    <MapPin size={16} color="#16A34A" />
                  </View>
                  <View style={styles.deliveryBarTextWrap}>
                    <Text style={styles.deliveryBarLabel}>{t('delivering_to')}</Text>
                    <Text style={styles.deliveryBarAddress} numberOfLines={1}>{selectedAddress.address}</Text>
                  </View>
                </View>
                <Text style={styles.deliveryBarChange}>{t('change')}</Text>
              </TouchableOpacity>
            )}
            <Text style={styles.stepTitle}>{t('price_breakdown')}</Text>
            <Text style={styles.stepTitleMM}>{tMM('price_breakdown')}</Text>
            <View style={styles.pricingCard}>
              <View style={styles.pricingRow}>
                <Text style={styles.pricingLabel}>
                  {/* vC17: show the qty math live — 2 × (12.5kg × 1,840/kg) */}
                  {t('gas')} ({quantity} × {selectedCylinder?.size}kg × {formatPrice(selectedCylinder?.pricePerKg || 0)}/kg)
                </Text>
                <Text style={styles.pricingValue}>{formatPrice(pricing.gasPrice)} MMK</Text>
              </View>
              {pricing.cylinderPrice > 0 && (
                <View style={styles.pricingRow}>
                  <Text style={styles.pricingLabel}>{t('new_cylinder')}</Text>
                  <Text style={styles.pricingValue}>{formatPrice(pricing.cylinderPrice)} MMK</Text>
                </View>
              )}
              <View style={styles.pricingRow}>
                <Text style={styles.pricingLabel}>
                  {t('delivery_fee')}
                </Text>
                <Text style={styles.pricingValue}>{formatPrice(pricing.deliveryFee)} MMK</Text>
              </View>
              <View style={styles.pricingDivider} />
              <View style={styles.pricingRow}>
                <Text style={styles.pricingTotal}>{t('total')}</Text>
                <View style={{ flexDirection: 'row', alignItems: 'baseline' }}>
                  <AnimatedNumber value={pricing.total} format={(n) => Math.round(n).toLocaleString()} style={styles.pricingTotalValue} />
                  <Text style={styles.pricingTotalValue}> MMK</Text>
                </View>
              </View>
            </View>
          </View>
        );

      case 'address':
        // vC13 Task B: address gate. Two modes:
        // 1) No address yet → show add form (gate, blocks checkout until saved).
        // 2) Has address but user tapped Change → show existing + edit button.
        if (customerHasAddress && !editingAddress) {
          return (
            <View style={styles.stepContent}>
              <Text style={styles.stepTitle}>{t('delivery_address')}</Text>
              <Text style={styles.stepTitleMM}>{tMM('delivery_address')}</Text>
              {customerAddress && (
                <ScalePressable
                  style={[styles.addressOption, styles.addressOptionSelected]}
                  onPress={() => setSelectedAddress(customerAddress)}
                >
                  <MapPin size={20} color={Colors.primary} />
                  <View style={styles.addressOptionContent}>
                    <Text style={[styles.addressOptionLabel, styles.addressOptionLabelSelected]}>
                      {customerAddress.label}
                    </Text>
                    <Text style={styles.addressOptionText} numberOfLines={2}>{customerAddress.address}</Text>
                  </View>
                  <Check size={18} color={Colors.primary} />
                </ScalePressable>
              )}
              <ScalePressable
                style={styles.editAddressBtn}
                onPress={() => {
                  setPendingAddress(activeCustomer?.address || '');
                  setPendingTownship(activeCustomer?.township || '');
                  setEditingAddress(true);
                  setAddressSaveError(null);
                  animateTransition();
                }}
              >
                <Text style={styles.editAddressBtnText}>{t('change')}</Text>
              </ScalePressable>
            </View>
          );
        }
        // Address form (add or edit) — the gate that blocks checkout.
        return (
          <View style={styles.stepContent}>
            <Text style={styles.stepTitle}>
              {customerHasAddress ? t('edit_delivery_address') : t('add_delivery_address')}
            </Text>
            <Text style={styles.stepTitleMM}>
              {customerHasAddress ? tMM('edit_delivery_address') : tMM('add_delivery_address')}
            </Text>

            <View style={styles.addressFormGroup}>
              <Text style={styles.addressFormLabel}>{t('address_label')}</Text>
              <TextInput
                style={[styles.addressFormInput, styles.addressFormTextArea]}
                placeholder={t('address_placeholder')}
                placeholderTextColor={Colors.textTertiary}
                value={pendingAddress}
                onChangeText={setPendingAddress}
                multiline
                numberOfLines={3}
                textAlignVertical="top"
                testID="gate-address-input"
              />
            </View>

            <View style={styles.addressFormGroup}>
              <Text style={styles.addressFormLabel}>{t('select_township')}</Text>
              <TouchableOpacity
                style={styles.townshipPicker}
                onPress={() => setTownshipPickerOpen(!townshipPickerOpen)}
                activeOpacity={0.7}
                testID="gate-township-picker"
              >
                <Text
                  style={[
                    styles.townshipPickerText,
                    !pendingTownship && styles.townshipPickerPlaceholder,
                  ]}
                  numberOfLines={1}
                >
                  {pendingTownship || t('select_township')}
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
                        pendingTownship === tw && styles.townshipItemSelected,
                      ]}
                      onPress={() => {
                        setPendingTownship(tw);
                        setTownshipPickerOpen(false);
                      }}
                      activeOpacity={0.7}
                    >
                      <Text
                        style={[
                          styles.townshipItemText,
                          pendingTownship === tw && styles.townshipItemTextSelected,
                        ]}
                      >
                        {tw}
                      </Text>
                      {pendingTownship === tw && <Check size={16} color={Colors.primary} />}
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              )}
            </View>

            {/* vC16 Task B: landmark field (optional, critical for Myanmar addressing) */}
            <View style={styles.addressFormGroup}>
              <Text style={styles.addressFormLabel}>{t('landmark_label')}</Text>
              <TextInput
                style={styles.addressFormInput}
                placeholder={t('landmark_placeholder')}
                placeholderTextColor={Colors.textTertiary}
                value={pendingLandmark}
                onChangeText={setPendingLandmark}
                maxLength={100}
                testID="gate-landmark-input"
              />
            </View>

            {/* vC16 Task B: "Use my location" GPS capture (optional, never required) */}
            <ScalePressable
              style={[
                styles.locationBtn,
                locationStatus === 'saved' && styles.locationBtnSaved,
                locationStatus === 'loading' && styles.locationBtnLoading,
              ]}
              onPress={handleUseLocation}
              disabled={locationStatus === 'loading'}
              testID="gate-use-location"
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
            </ScalePressable>
            {locationStatus === 'denied' && (
              <Text style={styles.locationDeniedText}>{t('location_denied')}</Text>
            )}

            {addressSaveError && (
              <View style={styles.addressErrorBox}>
                <Text style={styles.addressErrorText}>{addressSaveError}</Text>
              </View>
            )}
          </View>
        );

      case 'payment':
        return (
          <View style={styles.stepContent}>
            {customerHasAddress && selectedAddress && (
              <TouchableOpacity
                style={styles.deliveryBar}
                onPress={() => {
                  setShowAddressStep(true);
                  setCurrentStep('address');
                  animateTransition();
                }}
                activeOpacity={0.7}
              >
                <View style={styles.deliveryBarLeft}>
                  <View style={styles.deliveryBarIcon}>
                    <MapPin size={16} color="#16A34A" />
                  </View>
                  <View style={styles.deliveryBarTextWrap}>
                    <Text style={styles.deliveryBarLabel}>{t('delivering_to')}</Text>
                    <Text style={styles.deliveryBarAddress} numberOfLines={1}>{selectedAddress.address}</Text>
                  </View>
                </View>
                <Text style={styles.deliveryBarChange}>{t('change')}</Text>
              </TouchableOpacity>
            )}
            <Text style={styles.stepTitle}>{t('payment_method')}</Text>
            <Text style={styles.stepTitleMM}>{tMM('payment_method')}</Text>
            <View style={styles.paymentList}>
              {PAYMENT_OPTIONS.map((opt, payIdx) => {
                const label = opt.id === 'cash' ? t('pay_cash')
                  : opt.id === 'kbz_pay' ? t('pay_kbz')
                  : opt.id === 'wave_money' ? t('pay_wave')
                  : t('pay_cb');
                return (
                  <ScalePressable
                    key={opt.id}
                    style={[
                      styles.paymentOption,
                      selectedPayment === opt.id && styles.paymentOptionSelected,
                    ]}
                    onPress={() => {
                      setSelectedPayment(opt.id);
                      if (Platform.OS !== 'web') {
                        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                      }
                    }}
                    entering={FadeInDown.delay(Math.min(payIdx, 6) * 40).springify().damping(18).stiffness(180)}
                  >
                    <View style={[styles.paymentIconWrap, { backgroundColor: opt.color + '15' }]}>
                      {getPaymentIcon(opt.icon, opt.color)}
                    </View>
                    <Text style={[styles.paymentLabel, selectedPayment === opt.id && styles.paymentLabelSelected]}>
                      {label}
                    </Text>
                    {selectedPayment === opt.id && (
                      <Check size={18} color={Colors.primary} />
                    )}
                  </ScalePressable>
                );
              })}
            </View>
          </View>
        );

      case 'confirm':
        return (
          <View style={styles.stepContent}>
            {selectedAddress && (
              <View style={styles.deliveryBarConfirm}>
                <View style={styles.deliveryBarIcon}>
                  <MapPin size={16} color="#16A34A" />
                </View>
                <View style={styles.deliveryBarTextWrap}>
                  <Text style={styles.deliveryBarLabel}>{t('delivering_to')}</Text>
                  <Text style={styles.deliveryBarAddress} numberOfLines={1}>{selectedAddress.address}</Text>
                </View>
                <Check size={16} color="#16A34A" />
              </View>
            )}
            <Text style={styles.stepTitle}>{t('confirm_order')}</Text>
            <Text style={styles.stepTitleMM}>{tMM('confirm_order')}</Text>
            <View style={styles.confirmCard}>
              {/* NS-2: bundle path — show the package name + brand label. */}
              {selectedType === 'new_setup' && selectedBundle ? (
                <>
                  <View style={styles.confirmRow}>
                    <Text style={styles.confirmLabel}>{isMM ? 'ပက်ကေ့ဂျ်' : 'Package'}</Text>
                    <Text style={styles.confirmValue}>{selectedBundle.name}</Text>
                  </View>
                  {bundleBrandLabel(selectedBundle) ? (
                    <View style={styles.confirmRow}>
                      <Text style={styles.confirmLabel}>{t('brand')}</Text>
                      <Text style={styles.confirmValue}>{bundleBrandLabel(selectedBundle)}</Text>
                    </View>
                  ) : null}
                  {selectedBundle.cylinder_type && (
                    <View style={styles.confirmRow}>
                      <Text style={styles.confirmLabel}>{t('size')}</Text>
                      <Text style={styles.confirmValue}>
                        {selectedBundle.cylinder_type.display_name || `${selectedBundle.cylinder_type.size_kg} kg`}
                      </Text>
                    </View>
                  )}
                  <View style={styles.confirmRow}>
                    <Text style={styles.confirmLabel}>{t('type')}</Text>
                    <Text style={styles.confirmValue}>{t('type_new_setup')}</Text>
                  </View>
                </>
              ) : (
                <>
                  <View style={styles.confirmRow}>
                    <Text style={styles.confirmLabel}>{t('brand')}</Text>
                    <Text style={styles.confirmValue}>{selectedBrand?.name}</Text>
                  </View>
                  <View style={styles.confirmRow}>
                    <Text style={styles.confirmLabel}>{t('size')}</Text>
                    <Text style={styles.confirmValue}>{selectedCylinder?.size} kg</Text>
                  </View>
                  {/* vC17: show quantity on confirm when >1 */}
                  {quantity > 1 && (
                    <View style={styles.confirmRow}>
                      <Text style={styles.confirmLabel}>{t('quantity')}</Text>
                      <Text style={styles.confirmValue}>{quantity}</Text>
                    </View>
                  )}
                  <View style={styles.confirmRow}>
                    <Text style={styles.confirmLabel}>{t('type')}</Text>
                    <Text style={styles.confirmValue}>
                      {(() => {
                        const id = selectedType;
                        const label = id === 'refill' ? t('type_refill')
                          : t('type_new_setup');
                        return label;
                      })()}
                    </Text>
                  </View>
                </>
              )}
              <View style={styles.confirmRow}>
                <Text style={styles.confirmLabel}>{t('address')}</Text>
                <Text style={styles.confirmValue} numberOfLines={2}>{selectedAddress?.address}</Text>
              </View>
              <View style={styles.confirmRow}>
                <Text style={styles.confirmLabel}>{t('payment')}</Text>
                <Text style={styles.confirmValue}>
                  {(() => {
                    const id = selectedPayment;
                    return id === 'cash' ? t('pay_cash')
                      : id === 'kbz_pay' ? t('pay_kbz')
                      : id === 'wave_money' ? t('pay_wave')
                      : t('pay_cb');
                  })()}
                </Text>
              </View>
              <View style={styles.pricingDivider} />
              <View style={styles.confirmRow}>
                <Text style={styles.pricingTotal}>{t('total')}</Text>
                <Text style={styles.pricingTotalValue}>
                  {/* NS-2: bundle path — the server prices from bundle_price. */}
                  {formatPrice(selectedType === 'new_setup' && selectedBundle ? selectedBundle.bundle_price : pricing.total)} MMK
                </Text>
              </View>
            </View>
          </View>
        );
    }
  };

  // vC16 Task B: save address + township + landmark + GPS to customers row.
  // Column allowlist: address, township, landmark, gps_lat, gps_lng.
  // Visible error handling — no swallowed errors (rating bug, accept bug pattern).
  const handleSaveAddress = useCallback(async (): Promise<boolean> => {
    const trimmedAddress = pendingAddress.trim();
    const trimmedTownship = pendingTownship.trim();
    if (!trimmedAddress || !trimmedTownship) {
      setAddressSaveError(isMM ? 'လိပ်စာနှင့် မြို့နယ် ထည့်ပါ' : 'Please fill in address and township');
      return false;
    }
    setIsSavingAddress(true);
    setAddressSaveError(null);
    try {
      await updateCustomerAddress(
        trimmedAddress,
        trimmedTownship,
        pendingLandmark.trim() || null,
        pendingGpsLat,
        pendingGpsLng,
      );
      const newAddr: SavedAddress = {
        id: 'customer_default',
        label: trimmedTownship,
        address: `${trimmedAddress}, ${trimmedTownship}`,
        latitude: 0,
        longitude: 0,
        isDefault: true,
      };
      setSelectedAddress(newAddr);
      setEditingAddress(false);
      setShowAddressStep(false);
      if (Platform.OS !== 'web') {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }
      return true;
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : (isMM ? 'လိပ်စာ သိမ်းဆည်၍ မရပါ' : 'Failed to save address');
      console.log('[Order] Address save error:', msg);
      setAddressSaveError(msg);
      if (Platform.OS !== 'web') {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      }
      return false;
    } finally {
      setIsSavingAddress(false);
    }
  }, [pendingAddress, pendingTownship, pendingLandmark, pendingGpsLat, pendingGpsLng, updateCustomerAddress, isMM]);

  // vC16 Task B: "Use my location" GPS capture in the address gate form.
  // Optional, never required. expo-location permission prompt → capture
  // gps_lat/gps_lng → included in the same customers update.
  const handleUseLocation = useCallback(async () => {
    if (Platform.OS !== 'web') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    setLocationStatus('loading');
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        setLocationStatus('denied');
        console.log('[Order] Location permission denied');
        return;
      }
      const pos = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });
      setPendingGpsLat(pos.coords.latitude);
      setPendingGpsLng(pos.coords.longitude);
      setLocationStatus('saved');
      console.log('[Order] GPS captured:', pos.coords.latitude, pos.coords.longitude);
      if (Platform.OS !== 'web') {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }
    } catch (e) {
      console.log('[Order] Location error:', e);
      setLocationStatus('denied');
    }
  }, []);

  const canProceed = () => {
    switch (currentStep) {
      // vC17 r2: intent step — the cards themselves drive navigation, so the
      // bottom Continue button is hidden on this step.
      case 'intent': return false;
      case 'brand': return !!selectedBrandId;
      case 'size': return !!selectedCylinder;
      case 'pricing': return true;
      // NS-2: bundle must be selected to proceed on the New Set path.
      case 'bundles': return !!selectedBundle;
      case 'address':
        // Address gate: if editing (or no address), the Save button drives proceed.
        // If showing existing address, allow proceed.
        if (editingAddress || !customerHasAddress) return false;
        return !!selectedAddress;
      case 'payment': return !!selectedPayment;
      case 'confirm': return true;
      default: return false;
    }
  };

  return (
    <View style={styles.container}>
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        <View style={styles.topBar}>
          <ScalePressable onPress={goBack} style={styles.backBtn}>
            {currentStepIndex === 0 ? <X size={22} color={Colors.textPrimary} /> : <ChevronLeft size={22} color={Colors.textPrimary} />}
          </ScalePressable>
          {/* vD1: single progress indicator — animated bar only (dots removed) */}
          <Text style={styles.stepLabel}>{STEP_LABELS[currentStep]}</Text>
        </View>

        <View style={styles.progressBar}>
          <ReanimatedProgressFill progress={progress} />
        </View>

        <ScrollView
          style={styles.scrollArea}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          <RNAnimated.View style={{ transform: [{ translateY: slideAnim }] }}>
            {renderStepContent()}
          </RNAnimated.View>
        </ScrollView>

        {/* vC17 r2: intent step — cards drive navigation, no Continue button. */}
        {currentStep !== 'intent' && (
        <BottomBar>
          {currentStep === 'address' && (editingAddress || !customerHasAddress) ? (
            // vC13 Task B: address gate — Save button drives the form submit.
            // Blocks checkout until a valid address is saved. Visible error on fail.
            <ScalePressable
              style={[styles.nextButton, isSavingAddress && styles.buttonDisabled]}
              onPress={handleSaveAddress}
              disabled={isSavingAddress}
              testID="save-address-button"
            >
              {isSavingAddress ? (
                <ActivityIndicator color="#FFFFFF" />
              ) : (
                <Text style={styles.nextButtonText}>{t('save_and_continue')}</Text>
              )}
            </ScalePressable>
          ) : currentStep === 'confirm' ? (
            <ScalePressable
              style={[styles.confirmButton, isSubmitting && styles.buttonDisabled]}
              onPress={handleConfirmOrder}
              disabled={isSubmitting}
              testID="confirm-order-button"
            >
              {isSubmitting ? (
                <ActivityIndicator color="#FFFFFF" />
              ) : (
                <>
                  <Flame size={20} color="#FFFFFF" />
                  <Text style={styles.confirmButtonText}>{t('place_order')} • {formatPrice(selectedType === 'new_setup' && selectedBundle ? selectedBundle.bundle_price : pricing.total)} MMK</Text>
                </>
              )}
            </ScalePressable>
          ) : (
            <ScalePressable
              style={[styles.nextButton, !canProceed() && styles.buttonDisabled]}
              onPress={goNext}
              disabled={!canProceed()}
            >
              <Text style={styles.nextButtonText}>{t('continue')}</Text>
            </ScalePressable>
          )}
        </BottomBar>
        )}
      </SafeAreaView>
      {/* vD-MOTION moment 4: the order-placed celebration overlay. */}
      <SuccessOverlay
        visible={showSuccess}
        totalLabel={successTotal}
        orderSummary={successSummary}
        onDone={handleSuccessDone}
      />
    </View>
  );
}

/**
 * vD-MOTION moment 2: progress bar fill animates with a spring on step change.
 * Falls back to instant width under reduce-motion.
 */
function ReanimatedProgressFill({ progress }: { progress: number }) {
  const reduce = useReduceMotion();
  const width = useSharedValue(progress * 100);
  useEffect(() => {
    if (reduce) {
      width.value = progress * 100;
    } else {
      width.value = withSpring(progress * 100, { damping: 18, stiffness: 180, mass: 1 });
    }
  }, [progress, reduce]);
  const style = useAnimatedStyle(() => ({
    width: `${width.value}%`,
  }));
  return <Animated.View style={[styles.progressFill, style]} />;
}

/**
 * vD-MOTION moment 8: bottom bar slides up with a spring when a step becomes
 * valid. Falls back to instant under reduce-motion.
 */
function BottomBar({ children }: { children: React.ReactNode }) {
  const reduce = useReduceMotion();
  const y = useSharedValue(reduce ? 0 : 20);
  const opacity = useSharedValue(reduce ? 1 : 0);
  useEffect(() => {
    if (reduce) return;
    y.value = withSpring(0, SPRING.gentle);
    opacity.value = withSpring(1, { damping: 20, stiffness: 200 });
  }, [reduce]);
  const style = useAnimatedStyle(() => ({
    transform: [{ translateY: y.value }],
    opacity: opacity.value,
  }));
  return (
    <Animated.View style={[styles.bottomBar, style]}>
      {children}
    </Animated.View>
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
  topBar: {
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
  // vD1: step dots removed — single progress bar only. Styles kept removed.
  stepLabel: {
    fontSize: 13,
    fontWeight: '600' as const,
    color: Colors.textSecondary,
    minWidth: 60,
    textAlign: 'right' as const,
  },
  progressBar: {
    height: 3,
    backgroundColor: Colors.borderLight,
    marginHorizontal: 16,
    borderRadius: 999,
  },
  progressFill: {
    height: 3,
    backgroundColor: Colors.primary,
    borderRadius: 999,
  },
  scrollArea: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingTop: 24,
    paddingBottom: 20,
  },
  stepContent: {},
  stepTitle: {
    fontSize: 24,
    fontWeight: '800' as const,
    color: Colors.textPrimary,
    marginBottom: 2,
  },
  stepTitleMM: {
    fontSize: 14,
    color: Colors.textTertiary,
    marginBottom: 24,
  },
  loadingWrap: {
    alignItems: 'center',
    paddingTop: 40,
    gap: 12,
  },
  loadingText: {
    fontSize: 14,
    color: Colors.textSecondary,
  },
  errorWrap: {
    alignItems: 'center',
    paddingTop: 40,
    gap: 12,
  },
  errorText: {
    fontSize: 15,
    color: Colors.error,
    textAlign: 'center' as const,
  },
  retryBtn: {
    backgroundColor: Colors.primary,
    paddingHorizontal: 24,
    paddingVertical: 10,
    borderRadius: 12,
  },
  retryText: {
    fontSize: 14,
    fontWeight: '600' as const,
    color: '#FFFFFF',
  },
  optionsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  // vC17 r2: intent-first cards (Step 1).
  intentGrid: {
    flexDirection: 'row',
    gap: 14,
    marginBottom: 16,
  },
  intentCard: {
    flex: 1,
    backgroundColor: Colors.surface,
    borderRadius: 20,
    padding: 24,
    alignItems: 'center',
    borderWidth: 2,
    borderColor: Colors.border,
    minHeight: 220,
    justifyContent: 'center',
  },
  intentIconWrap: {
    width: 56,
    height: 56,
    borderRadius: 999,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 14,
  },
  intentIconRefill: {
    backgroundColor: Colors.primary,
  },
  intentIconNewSet: {
    backgroundColor: '#7C3AED',
  },
  intentTitleMM: {
    fontSize: 18,
    fontWeight: '800' as const,
    color: Colors.textPrimary,
    marginBottom: 2,
  },
  intentTitle: {
    fontSize: 13,
    fontWeight: '700' as const,
    color: Colors.textSecondary,
    marginBottom: 6,
  },
  intentDesc: {
    fontSize: 12,
    color: Colors.textTertiary,
    textAlign: 'center' as const,
  },
  intentBadge: {
    marginTop: 10,
    backgroundColor: '#F3E8FF',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#DDD6FE',
  },
  intentBadgeText: {
    fontSize: 10,
    fontWeight: '700' as const,
    color: '#7C3AED',
  },
  // NS-2: disabled New Set card (no visible bundles).
  intentCardDisabled: {
    opacity: 0.5,
    backgroundColor: Colors.background,
  },
  intentIconWrapDisabled: {
    backgroundColor: Colors.border,
  },
  intentTitleDisabled: {
    color: Colors.textTertiary,
  },
  intentBadgeActive: {
    backgroundColor: '#DCFCE7',
    borderColor: '#BBF7D0',
  },
  intentBadgeTextActive: {
    color: '#16A34A',
  },
  intentBadgeComingSoon: {
    backgroundColor: '#F5F5F4',
    borderColor: Colors.border,
  },
  intentBadgeTextComingSoon: {
    color: Colors.textTertiary,
  },
  // NS-2: bundle showcase styles.
  bundlesSub: {
    fontSize: 13,
    color: Colors.textSecondary,
    marginBottom: 20,
  },
  bundlesEmpty: {
    alignItems: 'center',
    paddingTop: 60,
    paddingBottom: 40,
    paddingHorizontal: 24,
    gap: 12,
  },
  bundlesEmptyTitle: {
    fontSize: 17,
    fontWeight: '700' as const,
    color: Colors.textPrimary,
    textAlign: 'center' as const,
    marginTop: 8,
  },
  bundlesEmptySub: {
    fontSize: 14,
    color: Colors.textTertiary,
    textAlign: 'center' as const,
  },
  bundlesHotlineBtn: {
    marginTop: 12,
    backgroundColor: Colors.primaryLight,
    paddingHorizontal: 28,
    paddingVertical: 14,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: Colors.primary + '30',
  },
  bundlesHotlineBtnText: {
    fontSize: 18,
    fontWeight: '800' as const,
    color: Colors.primary,
  },
  bundlesList: {
    gap: 16,
  },
  bundleCard: {
    backgroundColor: Colors.surface,
    borderRadius: 20,
    padding: 18,
    borderWidth: 1.5,
    borderColor: Colors.border,
    position: 'relative' as const,
  },
  bundleCardSelected: {
    borderColor: Colors.primary,
    borderWidth: 2.5,
    backgroundColor: Colors.primaryLight,
  },
  bundleCardTop: {
    flexDirection: 'row',
    gap: 14,
    marginBottom: 14,
  },
  bundleImage: {
    width: 80,
    height: 80,
    borderRadius: 12,
  },
  bundleImageFallback: {
    width: 80,
    height: 80,
    borderRadius: 12,
    backgroundColor: Colors.primaryLight,
    justifyContent: 'center',
    alignItems: 'center',
  },
  bundleInfo: {
    flex: 1,
    justifyContent: 'center',
  },
  bundleName: {
    fontSize: 17,
    fontWeight: '800' as const,
    color: Colors.textPrimary,
    marginBottom: 4,
  },
  bundleBrandRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
  },
  bundleBrandLabel: {
    fontSize: 12,
    color: Colors.textTertiary,
    fontWeight: '600' as const,
  },
  bundleBrandValue: {
    fontSize: 12,
    color: Colors.textSecondary,
    fontWeight: '700' as const,
  },
  bundleComponents: {
    backgroundColor: Colors.background,
    borderRadius: 12,
    padding: 14,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: Colors.borderLight,
  },
  bundleComponentsTitle: {
    fontSize: 11,
    fontWeight: '800' as const,
    color: Colors.textTertiary,
    textTransform: 'uppercase' as const,
    letterSpacing: 0.5,
    marginBottom: 8,
  },
  bundleComponentRow: {
    flexDirection: 'row' as const,
    justifyContent: 'space-between' as const,
    alignItems: 'center' as const,
    paddingVertical: 3,
  },
  bundleComponentName: {
    fontSize: 13,
    color: Colors.textPrimary,
    flex: 1,
  },
  bundleComponentValue: {
    fontSize: 13,
    color: Colors.textSecondary,
    fontWeight: '600' as const,
    textDecorationLine: 'line-through' as const,
    textDecorationStyle: 'solid' as const,
  },
  bundlePriceRow: {
    flexDirection: 'row' as const,
    justifyContent: 'space-between' as const,
    alignItems: 'center' as const,
    marginBottom: 8,
  },
  bundlePriceLeft: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 8,
  },
  bundlePriceLabel: {
    fontSize: 13,
    color: Colors.textSecondary,
    fontWeight: '600' as const,
  },
  bundleValueStrikethrough: {
    fontSize: 13,
    color: Colors.textTertiary,
    textDecorationLine: 'line-through' as const,
    textDecorationStyle: 'solid' as const,
  },
  bundlePriceValue: {
    fontSize: 22,
    fontWeight: '900' as const,
    color: Colors.primary,
  },
  bundleSavingsChip: {
    alignSelf: 'flex-start' as const,
    backgroundColor: '#DCFCE7',
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#BBF7D0',
    marginBottom: 8,
  },
  bundleSavingsText: {
    fontSize: 12,
    fontWeight: '800' as const,
    color: '#16A34A',
  },
  bundleFreeDeliveryRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 4,
  },
  bundleFreeDeliveryText: {
    fontSize: 12,
    fontWeight: '700' as const,
    color: '#16A34A',
  },
  bundleSelectedBadge: {
    position: 'absolute' as const,
    top: 12,
    right: 12,
    width: 28,
    height: 28,
    borderRadius: 12,
    backgroundColor: Colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  // vC17 r2: "Your usual" memory shortcut card.
  usualCard: {
    backgroundColor: Colors.primaryLight,
    borderRadius: 20,
    padding: 18,
    marginBottom: 20,
    borderWidth: 1.5,
    borderColor: Colors.primary + '30',
  },
  usualHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  usualTitle: {
    fontSize: 13,
    fontWeight: '800' as const,
    color: Colors.primary,
    textTransform: 'uppercase' as const,
    letterSpacing: 0.5,
  },
  usualDetail: {
    fontSize: 16,
    fontWeight: '700' as const,
    color: Colors.textPrimary,
    marginBottom: 2,
  },
  usualPrice: {
    fontSize: 15,
    fontWeight: '700' as const,
    color: Colors.primary,
    marginBottom: 14,
  },
  usualActions: {
    flexDirection: 'row',
    gap: 10,
  },
  usualOrderBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: Colors.primary,
    paddingVertical: 12,
    borderRadius: 12,
  },
  usualOrderBtnText: {
    fontSize: 14,
    fontWeight: '800' as const,
    color: '#FFFFFF',
  },
  usualChangeBtn: {
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 12,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  usualChangeBtnText: {
    fontSize: 14,
    fontWeight: '700' as const,
    color: Colors.textSecondary,
  },
  // vC17 r2: intent context chip on brand step.
  intentContextRow: {
    marginBottom: 16,
  },
  intentContextChip: {
    alignSelf: 'flex-start' as const,
    backgroundColor: Colors.primaryLight,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: Colors.primary + '20',
  },
  intentContextText: {
    fontSize: 12,
    fontWeight: '700' as const,
    color: Colors.primaryDark,
  },
  // vC17: quantity stepper.
  qtySection: {
    marginTop: 24,
    alignItems: 'center',
  },
  qtyLabel: {
    fontSize: 15,
    fontWeight: '700' as const,
    color: Colors.textPrimary,
  },
  qtyLabelMM: {
    fontSize: 12,
    color: Colors.textTertiary,
    marginBottom: 12,
  },
  qtyStepper: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 24,
    marginBottom: 12,
  },
  qtyBtn: {
    width: 52,
    height: 52,
    borderRadius: 16,
    backgroundColor: Colors.surface,
    borderWidth: 2,
    borderColor: Colors.primary + '30',
    justifyContent: 'center',
    alignItems: 'center',
  },
  qtyBtnDisabled: {
    borderColor: Colors.border,
    opacity: 0.5,
  },
  qtyValue: {
    fontSize: 28,
    fontWeight: '900' as const,
    color: Colors.textPrimary,
    minWidth: 40,
    textAlign: 'center' as const,
  },
  qtyMath: {
    fontSize: 13,
    fontWeight: '600' as const,
    color: Colors.textSecondary,
  },
  brandOption: {
    flexGrow: 1,
    flexBasis: '28%' as unknown as number,
    minWidth: 100,
    backgroundColor: Colors.surface,
    borderRadius: 20,
    padding: 20,
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: Colors.border,
    position: 'relative' as const,
  },
  brandLogoImage: {
    width: 72,
    height: 72,
    borderRadius: 16,
    marginBottom: 12,
  },
  brandLogoFallback: {
    width: 72,
    height: 72,
    borderRadius: 999,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
  },
  brandLogoLetter: {
    fontSize: 28,
    fontWeight: '800' as const,
  },
  brandOptionName: {
    fontSize: 13,
    fontWeight: '700' as const,
    color: Colors.textPrimary,
    textAlign: 'center' as const,
  },
  checkBadge: {
    position: 'absolute' as const,
    top: 10,
    right: 10,
    width: 24,
    height: 24,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  sizeGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  sizeOption: {
    width: '47%' as unknown as number,
    backgroundColor: Colors.surface,
    borderRadius: 16,
    padding: 18,
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: Colors.border,
    flexGrow: 1,
  },
  cylinderImage: {
    width: 56,
    height: 56,
    marginBottom: 8,
    borderRadius: 12,
  },
  cylinderIconWrap: {
    width: 56,
    height: 56,
    borderRadius: 12,
    backgroundColor: Colors.borderLight,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 8,
  },
  cylinderIconWrapSelected: {
    backgroundColor: Colors.primary + '15',
  },
  sizeOptionSelected: {
    borderColor: Colors.primary,
    borderWidth: 2.5,
    backgroundColor: Colors.primaryLight,
  },
  sizeNumber: {
    fontSize: 32,
    fontWeight: '800' as const,
    color: Colors.textPrimary,
  },
  sizeNumberSelected: {
    color: Colors.primary,
  },
  sizeUnit: {
    fontSize: 14,
    fontWeight: '600' as const,
    color: Colors.textSecondary,
    marginTop: -2,
  },
  sizeUnitSelected: {
    color: Colors.primaryDark,
  },
  sizeLabelMM: {
    fontSize: 11,
    color: Colors.textTertiary,
    marginTop: 4,
  },
  sizeLabelMMSelected: {
    color: Colors.primaryDark,
  },
  sizePrice: {
    fontSize: 12,
    fontWeight: '700' as const,
    color: Colors.textTertiary,
    marginTop: 6,
  },
  sizePriceSelected: {
    color: Colors.primary,
  },
  typeList: {
    gap: 12,
  },
  typeOption: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surface,
    borderRadius: 16,
    padding: 18,
    borderWidth: 1.5,
    borderColor: Colors.border,
  },
  typeOptionSelected: {
    borderColor: Colors.primary,
    borderWidth: 2.5,
    backgroundColor: Colors.primaryLight,
  },
  typeOptionLeft: {
    flex: 1,
  },
  typeLabel: {
    fontSize: 17,
    fontWeight: '700' as const,
    color: Colors.textPrimary,
  },
  typeLabelSelected: {
    color: Colors.primaryDark,
  },
  typeLabelMM: {
    fontSize: 13,
    color: Colors.textTertiary,
    marginTop: 2,
  },
  typeDesc: {
    fontSize: 13,
    color: Colors.textSecondary,
    marginTop: 4,
  },
  typeCheck: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: Colors.primary + '15',
    justifyContent: 'center',
    alignItems: 'center',
  },
  pricingCard: {
    backgroundColor: Colors.surface,
    borderRadius: 20,
    padding: 20,
    borderWidth: 1,
    borderColor: Colors.borderLight,
  },
  pricingRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 10,
  },
  pricingLabel: {
    fontSize: 15,
    color: Colors.textSecondary,
    flex: 1,
  },
  pricingValue: {
    fontSize: 15,
    fontWeight: '600' as const,
    color: Colors.textPrimary,
  },
  pricingDivider: {
    height: 1,
    backgroundColor: Colors.border,
    marginVertical: 6,
  },
  pricingTotal: {
    fontSize: 17,
    fontWeight: '800' as const,
    color: Colors.textPrimary,
  },
  pricingTotalValue: {
    fontSize: 20,
    fontWeight: '800' as const,
    color: Colors.primary,
  },
  addressList: {
    gap: 12,
  },
  addressOption: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surface,
    borderRadius: 16,
    padding: 16,
    gap: 12,
    borderWidth: 1.5,
    borderColor: Colors.border,
  },
  addressOptionSelected: {
    borderColor: Colors.primary,
    borderWidth: 2.5,
    backgroundColor: Colors.primaryLight,
  },
  addressOptionContent: {
    flex: 1,
  },
  addressOptionLabel: {
    fontSize: 15,
    fontWeight: '700' as const,
    color: Colors.textPrimary,
  },
  addressOptionLabelSelected: {
    color: Colors.primaryDark,
  },
  addressOptionText: {
    fontSize: 13,
    color: Colors.textSecondary,
    marginTop: 2,
  },
  paymentList: {
    gap: 12,
  },
  paymentOption: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surface,
    borderRadius: 16,
    padding: 16,
    gap: 14,
    borderWidth: 1.5,
    borderColor: Colors.border,
  },
  paymentOptionSelected: {
    borderColor: Colors.primary,
    borderWidth: 2.5,
    backgroundColor: Colors.primaryLight,
  },
  paymentIconWrap: {
    width: 44,
    height: 44,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  paymentLabel: {
    flex: 1,
    fontSize: 16,
    fontWeight: '600' as const,
    color: Colors.textPrimary,
  },
  paymentLabelSelected: {
    color: Colors.primaryDark,
  },
  confirmCard: {
    backgroundColor: Colors.surface,
    borderRadius: 20,
    padding: 20,
    borderWidth: 1,
    borderColor: Colors.borderLight,
  },
  confirmRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 10,
  },
  confirmLabel: {
    fontSize: 14,
    color: Colors.textSecondary,
    width: 80,
  },
  confirmValue: {
    fontSize: 15,
    fontWeight: '600' as const,
    color: Colors.textPrimary,
    flex: 1,
    textAlign: 'right' as const,
  },
  bottomBar: {
    paddingHorizontal: 20,
    paddingVertical: 16,
    backgroundColor: Colors.surface,
    borderTopWidth: 1,
    borderTopColor: Colors.borderLight,
  },
  nextButton: {
    backgroundColor: Colors.primary,
    paddingVertical: 18,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  nextButtonText: {
    fontSize: 17,
    fontWeight: '700' as const,
    color: '#FFFFFF',
  },
  confirmButton: {
    flexDirection: 'row',
    backgroundColor: Colors.primary,
    paddingVertical: 18,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    shadowColor: Colors.primary,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.35,
    shadowRadius: 12,
    elevation: 8,
  },
  confirmButtonText: {
    fontSize: 17,
    fontWeight: '700' as const,
    color: '#FFFFFF',
  },
  buttonDisabled: {
    backgroundColor: Colors.primaryMuted,
    shadowOpacity: 0,
    elevation: 0,
  },
  deliveryBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#F0FDF4',
    borderRadius: 12,
    padding: 14,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: '#BBF7D0',
  },
  deliveryBarLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    gap: 10,
  },
  deliveryBarIcon: {
    width: 32,
    height: 32,
    borderRadius: 12,
    backgroundColor: '#DCFCE7',
    justifyContent: 'center',
    alignItems: 'center',
  },
  deliveryBarTextWrap: {
    flex: 1,
  },
  deliveryBarLabel: {
    fontSize: 11,
    fontWeight: '600' as const,
    color: '#16A34A',
    textTransform: 'uppercase' as const,
    letterSpacing: 0.5,
  },
  deliveryBarAddress: {
    fontSize: 14,
    fontWeight: '600' as const,
    color: Colors.textPrimary,
    marginTop: 1,
  },
  deliveryBarChange: {
    fontSize: 13,
    fontWeight: '600' as const,
    color: Colors.primary,
    marginLeft: 8,
  },
  deliveryBarConfirm: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F0FDF4',
    borderRadius: 12,
    padding: 14,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: '#BBF7D0',
    gap: 10,
  },
  // vC13 Task B: address gate form styles
  editAddressBtn: {
    alignSelf: 'flex-start' as const,
    paddingVertical: 10,
    paddingHorizontal: 18,
    borderRadius: 12,
    backgroundColor: Colors.primaryLight,
    marginTop: 16,
  },
  editAddressBtnText: {
    fontSize: 14,
    fontWeight: '700' as const,
    color: Colors.primary,
  },
  addressFormGroup: {
    marginBottom: 20,
  },
  addressFormLabel: {
    fontSize: 14,
    fontWeight: '700' as const,
    color: Colors.textPrimary,
    marginBottom: 8,
  },
  addressFormInput: {
    backgroundColor: Colors.surface,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 16,
    color: Colors.textPrimary,
    borderWidth: 1.5,
    borderColor: Colors.border,
  },
  addressFormTextArea: {
    minHeight: 80,
    paddingTop: 14,
    textAlignVertical: 'top' as const,
  },
  townshipPicker: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'space-between' as const,
    backgroundColor: Colors.surface,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 16,
    borderWidth: 1.5,
    borderColor: Colors.border,
  },
  townshipPickerText: {
    flex: 1,
    fontSize: 16,
    color: Colors.textPrimary,
  },
  townshipPickerPlaceholder: {
    color: Colors.textTertiary,
  },
  townshipList: {
    maxHeight: 220,
    backgroundColor: Colors.surface,
    borderRadius: 12,
    marginTop: 8,
    borderWidth: 1.5,
    borderColor: Colors.borderLight,
  },
  townshipItem: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'space-between' as const,
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: Colors.borderLight,
  },
  townshipItemSelected: {
    backgroundColor: Colors.primaryLight,
  },
  townshipItemText: {
    fontSize: 15,
    color: Colors.textPrimary,
  },
  townshipItemTextSelected: {
    color: Colors.primary,
    fontWeight: '700' as const,
  },
  addressErrorBox: {
    backgroundColor: Colors.errorLight,
    borderRadius: 12,
    padding: 14,
    marginTop: 4,
    borderWidth: 1,
    borderColor: Colors.error,
  },
  addressErrorText: {
    fontSize: 14,
    fontWeight: '600' as const,
    color: Colors.error,
  },
  // vC16 Task B: location button + GPS capture styles
  locationBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 12,
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
});
