import React, { useState, useCallback, useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import createContextHook from '@nkzw/create-context-hook';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { devLog } from '@/lib/logger';
import { Order } from '@/types';
import { useAuth } from '@/providers/AuthProvider';
import { fetchCatalog, displayBrandName } from '@/lib/catalog';
import { fetchEquipmentBundles } from '@/lib/bundles';

const ORDERS_KEY_PREFIX = 'anygas_orders';

function ordersStorageKey(customerId: string): string {
  return `${ORDERS_KEY_PREFIX}:${customerId}`;
}


interface EdgeFunctionOrderPayload {
  customer_id: string;
  brand_id: string;
  cylinder_type_id?: string;
  cylinder_size: number;
  order_type: string;
  gas_subtotal: number;
  cylinder_subtotal: number;
  delivery_fee: number;
  total_amount: number;
  delivery_address_id: string;
  delivery_latitude: number;
  delivery_longitude: number;
  delivery_address_text: string;
  payment_method: string;
}

// vC13 truth pass: only columns verified to exist on the orders table remain.
// 13 ghost columns removed — assigned_agent_id, agent_name/phone/lat/lng,
// rating, rating_comment, estimated_delivery, brand_name (dead — 0% filled,
// EF write is Lane 2), cylinder_display_name (same), delivery_address_id,
// delivery_latitude/longitude (no such columns; address lives in orders.address).
// vC14 Task B: cylinder_size + cylinder_type_id were ghosts too — replaced with
// cylinder_type (text, populated — the EF writes the display name at creation).
interface SupabaseOrderRow {
  id: string;
  customer_id: string;
  brand_id: string;
  cylinder_size: number;
  // vC14 Task B: cylinder_type is the real populated text column. The EF writes
  // the display name (e.g. "Refill", "New Cylinder") at order creation.
  cylinder_type: string | null;
  // vC17: quantity is a real column on orders (the EF accepts quantity 1–10).
  quantity: number | null;
  order_type: string;
  total_amount: number;
  gas_subtotal: number;
  cylinder_subtotal: number;
  delivery_fee: number;
  // vC12 #3: orders.address (text, NOT NULL) is the only address column.
  address: string;
  payment_method: string;
  status: string;
  // supplier_id IS NOT NULL → tracker Step 2. Verified column, verified reachable
  // through select('*') under the orders_select_own_customer RLS policy.
  supplier_id: string | null;
  // NS-2: bundle_id marks orders placed from an equipment bundle (New Set).
  // The EF writes it at creation when bundleId is sent in the payload.
  bundle_id: string | null;
  created_at: string;
  updated_at: string;
}

// vC13: brand name hydration. orders.brand_name is a real column but 0% filled
// in prod (the EF doesn't write it yet — Lane 2 item 2). Until then, we look up
// the display name from the catalog-list cache so order cards show "Parami",
// "Easy", "Any Brands" etc. instead of blank. Falls back gracefully.
const BRAND_NAME_CACHE = new Map<string, string>();
// NS-2: bundle name cache — orders has no bundle_name column, so we hydrate
// the display name from the equipment_bundles showcase cache.
const BUNDLE_NAME_CACHE = new Map<string, string>();

async function hydrateBrandNameCache(): Promise<void> {
  if (BRAND_NAME_CACHE.size > 0) return;
  try {
    const catalog = await fetchCatalog();
    for (const entry of catalog) {
      BRAND_NAME_CACHE.set(entry.brand.id, displayBrandName(entry.brand.name));
    }
  } catch (e) {
    devLog('[Orders] Brand name hydration failed:', e);
  }
}

// NS-2: hydrate bundle names so order cards/tracking show the package name.
async function hydrateBundleNameCache(): Promise<void> {
  if (BUNDLE_NAME_CACHE.size > 0) return;
  try {
    const bundles = await fetchEquipmentBundles();
    for (const b of bundles) {
      BUNDLE_NAME_CACHE.set(b.id, b.name);
    }
  } catch (e) {
    devLog('[Orders] Bundle name hydration failed:', e);
  }
}

function mapSupabaseOrderToOrder(o: SupabaseOrderRow): Order {
  return {
    id: o.id,
    userId: o.customer_id,
    brandId: o.brand_id,
    // Hydrated from catalog cache (orders.brand_name is 0% filled in prod).
    brandName: BRAND_NAME_CACHE.get(o.brand_id) || undefined,
    cylinderSize: o.cylinder_size,
    // vC14 Task B: cylinder_type is the real populated text column.
    cylinderType: o.cylinder_type ?? undefined,
    // vC17: quantity from the real column; default to 1 for legacy rows.
    quantity: o.quantity ?? 1,
    orderType: o.order_type as Order['orderType'],
    pricing: {
      gasPrice: o.gas_subtotal || 0,
      cylinderPrice: o.cylinder_subtotal || 0,
      deliveryFee: o.delivery_fee || 0,
      total: o.total_amount || 0,
    },
    address: {
      id: '',
      label: '',
      // vC12 #3: read from the real orders.address column (text, NOT NULL).
      address: o.address || '',
      latitude: 0,
      longitude: 0,
      isDefault: false,
    },
    paymentMethod: o.payment_method as Order['paymentMethod'],
    status: o.status as Order['status'],
    // supplier_id IS NOT NULL → supplier assigned (Step 2 of 4-stage tracker).
    supplierAssigned: !!o.supplier_id,
    // vC13: cylinder_type removed — ghost column. cylinder_type (real) mapped above.
    // NS-2: bundle_id → bundleName hydration from the showcase cache.
    bundleId: o.bundle_id ?? null,
    bundleName: o.bundle_id ? (BUNDLE_NAME_CACHE.get(o.bundle_id) || null) : null,
    createdAt: o.created_at,
    updatedAt: o.updated_at,
  };
}

export const [OrderProvider, useOrders] = createContextHook(() => {
  const queryClient = useQueryClient();
  const { customerId, session } = useAuth();
  const [orders, setOrders] = useState<Order[]>([]);
  const [activeOrderId, setActiveOrderId] = useState<string | null>(null);

  const ordersQuery = useQuery({
    queryKey: ['orders', customerId],
    queryFn: async () => {
      if (!customerId) return [];
      const storageKey = ordersStorageKey(customerId);
      await AsyncStorage.removeItem(ORDERS_KEY_PREFIX);
      devLog('[Orders] Fetching orders for customer:', customerId);
      const { data, error } = await supabase
        .from('orders')
        .select('*')
        .eq('customer_id', customerId)
        .order('created_at', { ascending: false });

      if (error) {
        devLog('[Orders] Fetch error, falling back to local:', error.message);
        const stored = await AsyncStorage.getItem(storageKey);
        return stored ? JSON.parse(stored) as Order[] : [];
      }

      if (data) {
        // vC13: hydrate brand name cache before mapping so order cards show
        // the display name (orders.brand_name is 0% filled in prod).
        await hydrateBrandNameCache();
        // NS-2: hydrate bundle names so bundle orders show the package name.
        await hydrateBundleNameCache();
        const mapped: Order[] = (data as SupabaseOrderRow[]).map(mapSupabaseOrderToOrder);
        devLog('[Orders] Fetched orders from Supabase:', mapped.length);
        await AsyncStorage.setItem(storageKey, JSON.stringify(mapped));
        return mapped;
      }

      const stored = await AsyncStorage.getItem(storageKey);
      return stored ? JSON.parse(stored) as Order[] : [];
    },
    enabled: !!customerId,
    refetchInterval: 10000,
  });

  useEffect(() => {
    if (ordersQuery.data) {
      setOrders(ordersQuery.data);
    }
  }, [ordersQuery.data]);

  useEffect(() => {
    if (!customerId) {
      setOrders([]);
      setActiveOrderId(null);
    }
  }, [customerId]);

  const placeOrder = useCallback(async (orderParams: {
    brandId: string;
    brandName?: string;
    cylinderTypeId?: string;
    cylinderDisplayName?: string;
    cylinderSize: number;
    orderType: string;
    quantity: number;
    paymentMethod: string;
    deliveryFee: number;
    totalAmount: number;
    address: Order['address'];
    pricing: Order['pricing'];
  }): Promise<Order> => {
    devLog('[Orders] Placing order via Edge Function for customer:', customerId);

    const accessToken = session?.access_token;
    if (!accessToken) {
      throw new Error('Not authenticated. Please log in again.');
    }

    const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL!;
    const edgeFunctionUrl = `${supabaseUrl}/functions/v1/create-customer-order`;

    // Server v45 contract accepts: 'refill' | 'new' | 'exchange' | 'service_call'.
    // Send exchange/service_call verbatim — mapping them to 'refill' makes the server
    // charge the refill delivery fee (6000/3000) instead of 0.
    const serverOrderType = orderParams.orderType === 'new_setup' ? 'new' : orderParams.orderType;

    devLog('[Orders] Calling Edge Function:', edgeFunctionUrl);
    const response = await fetch(edgeFunctionUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${accessToken}`,
      },
      body: JSON.stringify({
        brandId: orderParams.brandId,
        cylinderType: orderParams.cylinderDisplayName,
        sizeKg: orderParams.cylinderSize,
        orderType: serverOrderType,
        quantity: orderParams.quantity,
        clientTotal: orderParams.totalAmount,
        deliveryInstructions: null,
      }),
    });

    const result = await response.json();
    devLog('[Orders] Edge Function response status:', response.status, 'result:', JSON.stringify(result));

    if (!response.ok) {
      // 409 = server recomputed total differs from clientTotal by >1% (price changed mid-flow).
      // Surface a clear retry message instead of a generic failure.
      if (response.status === 409) {
        const serverTotal = result?.server_total ?? result?.expected_total;
        const msg = serverTotal != null
          ? `Price changed (server total ${Math.round(serverTotal).toLocaleString()} MMK). Please review and try again.`
          : 'Price changed since you opened the order. Please review and try again.';
        devLog('[Orders] 409 price mismatch:', JSON.stringify(result));
        throw new Error(msg);
      }
      const errorMsg = result?.error || result?.message || 'Failed to place order';
      devLog('[Orders] Edge Function error:', errorMsg);
      throw new Error(errorMsg);
    }

    const createdOrder = result.order || result;
    devLog('[Orders] Edge Function success, order ID:', createdOrder?.id);

    const newOrder: Order = {
      id: createdOrder.id || `ord_${Date.now()}`,
      userId: customerId || '',
      brandId: orderParams.brandId,
      brandName: orderParams.brandName,
      cylinderSize: orderParams.cylinderSize,
      // vC14 Task B: store the display name from the order params (cylinder_type
      // is the real column the EF writes at creation).
      cylinderType: orderParams.cylinderDisplayName ?? undefined,
      // vC17: persist quantity so order cards/tracking can display it.
      quantity: orderParams.quantity,
      orderType: orderParams.orderType as Order['orderType'],
      pricing: orderParams.pricing,
      address: orderParams.address,
      paymentMethod: orderParams.paymentMethod as Order['paymentMethod'],
      status: createdOrder.status || 'new',
      createdAt: createdOrder.created_at || new Date().toISOString(),
      updatedAt: createdOrder.updated_at || new Date().toISOString(),
      // vC13: no estimatedDelivery — no eta column exists on orders (bounded-
      // negative). The tracker shows honest stage-based ranges instead.
    };

    setOrders(prev => [newOrder, ...prev]);
    setActiveOrderId(newOrder.id);
    queryClient.invalidateQueries({ queryKey: ['orders'] });

    return newOrder;
  }, [customerId, session, queryClient]);

  // NS-2: place a bundle order (New Set). The EF v47 accepts an optional
  // bundleId and prices the order from bundle_price server-side. We send ONLY
  // {bundleId, clientTotal: bundle.bundle_price, orderType, quantity, paymentMethod} —
  // the server derives brand/cylinder/size from the bundle. No client-side price
  // computation as the charge amount; bundle_price is authoritative.
  const placeBundleOrder = useCallback(async (bundleParams: {
    bundleId: string;
    bundleName: string;
    bundlePrice: number;
    paymentMethod: string;
    address: Order['address'];
  }): Promise<Order> => {
    devLog('[Orders] Placing BUNDLE order for bundle:', bundleParams.bundleId);
    const accessToken = session?.access_token;
    if (!accessToken) {
      throw new Error('Not authenticated. Please log in again.');
    }
    const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL!;
    const edgeFunctionUrl = `${supabaseUrl}/functions/v1/create-customer-order`;
    const response = await fetch(edgeFunctionUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${accessToken}`,
      },
      body: JSON.stringify({
        bundleId: bundleParams.bundleId,
        clientTotal: bundleParams.bundlePrice,
        orderType: 'new',
        quantity: 1,
        paymentMethod: bundleParams.paymentMethod,
      }),
    });
    const result = await response.json();
    devLog('[Orders] Bundle EF response status:', response.status, 'result:', JSON.stringify(result));
    if (!response.ok) {
      // bundle_not_available (400) — promotion ended mid-flow.
      if (response.status === 400 && (result?.error?.includes?.('bundle') || result?.error?.includes?.('unavailable') || result?.error?.includes?.('not available'))) {
        throw new Error('bundle_not_available');
      }
      if (response.status === 409) {
        const serverTotal = result?.server_total ?? result?.expected_total;
        const msg = serverTotal != null
          ? `Price changed (server total ${Math.round(serverTotal).toLocaleString()} MMK). Please review and try again.`
          : 'Price changed since you opened the order. Please review and try again.';
        throw new Error(msg);
      }
      const errorMsg = result?.error || result?.message || 'Failed to place order';
      throw new Error(errorMsg);
    }
    const createdOrder = result.order || result;
    const newOrder: Order = {
      id: createdOrder.id || `ord_${Date.now()}`,
      userId: customerId || '',
      brandId: createdOrder.brand_id || '',
      brandName: createdOrder.brand_name || undefined,
      cylinderSize: createdOrder.cylinder_size || 0,
      cylinderType: createdOrder.cylinder_type ?? undefined,
      quantity: createdOrder.quantity ?? 1,
      orderType: 'new_setup',
      pricing: {
        gasPrice: createdOrder.gas_subtotal || 0,
        cylinderPrice: createdOrder.cylinder_subtotal || 0,
        deliveryFee: createdOrder.delivery_fee || 0,
        total: createdOrder.total_amount || bundleParams.bundlePrice,
      },
      address: bundleParams.address,
      paymentMethod: bundleParams.paymentMethod as Order['paymentMethod'],
      status: createdOrder.status || 'new',
      bundleId: bundleParams.bundleId,
      bundleName: bundleParams.bundleName,
      createdAt: createdOrder.created_at || new Date().toISOString(),
      updatedAt: createdOrder.updated_at || new Date().toISOString(),
    };
    setOrders(prev => [newOrder, ...prev]);
    setActiveOrderId(newOrder.id);
    queryClient.invalidateQueries({ queryKey: ['orders'] });
    return newOrder;
  }, [customerId, session, queryClient]);

  // vC13: updateOrderStatus deleted. RLS-proven: there is no customer UPDATE
  // policy on orders (orders_select_own_customer is SELECT-only). The previous
  // implementation fired a fromUpdate('orders', { status }) that silently bounced
  // on every call. Customer-side status changes are not permitted by design —
  // status transitions are owned by the agent/CRM flows. The client reads only.

  const getLastOrder = useCallback(() => {
    return orders[0] || null;
  }, [orders]);

  // vC17 r2: memory shortcut — the "Your usual" card uses the last DELIVERED
  // order (a completed refill the customer is likely to repeat). Falls back to
  // the most recent order if none delivered yet, so first-time customers still
  // get a prefill once they have any order history.
  const getLastDeliveredOrder = useCallback(() => {
    const delivered = orders.find(o => o.status === 'delivered');
    return delivered || orders[0] || null;
  }, [orders]);

  const getActiveOrder = useCallback(() => {
    // 4-stage contract: active = not yet delivered and not in a terminal state.
    // 'dispatched' is retained for backward-compat but is a dead stage in prod data.
    return orders.find(o => ['new', 'in_progress', 'confirmed', 'dispatched'].includes(o.status)) || null;
  }, [orders]);

  return {
    orders,
    activeOrderId,
    setActiveOrderId,
    placeOrder,
    placeBundleOrder,
    getLastOrder,
    getLastDeliveredOrder,
    getActiveOrder,
    isLoadingOrders: ordersQuery.isLoading,
  };
});
