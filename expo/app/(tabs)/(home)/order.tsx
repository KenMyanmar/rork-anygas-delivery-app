import React, { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Animated,
  Platform,
  ActivityIndicator,
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
} from 'lucide-react-native';
import { Image } from 'react-native';
import * as Haptics from 'expo-haptics';
import { useQuery } from '@tanstack/react-query';
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
} from '@/types';
import { fetchCatalog, displayBrandName, CatalogEntry } from '@/lib/catalog';
import { useI18n } from '@/providers/I18nProvider';

// Derived from catalog-list response — single source of truth.
interface CatalogBrand {
  id: string;
  name: string;
  logo_url: string | null;
  sort_order: number;
  refill_delivery_fee: number;
  allow_new_setup: boolean;
}

type Step = 'brand' | 'size' | 'type' | 'pricing' | 'address' | 'payment' | 'confirm';

const STEPS_WITH_ADDRESS: Step[] = ['brand', 'size', 'type', 'pricing', 'address', 'payment', 'confirm'];
const STEPS_WITHOUT_ADDRESS: Step[] = ['brand', 'size', 'type', 'pricing', 'payment', 'confirm'];

const STEP_LABELS: Record<Step, string> = {
  brand: 'Brand',
  size: 'Size',
  type: 'Type',
  pricing: 'Price',
  address: 'Address',
  payment: 'Payment',
  confirm: 'Confirm',
};

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
  const { placeOrder } = useOrders();
  const { t, tMM, language, isMM } = useI18n();

  const [currentStep, setCurrentStep] = useState<Step>('brand');
  const [selectedBrandId, setSelectedBrandId] = useState<string | null>(
    params.reorderBrand || null
  );
  const [selectedCylinder, setSelectedCylinder] = useState<CylinderOption | null>(null);
  const [selectedType, setSelectedType] = useState<OrderType | null>(
    (params.reorderType as OrderType) || null
  );
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
  const [quantity] = useState<number>(1);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const slideAnim = useRef(new Animated.Value(0)).current;

  // Single fetch via the catalog-list edge function — same source the Mini App uses.
  // Returns brands (with refill_delivery_fee + allow_new_setup) and their products in one call.
  const catalogQuery = useQuery({
    queryKey: ['catalog'],
    queryFn: async () => {
      console.log('[Order] Fetching catalog via catalog-list');
      return await fetchCatalog();
    },
  });

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

  useEffect(() => {
    if (params.reorderBrand && params.reorderSize && params.reorderType) {
      setCurrentStep('pricing');
    }
  }, []);

  const selectedBrand = useMemo(() => {
    const brand = brands.find(b => b.id === selectedBrandId) || null;
    if (brand) {
      return { ...brand, name: displayBrandName(brand.name) };
    }
    return brand;
  }, [brands, selectedBrandId]);

  // vC13 Task B: show address step when customer has no address (gate), when user
  // tapped Change (showAddressStep), or when editing the address.
  const needsAddressStep = !customerHasAddress || showAddressStep || editingAddress;
  const steps = needsAddressStep ? STEPS_WITH_ADDRESS : STEPS_WITHOUT_ADDRESS;
  const currentStepIndex = steps.indexOf(currentStep);
  const progress = (currentStepIndex + 1) / steps.length;

  const animateTransition = useCallback(() => {
    slideAnim.setValue(30);
    Animated.spring(slideAnim, { toValue: 0, tension: 80, friction: 12, useNativeDriver: true }).start();
  }, [slideAnim]);

  const goNext = useCallback(() => {
    const idx = steps.indexOf(currentStep);
    if (idx < steps.length - 1) {
      if (Platform.OS !== 'web') {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      }
      setCurrentStep(steps[idx + 1]);
      animateTransition();
    }
  }, [currentStep, animateTransition, steps]);

  const goBack = useCallback(() => {
    if (currentStep === 'address' && customerHasAddress && !editingAddress) {
      setShowAddressStep(false);
      setEditingAddress(false);
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
      const dbFee = selectedCatalogEntry?.brand?.refill_delivery_fee;
      if (dbFee != null) {
        deliveryFee = dbFee;
      } else {
        deliveryFee = selectedBrand?.name === 'Other Partners'
          ? REFILL_FEE_OTHER_PARTNERS
          : REFILL_FEE_STANDARD;
      }
    } else if (selectedType === 'new_setup') {
      cylinderPrice = selectedCylinder.cylinderPrice * quantity;
      deliveryFee = 0;
    }
    // vC13: exchange/service_call removed from the customer surface (2-SKU).
    // They remain in the EF contract for hotline/CRM operations.

    const total = gasPrice + cylinderPrice + deliveryFee;
    return { gasPrice, cylinderPrice, deliveryFee, total };
  }, [selectedCylinder, selectedType, quantity, selectedBrand, selectedCatalogEntry]);

  const handleConfirmOrder = useCallback(async () => {
    if (!selectedBrandId || !selectedCylinder || !selectedType || !selectedAddress || !selectedPayment || !customerId) return;
    setIsSubmitting(true);
    try {
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
      if (Platform.OS !== 'web') {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }
      router.replace('/(tabs)/(home)/tracking');
    } catch (e: unknown) {
      const errorMessage = e instanceof Error ? e.message : t('order_failed');
      console.log('[Order] Error placing order:', errorMessage);
      Alert.alert(t('order_failed'), errorMessage);
    } finally {
      setIsSubmitting(false);
    }
  }, [selectedBrandId, selectedBrand, selectedCylinder, selectedType, selectedAddress, selectedPayment, customerId, quantity, calculatePricing, placeOrder, t]);

  const pricing = calculatePricing();

  const renderStepContent = () => {
    switch (currentStep) {
      case 'brand':
        return (
          <View style={styles.stepContent}>
            <Text style={styles.stepTitle}>{isMM ? t('select_brand') : t('select_brand')}</Text>
            <Text style={styles.stepTitleMM}>{tMM('select_brand')}</Text>
            {catalogQuery.isLoading ? (
              <View style={styles.loadingWrap}>
                <ActivityIndicator size="large" color={Colors.primary} />
                <Text style={styles.loadingText}>{t('loading_brands')}</Text>
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
                {brands.map((brand) => {
                  const color = getBrandColor(brand.name);
                  const displayName = displayBrandName(brand.name);
                  return (
                    <TouchableOpacity
                      key={brand.id}
                      style={[
                        styles.brandOption,
                        selectedBrandId === brand.id && { borderColor: color, borderWidth: 2.5, backgroundColor: color + '08' },
                      ]}
                      onPress={() => {
                        setSelectedBrandId(brand.id);
                        setSelectedCylinder(null);
                      }}
                      activeOpacity={0.7}
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
                    </TouchableOpacity>
                  );
                })}
              </View>
            )}
          </View>
        );

      case 'size':
        return (
          <View style={styles.stepContent}>
            <Text style={styles.stepTitle}>{t('select_size')}</Text>
            <Text style={styles.stepTitleMM}>{tMM('select_size')}</Text>
            {cylindersLoading ? (
              <View style={styles.loadingWrap}>
                <ActivityIndicator size="large" color={Colors.primary} />
                <Text style={styles.loadingText}>{t('loading_sizes')}</Text>
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
              <View style={styles.sizeGrid}>
                {cylinderOptions.map((cyl) => {
                  const isSelected = selectedCylinder?.id === cyl.id;
                  return (
                    <TouchableOpacity
                      key={cyl.id}
                      style={[
                        styles.sizeOption,
                        isSelected && styles.sizeOptionSelected,
                      ]}
                      onPress={() => setSelectedCylinder(cyl)}
                      activeOpacity={0.7}
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
                    </TouchableOpacity>
                  );
                })}
              </View>
            )}
          </View>
        );

      case 'type':
        return (
          <View style={styles.stepContent}>
            <Text style={styles.stepTitle}>{t('order_type')}</Text>
            <Text style={styles.stepTitleMM}>{tMM('order_type')}</Text>
            <View style={styles.typeList}>
              {ORDER_TYPES.map((type) => {
                // Hide new_setup if the selected brand disallows it (from catalog-list).
                if (type.id === 'new_setup' && selectedCatalogEntry && !selectedCatalogEntry.brand.allow_new_setup) {
                  return null;
                }
                const label = type.id === 'refill' ? t('type_refill')
                  : t('type_new_setup');
                const labelMM = type.id === 'refill' ? tMM('type_refill')
                  : tMM('type_new_setup');
                const desc = type.id === 'refill' ? t('type_refill_desc')
                  : t('type_new_setup_desc');
                return (
                  <TouchableOpacity
                    key={type.id}
                    style={[
                      styles.typeOption,
                      selectedType === type.id && styles.typeOptionSelected,
                    ]}
                    onPress={() => setSelectedType(type.id)}
                    activeOpacity={0.7}
                  >
                    <View style={styles.typeOptionLeft}>
                      <Text style={[styles.typeLabel, selectedType === type.id && styles.typeLabelSelected]}>
                        {label}
                      </Text>
                      <Text style={styles.typeLabelMM}>{labelMM}</Text>
                      <Text style={styles.typeDesc}>{desc}</Text>
                    </View>
                    {selectedType === type.id && (
                      <View style={styles.typeCheck}>
                        <Check size={18} color={Colors.primary} />
                      </View>
                    )}
                  </TouchableOpacity>
                );
              })}
            </View>
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
                  {t('gas')} ({selectedCylinder?.size}kg × {formatPrice(selectedCylinder?.pricePerKg || 0)}/kg)
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
                <Text style={styles.pricingTotalValue}>{formatPrice(pricing.total)} MMK</Text>
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
                <TouchableOpacity
                  style={[styles.addressOption, styles.addressOptionSelected]}
                  onPress={() => setSelectedAddress(customerAddress)}
                  activeOpacity={0.7}
                >
                  <MapPin size={20} color={Colors.primary} />
                  <View style={styles.addressOptionContent}>
                    <Text style={[styles.addressOptionLabel, styles.addressOptionLabelSelected]}>
                      {customerAddress.label}
                    </Text>
                    <Text style={styles.addressOptionText} numberOfLines={2}>{customerAddress.address}</Text>
                  </View>
                  <Check size={18} color={Colors.primary} />
                </TouchableOpacity>
              )}
              <TouchableOpacity
                style={styles.editAddressBtn}
                onPress={() => {
                  setPendingAddress(activeCustomer?.address || '');
                  setPendingTownship(activeCustomer?.township || '');
                  setEditingAddress(true);
                  setAddressSaveError(null);
                  animateTransition();
                }}
                activeOpacity={0.7}
              >
                <Text style={styles.editAddressBtnText}>{t('change')}</Text>
              </TouchableOpacity>
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
            <TouchableOpacity
              style={[
                styles.locationBtn,
                locationStatus === 'saved' && styles.locationBtnSaved,
                locationStatus === 'loading' && styles.locationBtnLoading,
              ]}
              onPress={handleUseLocation}
              disabled={locationStatus === 'loading'}
              activeOpacity={0.7}
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
            </TouchableOpacity>
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
              {PAYMENT_OPTIONS.map((opt) => {
                const label = opt.id === 'cash' ? t('pay_cash')
                  : opt.id === 'kbz_pay' ? t('pay_kbz')
                  : opt.id === 'wave_money' ? t('pay_wave')
                  : t('pay_cb');
                return (
                  <TouchableOpacity
                    key={opt.id}
                    style={[
                      styles.paymentOption,
                      selectedPayment === opt.id && styles.paymentOptionSelected,
                    ]}
                    onPress={() => setSelectedPayment(opt.id)}
                    activeOpacity={0.7}
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
                  </TouchableOpacity>
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
              <View style={styles.confirmRow}>
                <Text style={styles.confirmLabel}>{t('brand')}</Text>
                <Text style={styles.confirmValue}>{selectedBrand?.name}</Text>
              </View>
              <View style={styles.confirmRow}>
                <Text style={styles.confirmLabel}>{t('size')}</Text>
                <Text style={styles.confirmValue}>{selectedCylinder?.size} kg</Text>
              </View>
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
                <Text style={styles.pricingTotalValue}>{formatPrice(pricing.total)} MMK</Text>
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
      case 'brand': return !!selectedBrandId;
      case 'size': return !!selectedCylinder;
      case 'type': return !!selectedType;
      case 'pricing': return true;
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
          <TouchableOpacity onPress={goBack} style={styles.backBtn} activeOpacity={0.7}>
            {currentStepIndex === 0 ? <X size={22} color={Colors.textPrimary} /> : <ChevronLeft size={22} color={Colors.textPrimary} />}
          </TouchableOpacity>
          <View style={styles.stepIndicator}>
            {steps.map((s, i) => (
              <View
                key={s}
                style={[
                  styles.stepDot,
                  i <= currentStepIndex && styles.stepDotActive,
                  i === currentStepIndex && styles.stepDotCurrent,
                ]}
              />
            ))}
          </View>
          <Text style={styles.stepLabel}>{STEP_LABELS[currentStep]}</Text>
        </View>

        <View style={styles.progressBar}>
          <Animated.View style={[styles.progressFill, { width: `${progress * 100}%` }]} />
        </View>

        <ScrollView
          style={styles.scrollArea}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          <Animated.View style={{ transform: [{ translateY: slideAnim }] }}>
            {renderStepContent()}
          </Animated.View>
        </ScrollView>

        <View style={styles.bottomBar}>
          {currentStep === 'address' && (editingAddress || !customerHasAddress) ? (
            // vC13 Task B: address gate — Save button drives the form submit.
            // Blocks checkout until a valid address is saved. Visible error on fail.
            <TouchableOpacity
              style={[styles.nextButton, isSavingAddress && styles.buttonDisabled]}
              onPress={handleSaveAddress}
              disabled={isSavingAddress}
              activeOpacity={0.85}
              testID="save-address-button"
            >
              {isSavingAddress ? (
                <ActivityIndicator color="#FFFFFF" />
              ) : (
                <Text style={styles.nextButtonText}>{t('save_and_continue')}</Text>
              )}
            </TouchableOpacity>
          ) : currentStep === 'confirm' ? (
            <TouchableOpacity
              style={[styles.confirmButton, isSubmitting && styles.buttonDisabled]}
              onPress={handleConfirmOrder}
              disabled={isSubmitting}
              activeOpacity={0.85}
              testID="confirm-order-button"
            >
              {isSubmitting ? (
                <ActivityIndicator color="#FFFFFF" />
              ) : (
                <>
                  <Flame size={20} color="#FFFFFF" />
                  <Text style={styles.confirmButtonText}>{t('place_order')} • {formatPrice(pricing.total)} MMK</Text>
                </>
              )}
            </TouchableOpacity>
          ) : (
            <TouchableOpacity
              style={[styles.nextButton, !canProceed() && styles.buttonDisabled]}
              onPress={goNext}
              disabled={!canProceed()}
              activeOpacity={0.85}
            >
              <Text style={styles.nextButtonText}>{t('continue')}</Text>
            </TouchableOpacity>
          )}
        </View>
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
  stepIndicator: {
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 6,
  },
  stepDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: Colors.border,
  },
  stepDotActive: {
    backgroundColor: Colors.primaryMuted,
  },
  stepDotCurrent: {
    backgroundColor: Colors.primary,
    width: 20,
    borderRadius: 4,
  },
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
    borderRadius: 2,
  },
  progressFill: {
    height: 3,
    backgroundColor: Colors.primary,
    borderRadius: 2,
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
  brandOption: {
    flexGrow: 1,
    flexBasis: '28%' as unknown as number,
    minWidth: 100,
    backgroundColor: Colors.surface,
    borderRadius: 18,
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
    borderRadius: 36,
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
    borderRadius: 8,
  },
  cylinderIconWrap: {
    width: 56,
    height: 56,
    borderRadius: 14,
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
    borderRadius: 18,
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
    borderRadius: 18,
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
    borderRadius: 14,
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
    borderRadius: 10,
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
    borderRadius: 14,
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
    borderRadius: 14,
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
    borderRadius: 14,
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
    borderRadius: 14,
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
});
