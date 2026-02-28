export interface UserProfile {
  id: string;
  phoneNumber: string;
  name: string;
  isDefault: boolean;
}

export interface Customer {
  id: string;
  name: string;
  full_name: string;
  phone: string;
  secondary_phone: string | null;
  township: string | null;
  address: string | null;
  auth_user_id: string | null;
  created_at: string;
  updated_at: string;
}

export type CustomerLinkingState = 
  | 'idle'
  | 'checking'
  | 'linked'
  | 'select_profile'
  | 'register_new';

export interface SavedAddress {
  id: string;
  label: string;
  address: string;
  latitude: number;
  longitude: number;
  isDefault: boolean;
}

export type GasBrandId = string;

export interface GasBrand {
  id: string;
  name: string;
  nameMM?: string;
  color: string;
  logoUrl: string;
  brand_type?: string;
}

export type CylinderSize = number;

export interface CylinderOption {
  id: string;
  size: number;
  displayName: string;
  cylinderPrice: number;
  pricePerKg: number;
  gasPrice: number;
  imageUrl: string | null;
}

export type OrderType = 'refill' | 'new_setup' | 'exchange';

export interface OrderTypeOption {
  id: OrderType;
  label: string;
  labelMM: string;
  description: string;
  descriptionMM: string;
}

export type PaymentMethod = 'cash' | 'kbz_pay' | 'wave_money' | 'cb_pay';

export interface PaymentOption {
  id: PaymentMethod;
  label: string;
  icon: string;
  color: string;
}

export interface PricingBreakdown {
  gasPrice: number;
  cylinderPrice: number;
  deliveryFee: number;
  total: number;
}

export type OrderStatus = 'new' | 'confirmed' | 'dispatched' | 'delivered' | 'cancelled' | 'failed';

export interface DeliveryAgent {
  id: string;
  name: string;
  phone: string;
  latitude: number;
  longitude: number;
}

export interface Order {
  id: string;
  userId: string;
  brandId: string;
  brandName?: string;
  cylinderSize: number;
  cylinderTypeId?: string;
  orderType: OrderType;
  pricing: PricingBreakdown;
  address: SavedAddress;
  paymentMethod: PaymentMethod;
  status: OrderStatus;
  agent?: DeliveryAgent;
  rating?: number;
  ratingComment?: string;
  createdAt: string;
  updatedAt: string;
  estimatedDelivery?: string;
}

export interface Notification {
  id: string;
  title: string;
  titleMM: string;
  body: string;
  bodyMM: string;
  type: 'order_update' | 'promotion' | 'system';
  orderId?: string;
  read: boolean;
  createdAt: string;
}
