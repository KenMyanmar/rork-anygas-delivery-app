import React, { useState, useCallback, useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import createContextHook from '@nkzw/create-context-hook';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { Order, DeliveryAgent } from '@/types';
import { useAuth } from '@/providers/AuthProvider';

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

interface SupabaseOrderRow {
  id: string;
  customer_id: string;
  brand_id: string;
  brand_name?: string;
  cylinder_size: number;
  cylinder_type_id: string | null;
  order_type: string;
  total_amount: number;
  gas_subtotal: number;
  cylinder_subtotal: number;
  delivery_fee: number;
  delivery_address_id: string | null;
  delivery_latitude: number | null;
  delivery_longitude: number | null;
  delivery_address_text: string | null;
  payment_method: string;
  status: string;
  assigned_agent_id: string | null;
  agent_name: string | null;
  agent_phone: string | null;
  agent_latitude: number | null;
  agent_longitude: number | null;
  rating: number | null;
  rating_comment: string | null;
  estimated_delivery: string | null;
  created_at: string;
  updated_at: string;
}

function mapSupabaseOrderToOrder(o: SupabaseOrderRow): Order {
  const agent: DeliveryAgent | undefined = o.assigned_agent_id
    ? {
        id: o.assigned_agent_id,
        name: o.agent_name || 'Agent',
        phone: o.agent_phone || '',
        latitude: o.agent_latitude || 0,
        longitude: o.agent_longitude || 0,
      }
    : undefined;

  return {
    id: o.id,
    userId: o.customer_id,
    brandId: o.brand_id,
    brandName: o.brand_name,
    cylinderSize: o.cylinder_size,
    cylinderTypeId: o.cylinder_type_id ?? undefined,
    orderType: o.order_type as Order['orderType'],
    pricing: {
      gasPrice: o.gas_subtotal || 0,
      cylinderPrice: o.cylinder_subtotal || 0,
      deliveryFee: o.delivery_fee || 0,
      total: o.total_amount || 0,
    },
    address: {
      id: o.delivery_address_id || '',
      label: '',
      address: o.delivery_address_text || '',
      latitude: o.delivery_latitude || 0,
      longitude: o.delivery_longitude || 0,
      isDefault: false,
    },
    paymentMethod: o.payment_method as Order['paymentMethod'],
    status: o.status as Order['status'],
    agent,
    rating: o.rating ?? undefined,
    ratingComment: o.rating_comment ?? undefined,
    createdAt: o.created_at,
    updatedAt: o.updated_at,
    estimatedDelivery: o.estimated_delivery ?? undefined,
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
      cylinderTypeId: orderParams.cylinderTypeId,
      orderType: orderParams.orderType as Order['orderType'],
      pricing: orderParams.pricing,
      address: orderParams.address,
      paymentMethod: orderParams.paymentMethod as Order['paymentMethod'],
      status: createdOrder.status || 'new',
      createdAt: createdOrder.created_at || new Date().toISOString(),
      updatedAt: createdOrder.updated_at || new Date().toISOString(),
      estimatedDelivery: createdOrder.estimated_delivery || '45 min',
    };

    setOrders(prev => [newOrder, ...prev]);
    setActiveOrderId(newOrder.id);
    queryClient.invalidateQueries({ queryKey: ['orders'] });

    return newOrder;
  }, [customerId, session, queryClient]);

  const updateOrderStatus = useCallback((orderId: string, status: Order['status']) => {
    console.log('[Orders] Updating order status:', orderId, '->', status);
    setOrders(prev => {
      const updated = prev.map(o =>
        o.id === orderId ? { ...o, status, updatedAt: new Date().toISOString() } : o
      );
      AsyncStorage.setItem(ORDERS_KEY, JSON.stringify(updated));
      return updated;
    });

    if (customerId) {
      supabase
        .fromUpdate('orders', { status, updated_at: new Date().toISOString() })
        .eq('id', orderId);
    }
  }, [customerId]);

  const rateOrder = useCallback(async (orderId: string, rating: number, comment?: string) => {
    console.log('[Orders] Rating order:', orderId, 'stars:', rating);
    const updated = orders.map(o =>
      o.id === orderId ? { ...o, rating, ratingComment: comment } : o
    );
    setOrders(updated);
    await AsyncStorage.setItem(ORDERS_KEY, JSON.stringify(updated));

    if (customerId) {
      const { error } = await supabase
        .fromUpdate('orders', {
          rating,
          rating_comment: comment ?? null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', orderId);

      if (error) {
        console.log('[Orders] Rating update error:', error.message);
      }
      queryClient.invalidateQueries({ queryKey: ['orders'] });
    }
  }, [orders, customerId, queryClient]);

  const getLastOrder = useCallback(() => {
    return orders[0] || null;
  }, [orders]);

  const getActiveOrder = useCallback(() => {
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
    updateOrderStatus,
    rateOrder,
    getLastOrder,
    getActiveOrder,
    markNotificationRead,
    unreadCount,
    isLoadingOrders: ordersQuery.isLoading,
  };
});
