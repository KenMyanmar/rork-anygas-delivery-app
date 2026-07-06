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
  // vC16: landmark + GPS coordinates for the address experience.
  // Written via customers_update_own_profile RLS (verified in prod).
  landmark: string | null;
  gps_lat: number | null;
  gps_lng: number | null;
  auth_user_id: string | null;
  created_at: string;
  updated_at: string;
}

// vC16 Task A: A parked account from soft sign-out. The session is stored in
// SecureStore; PIN re-enters without OTP. "Use another number" or "Remove
// account" clears it and requires fresh OTP.
export interface ParkedAccount {
  phone: string;
  name?: string | null;
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

// vC13: 2-SKU surface — Exchange & Service Call removed from the customer app.
// They remain hotline/CRM operations (34 + 62 orders ever, 100% hotline).
// The EF still accepts them, but the customer UI no longer offers them.
export type OrderType = 'refill' | 'new_setup';

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

export type OrderStatus = 'new' | 'confirmed' | 'in_progress' | 'dispatched' | 'delivered' | 'cancelled' | 'failed';

// vC13 truth pass: DeliveryAgent removed — the agent card was keyed off ghost
// columns (assigned_agent_id / agent_name / agent_phone / agent_latitude /
// agent_longitude) that don't exist on the orders table. The dead agent card
// is gone; live tracking/agent display arrives with Lane 2 item 5.

export interface Order {
  id: string;
  userId: string;
  brandId: string;
  brandName?: string;
  cylinderSize: number;
  // vC14 Task B: cylinder_type is the real, populated text column on orders
  // (the EF writes the display name at creation). Replaces the ghost
  // cylinder_type_id column that doesn't exist in the 61-column orders table.
  cylinderType?: string | null;
  // vC17: quantity is a real column on orders (the EF accepts quantity 1–10).
  // Defaults to 1 for orders created before this field was surfaced.
  quantity?: number;
  orderType: OrderType;
  pricing: PricingBreakdown;
  address: SavedAddress;
  paymentMethod: PaymentMethod;
  status: OrderStatus;
  /** True when a supplier/delivery agent has been assigned (supplier_id IS NOT NULL).
   *  Distinct from status — an order can be status='new' yet already assigned, or
   *  status='in_progress' (on the way). The 4-stage tracker reads this for Step 2. */
  supplierAssigned?: boolean;
  // vC12 #2: rating is UI-only/local pending the A2 Grand Plan (order_ratings).
  rating?: number;
  ratingComment?: string;
  createdAt: string;
  updatedAt: string;
  // vC13: estimatedDelivery removed — no eta column exists on orders (bounded-
  // negative). The tracker now shows honest stage-based ranges instead of a
  // fabricated "45 min" string. Real ETA arrives with Lane 2 item 5.
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
