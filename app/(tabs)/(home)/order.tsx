import React, { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import {
  View,
  Text,
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
} from 'lucide-react-native';
import { Image } from 'react-native';
import * as Haptics from 'expo-haptics';
import { useQuery } from '@tanstack/react-query';
import Colors from '@/constants/colors';
import { useAuth } from '@/providers/AuthProvider';
import { useOrders } from '@/providers/OrderProvider';
import { Alert } from 'react-native';
import { ORDER_TYPES, PAYMENT_OPTIONS } from '@/constants/brands';
import { supabase } from '@/lib/supabase';
import {
  OrderType,
  PaymentMethod,
  PricingBreakdown,
  SavedAddress,
  CylinderOption,
} from '@/types';

interface SupabaseBrand {
  id: string;
  name: string;
  logo_url: string | null;
  sort_order: number;
}

interface SupabaseCylinderType {
  id: string;
  display_name: string;
  size_kg: number;
  cylinder_price: number;
  image_url: string | null;
}

interface SupabaseGasPrice {
  price_per_kg: number;
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

const DELIVERY_FEE_REFILL = 3000;
const EXCHANGE_FEE = 2000;

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
  const { savedAddresses, getDefaultAddress, customerId, activeCustomer } = useAuth();
  const { placeOrder } = useOrders();

  const [currentStep, setCurrentStep] = useState<Step>('brand');
  const [selectedBrandId, setSelectedBrandId] = useState<string | null>(
    params.reorderBrand || null
  );
  const [selectedCylinder, setSelectedCylinder] = useState<CylinderOption | null>(null);
  const [selectedType, setSelectedType] = useState<OrderType | null>(
    (params.reorderType as OrderType) || null
  );
  const customerHasAddress = !!(activeCustomer?.address && activeCustomer?.township);
  const customerAddress: SavedAddress | null = customerHasAddress
    ? {
        id: 'customer_default',
        label: activeCustomer!.township!,
        address: `${activeCustomer!.address}, ${activeCustomer!.township}`,
        latitude: 0,
        longitude: 0,
        isDefault: true,
      }
    : null;

  const [selectedAddress, setSelectedAddress] = useState<SavedAddress | null>(
    customerAddress || getDefaultAddress()
  );
  const [showAddressStep, setShowAddressStep] = useState<boolean>(false);
  const [selectedPayment, setSelectedPayment] = useState<PaymentMethod | null>(null);
  const [quantity] = useState<number>(1);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const slideAnim = useRef(new Animated.Value(0)).current;

  const brandsQuery = useQuery({
    queryKey: ['brands'],
    queryFn: async () => {
      console.log('[Order] Fetching brands from Supabase');
      const { data, error } = await supabase
        .from('brands')
        .select('id, name, logo_url, sort_order')
        .eq('is_active', true)
        .order('sort_order');

      if (error) {
        console.log('[Order] Brands fetch error:', error.message);
        throw error;
      }
      console.log('[Order] Fetched brands:', data?.length);
      return (data || []) as SupabaseBrand[];
    },
  });

  const gasPriceQuery = useQuery({
    queryKey: ['gas_price', selectedBrandId],
    queryFn: async () => {
      if (!selectedBrandId) return null;
      console.log('[Order] Fetching gas price for brand:', selectedBrandId);
      const { data, error } = await supabase
        .from('gas_prices')
        .select('price_per_kg')
        .eq('brand_id', selectedBrandId)
        .is('effective_to', null)
        .limit(1);

      if (error) {
        console.log('[Order] Gas price fetch error:', JSON.stringify(error));
        throw error;
      }
      if (!data || data.length === 0) {
        console.log('[Order] No gas price found for brand:', selectedBrandId);
        throw new Error('No price found for this brand');
      }
      const row = data[0] as SupabaseGasPrice;
      console.log('[Order] Fetched gas price:', row.price_per_kg);
      return row;
    },
    enabled: !!selectedBrandId,
  });

  const cylinderTypesQuery = useQuery({
    queryKey: ['cylinder_types'],
    queryFn: async () => {
      console.log('[Order] Fetching cylinder types');
      const { data, error } = await supabase
        .from('cylinder_types')
        .select('id, display_name, size_kg, cylinder_price, image_url')
        .eq('is_active', true)
        .lte('size_kg', 20)
        .order('size_kg');

      if (error) {
        console.log('[Order] Cylinder types fetch error:', JSON.stringify(error));
        throw error;
      }
      console.log('[Order] Fetched cylinder types:', data?.length, JSON.stringify(data));
      return (data || []) as SupabaseCylinderType[];
    },
  });

  const cylindersLoading = gasPriceQuery.isLoading || cylinderTypesQuery.isLoading;
  const cylindersError = gasPriceQuery.isError || cylinderTypesQuery.isError;

  const cylinderOptions: CylinderOption[] = useMemo(() => {
    if (!cylinderTypesQuery.data || !gasPriceQuery.data) return [];
    const pricePerKg = gasPriceQuery.data.price_per_kg;
    return cylinderTypesQuery.data.map(c => ({
      id: c.id,
      size: c.size_kg,
      displayName: c.display_name,
      cylinderPrice: c.cylinder_price,
      pricePerKg,
      gasPrice: Math.round(pricePerKg * c.size_kg),
      imageUrl: c.image_url,
    }));
  }, [cylinderTypesQuery.data, gasPriceQuery.data]);

  useEffect(() => {
    if (params.reorderBrand && params.reorderSize && params.reorderType) {
      setCurrentStep('pricing');
    }
  }, []);

  const selectedBrand = useMemo(() => {
    const brand = brandsQuery.data?.find(b => b.id === selectedBrandId) || null;
    if (brand && brand.name === 'Other Partners') {
      return { ...brand, name: 'Any Brands' };
    }
    return brand;
  }, [brandsQuery.data, selectedBrandId]);

  const steps = (customerHasAddress && !showAddressStep) ? STEPS_WITHOUT_ADDRESS : STEPS_WITH_ADDRESS;
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
    if (currentStep === 'address' && showAddressStep && customerHasAddress) {
      setShowAddressStep(false);
      setCurrentStep('pricing');
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
  }, [currentStep, animateTransition, steps, showAddressStep, customerHasAddress]);

  const calculatePricing = useCallback((): PricingBreakdown => {
    if (!selectedCylinder || !selectedType) {
      return { gasPrice: 0, cylinderPrice: 0, deliveryFee: 0, total: 0 };
    }
    const gasPrice = Math.round(selectedCylinder.pricePerKg * selectedCylinder.size * quantity);
    let cylinderPrice = 0;
    let deliveryFee = 0;

    if (selectedType === 'refill') {
      deliveryFee = DELIVERY_FEE_REFILL;
    } else if (selectedType === 'new_setup') {
      cylinderPrice = selectedCylinder.cylinderPrice * quantity;
      deliveryFee = 0;
    } else if (selectedType === 'exchange') {
      deliveryFee = EXCHANGE_FEE;
    }

    const total = gasPrice + cylinderPrice + deliveryFee;
    return { gasPrice, cylinderPrice, deliveryFee, total };
  }, [selectedCylinder, selectedType, quantity]);

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
      const errorMessage = e instanceof Error ? e.message : 'Failed to place order. Please try again.';
      console.log('[Order] Error placing order:', errorMessage);
      Alert.alert('Order Failed', errorMessage);
    } finally {
      setIsSubmitting(false);
    }
  }, [selectedBrandId, selectedBrand, selectedCylinder, selectedType, selectedAddress, selectedPayment, customerId, quantity, calculatePricing, placeOrder]);

  const pricing = calculatePricing();

  const renderStepContent = () => {
    switch (currentStep) {
      case 'brand':
        return (
          <View style={styles.stepContent}>
            <Text style={styles.stepTitle}>Select Gas Brand</Text>
            <Text style={styles.stepTitleMM}>ဂက်စ်အမှတ်တံဆိပ် ရွေးပါ</Text>
            {brandsQuery.isLoading ? (
              <View style={styles.loadingWrap}>
                <ActivityIndicator size="large" color={Colors.primary} />
                <Text style={styles.loadingText}>Loading brands...</Text>
              </View>
            ) : brandsQuery.isError ? (
              <View style={styles.errorWrap}>
                <Text style={styles.errorText}>Failed to load brands</Text>
                <TouchableOpacity
                  style={styles.retryBtn}
                  onPress={() => brandsQuery.refetch()}
                >
                  <Text style={styles.retryText}>Retry</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <View style={styles.optionsGrid}>
                {(brandsQuery.data || []).map((brand) => {
                  const color = getBrandColor(brand.name);
                  const displayName = brand.name === 'Other Partners' ? 'Any Brands' : brand.name;
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
            <Text style={styles.stepTitle}>Select Cylinder Size</Text>
            <Text style={styles.stepTitleMM}>ဆလင်ဒါအရွယ်အစား ရွေးပါ</Text>
            {cylindersLoading ? (
              <View style={styles.loadingWrap}>
                <ActivityIndicator size="large" color={Colors.primary} />
                <Text style={styles.loadingText}>Loading sizes...</Text>
              </View>
            ) : cylindersError ? (
              <View style={styles.errorWrap}>
                <Text style={styles.errorText}>Failed to load cylinder sizes</Text>
                <TouchableOpacity
                  style={styles.retryBtn}
                  onPress={() => {
                    gasPriceQuery.refetch();
                    cylinderTypesQuery.refetch();
                  }}
                >
                  <Text style={styles.retryText}>Retry</Text>
                </TouchableOpacity>
              </View>
            ) : cylinderOptions.length === 0 ? (
              <View style={styles.errorWrap}>
                <Text style={styles.errorText}>No cylinder sizes available for this brand</Text>
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
            <Text style={styles.stepTitle}>Order Type</Text>
            <Text style={styles.stepTitleMM}>အော်ဒါအမျိုးအစား ရွေးပါ</Text>
            <View style={styles.typeList}>
              {ORDER_TYPES.map((type) => (
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
                      {type.label}
                    </Text>
                    <Text style={styles.typeLabelMM}>{type.labelMM}</Text>
                    <Text style={styles.typeDesc}>{type.description}</Text>
                  </View>
                  {selectedType === type.id && (
                    <View style={styles.typeCheck}>
                      <Check size={18} color={Colors.primary} />
                    </View>
                  )}
                </TouchableOpacity>
              ))}
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
                    <Text style={styles.deliveryBarLabel}>Delivering to</Text>
                    <Text style={styles.deliveryBarAddress} numberOfLines={1}>{selectedAddress.address}</Text>
                  </View>
                </View>
                <Text style={styles.deliveryBarChange}>Change</Text>
              </TouchableOpacity>
            )}
            <Text style={styles.stepTitle}>Price Breakdown</Text>
            <Text style={styles.stepTitleMM}>ဈေးနှုန်းအသေးစိတ်</Text>
            <View style={styles.pricingCard}>
              <View style={styles.pricingRow}>
                <Text style={styles.pricingLabel}>
                  Gas ({selectedCylinder?.size}kg × {formatPrice(selectedCylinder?.pricePerKg || 0)}/kg)
                </Text>
                <Text style={styles.pricingValue}>{formatPrice(pricing.gasPrice)} MMK</Text>
              </View>
              {pricing.cylinderPrice > 0 && (
                <View style={styles.pricingRow}>
                  <Text style={styles.pricingLabel}>New Cylinder</Text>
                  <Text style={styles.pricingValue}>{formatPrice(pricing.cylinderPrice)} MMK</Text>
                </View>
              )}
              <View style={styles.pricingRow}>
                <Text style={styles.pricingLabel}>
                  {selectedType === 'exchange' ? 'Exchange Fee' : 'Delivery Fee'}
                </Text>
                <Text style={styles.pricingValue}>{formatPrice(pricing.deliveryFee)} MMK</Text>
              </View>
              <View style={styles.pricingDivider} />
              <View style={styles.pricingRow}>
                <Text style={styles.pricingTotal}>Total</Text>
                <Text style={styles.pricingTotalValue}>{formatPrice(pricing.total)} MMK</Text>
              </View>
            </View>
          </View>
        );

      case 'address':
        return (
          <View style={styles.stepContent}>
            <Text style={styles.stepTitle}>Delivery Address</Text>
            <Text style={styles.stepTitleMM}>ပို့ဆောင်မည့်လိပ်စာ ရွေးပါ</Text>
            <View style={styles.addressList}>
              {savedAddresses.map((addr) => (
                <TouchableOpacity
                  key={addr.id}
                  style={[
                    styles.addressOption,
                    selectedAddress?.id === addr.id && styles.addressOptionSelected,
                  ]}
                  onPress={() => setSelectedAddress(addr)}
                  activeOpacity={0.7}
                >
                  <MapPin size={20} color={selectedAddress?.id === addr.id ? Colors.primary : Colors.textTertiary} />
                  <View style={styles.addressOptionContent}>
                    <Text style={[styles.addressOptionLabel, selectedAddress?.id === addr.id && styles.addressOptionLabelSelected]}>
                      {addr.label}
                    </Text>
                    <Text style={styles.addressOptionText} numberOfLines={2}>{addr.address}</Text>
                  </View>
                  {selectedAddress?.id === addr.id && (
                    <Check size={18} color={Colors.primary} />
                  )}
                </TouchableOpacity>
              ))}
            </View>
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
                    <Text style={styles.deliveryBarLabel}>Delivering to</Text>
                    <Text style={styles.deliveryBarAddress} numberOfLines={1}>{selectedAddress.address}</Text>
                  </View>
                </View>
                <Text style={styles.deliveryBarChange}>Change</Text>
              </TouchableOpacity>
            )}
            <Text style={styles.stepTitle}>Payment Method</Text>
            <Text style={styles.stepTitleMM}>ငွေပေးချေမှု ရွေးပါ</Text>
            <View style={styles.paymentList}>
              {PAYMENT_OPTIONS.map((opt) => (
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
                    {opt.label}
                  </Text>
                  {selectedPayment === opt.id && (
                    <Check size={18} color={Colors.primary} />
                  )}
                </TouchableOpacity>
              ))}
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
                  <Text style={styles.deliveryBarLabel}>Delivering to</Text>
                  <Text style={styles.deliveryBarAddress} numberOfLines={1}>{selectedAddress.address}</Text>
                </View>
                <Check size={16} color="#16A34A" />
              </View>
            )}
            <Text style={styles.stepTitle}>Confirm Order</Text>
            <Text style={styles.stepTitleMM}>အော်ဒါ အတည်ပြုပါ</Text>
            <View style={styles.confirmCard}>
              <View style={styles.confirmRow}>
                <Text style={styles.confirmLabel}>Brand</Text>
                <Text style={styles.confirmValue}>{selectedBrand?.name}</Text>
              </View>
              <View style={styles.confirmRow}>
                <Text style={styles.confirmLabel}>Size</Text>
                <Text style={styles.confirmValue}>{selectedCylinder?.size} kg</Text>
              </View>
              <View style={styles.confirmRow}>
                <Text style={styles.confirmLabel}>Type</Text>
                <Text style={styles.confirmValue}>{ORDER_TYPES.find(t => t.id === selectedType)?.label}</Text>
              </View>
              <View style={styles.confirmRow}>
                <Text style={styles.confirmLabel}>Address</Text>
                <Text style={styles.confirmValue} numberOfLines={2}>{selectedAddress?.address}</Text>
              </View>
              <View style={styles.confirmRow}>
                <Text style={styles.confirmLabel}>Payment</Text>
                <Text style={styles.confirmValue}>{PAYMENT_OPTIONS.find(p => p.id === selectedPayment)?.label}</Text>
              </View>
              <View style={styles.pricingDivider} />
              <View style={styles.confirmRow}>
                <Text style={styles.pricingTotal}>Total</Text>
                <Text style={styles.pricingTotalValue}>{formatPrice(pricing.total)} MMK</Text>
              </View>
            </View>
          </View>
        );
    }
  };

  const canProceed = () => {
    switch (currentStep) {
      case 'brand': return !!selectedBrandId;
      case 'size': return !!selectedCylinder;
      case 'type': return !!selectedType;
      case 'pricing': return true;
      case 'address': return !!selectedAddress;
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
          {currentStep === 'confirm' ? (
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
                  <Text style={styles.confirmButtonText}>Place Order • {formatPrice(pricing.total)} MMK</Text>
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
              <Text style={styles.nextButtonText}>Continue</Text>
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
});
