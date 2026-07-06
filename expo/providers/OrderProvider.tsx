import React, { useState, useCallback, useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import createContextHook from '@nkzw/create-context-hook';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { Order } from '@/types';
import { useAuth } from '@/providers/AuthProvider';
import { fetchCatalog, displayBrandName } from '@/lib/catalog';

const ORDERS_KEY = 'anygas_orders';


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
  created_at: string;
  updated_at: string;
}

// vC13: brand name hydration. orders.brand_name is a real column but 0% filled
// in prod (the EF doesn't write it yet — Lane 2 item 2). Until then, we look up
// the display name from the catalog-list cache so order cards show "Parami",
// "Easy", "Any Brands" etc. instead of blank. Falls back gracefully.
const BRAND_NAME_CACHE = new Map<string, string>();

async function hydrateBrandNameCache(): Promise<void> {
  if (BRAND_NAME_CACHE.size > 0) return;
  try {
    const catalog = await fetchCatalog();
    for (const entry of catalog) {
      BRAND_NAME_CACHE.set(entry.brand.id, displayBrandName(entry.brand.name));
    }
  } catch (e) {
    console.log('[Orders] Brand name hydration failed:', e);
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
    createdAt: o.created_at,
    updatedAt: o.updated_at,
  };
}

export const [OrderProvider, useOrders] = createContextHook(() => {
  const queryClient = useQueryClient();
  const { customerId, session } = useAuth();
  const [orders, setOrders] = useState<Order[]>([]);
  const notifications: never[] = [];
  const [activeOrderId, setActiveOrderId] = useState<string | null>(null);

  const ordersQuery = useQuery({
    queryKey: ['orders', customerId],
    queryFn: async () => {
      if (!customerId) return [];
      console.log('[Orders] Fetching orders for customer:', customerId);
      const { data, error } = await supabase
        .from('orders')
        .select('*')
        .eq('customer_id', customerId)
        .order('created_at', { ascending: false });

      if (error) {
        console.log('[Orders] Fetch error, falling back to local:', error.message);
        const stored = await AsyncStorage.getItem(ORDERS_KEY);
        return stored ? JSON.parse(stored) as Order[] : [];
      }

      if (data) {
        // vC13: hydrate brand name cache before mapping so order cards show
        // the display name (orders.brand_name is 0% filled in prod).
        await hydrateBrandNameCache();
        const mapped: Order[] = (data as SupabaseOrderRow[]).map(mapSupabaseOrderToOrder);
        console.log('[Orders] Fetched orders from Supabase:', mapped.length);
        await AsyncStorage.setItem(ORDERS_KEY, JSON.stringify(mapped));
        return mapped;
      }

      const stored = await AsyncStorage.getItem(ORDERS_KEY);
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
    console.log('[Orders] Placing order via Edge Function for customer:', customerId);

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

    console.log('[Orders] Calling Edge Function:', edgeFunctionUrl);
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
    console.log('[Orders] Edge Function response status:', response.status, 'result:', JSON.stringify(result));

    if (!response.ok) {
      // 409 = server recomputed total differs from clientTotal by >1% (price changed mid-flow).
      // Surface a clear retry message instead of a generic failure.
      if (response.status === 409) {
        const serverTotal = result?.server_total ?? result?.expected_total;
        const msg = serverTotal != null
          ? `Price changed (server total ${Math.round(serverTotal).toLocaleString()} MMK). Please review and try again.`
          : 'Price changed since you opened the order. Please review and try again.';
        console.log('[Orders] 409 price mismatch:', JSON.stringify(result));
        throw new Error(msg);
      }
      const errorMsg = result?.error || result?.message || 'Failed to place order';
      console.log('[Orders] Edge Function error:', errorMsg);
      throw new Error(errorMsg);
    }

    const createdOrder = result.order || result;
    console.log('[Orders] Edge Function success, order ID:', createdOrder?.id);

    const newOrder: Order = {
      id: createdOrder.id || `ord_${Date.now()}`,
      userId: customerId || '',
      brandId: orderParams.brandId,
      brandName: orderParams.brandName,
      cylinderSize: orderParams.cylinderSize,
      // vC14 Task B: store the display name from the order params (cylinder_type
      // is the real column the EF writes at creation).
      cylinderType: orderParams.cylinderDisplayName ?? undefined,
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

  // vC13: updateOrderStatus deleted. RLS-proven: there is no customer UPDATE
  // policy on orders (orders_select_own_customer is SELECT-only). The previous
  // implementation fired a fromUpdate('orders', { status }) that silently bounced
  // on every call. Customer-side status changes are not permitted by design —
  // status transitions are owned by the agent/CRM flows. The client reads only.

  // vC12 #2: UI-only, local pending state. The previous implementation wrote to
  // `orders.rating` / `orders.rating_comment` — columns that do NOT exist in prod
  // (verified via information_schema). The write silently failed (error logged,
  // swallowed) on every attempt, and `order_ratings` is at 0 rows. Until the A2
  // Grand Plan repoints this at `order_ratings` (with RLS review), we keep the
  // rating UI functional but perform NO server write. The rating is persisted
  // locally via AsyncStorage so the UI reflects the user's choice within the app.
  const rateOrder = useCallback(async (orderId: string, rating: number, comment?: string) => {
    console.log('[Orders] Rating order (UI-only, pending A2):', orderId, 'stars:', rating);
    const updated = orders.map(o =>
      o.id === orderId ? { ...o, rating, ratingComment: comment } : o
    );
    setOrders(updated);
    await AsyncStorage.setItem(ORDERS_KEY, JSON.stringify(updated));
    // Intentionally no `supabase.fromUpdate('orders', { rating, ... })` call —
    // those columns don't exist. A2 will write to `order_ratings` instead.
  }, [orders]);

  const getLastOrder = useCallback(() => {
    return orders[0] || null;
  }, [orders]);

  const getActiveOrder = useCallback(() => {
    // 4-stage contract: active = not yet delivered and not in a terminal state.
    // 'dispatched' is retained for backward-compat but is a dead stage in prod data.
    return orders.find(o => ['new', 'in_progress', 'confirmed', 'dispatched'].includes(o.status)) || null;
  }, [orders]);

  const markNotificationRead = useCallback(async (_id: string) => {
    console.log('[Orders] Notifications not yet available');
  }, []);

  const unreadCount = 0;

  return {
    orders,
    notifications,
    activeOrderId,
    setActiveOrderId,
    placeOrder,
    rateOrder,
    getLastOrder,
    getActiveOrder,
    markNotificationRead,
    unreadCount,
    isLoadingOrders: ordersQuery.isLoading,
  };
});
