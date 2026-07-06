import React, { useState, useEffect, useCallback } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import createContextHook from '@nkzw/create-context-hook';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase, SupabaseSession, SupabaseUser } from '@/lib/supabase';
import { Customer, CustomerLinkingState, SavedAddress } from '@/types';

const ACTIVE_CUSTOMER_KEY = 'anygas_active_customer';
const ADDRESSES_KEY = 'anygas_addresses';

function authPhoneToLocalPhone(authPhone: string): string {
  let cleaned = authPhone.replace(/\s/g, '');
  if (cleaned.startsWith('+')) {
    cleaned = cleaned.substring(1);
  }
  if (cleaned.startsWith('95') && !cleaned.startsWith('0')) {
    cleaned = cleaned.substring(2);
  }
  if (!cleaned.startsWith('0')) {
    cleaned = '0' + cleaned;
  }
  console.log('[Auth] Phone conversion:', authPhone, '->', cleaned);
  return cleaned;
}

export const [AuthProvider, useAuth] = createContextHook(() => {
  const queryClient = useQueryClient();
  const [session, setSession] = useState<SupabaseSession | null>(null);
  const [user, setUser] = useState<SupabaseUser | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [activeCustomer, setActiveCustomer] = useState<Customer | null>(null);
  const [matchedCustomers, setMatchedCustomers] = useState<Customer[]>([]);
  const [linkingState, setLinkingState] = useState<CustomerLinkingState>('idle');
  const [savedAddresses, setSavedAddresses] = useState<SavedAddress[]>([]);

  const isAuthenticated = !!session;
  const phoneNumber = user?.phone || '';
  const customerId = activeCustomer?.id ?? null;

  useEffect(() => {
    console.log('[Auth] Initializing Supabase auth listener');
    supabase.auth.getSession().then(({ data: { session: currentSession } }) => {
      console.log('[Auth] Got session:', currentSession ? 'yes' : 'no');
      setSession(currentSession);
      setUser(currentSession?.user ?? null);
      setIsLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, newSession) => {
      console.log('[Auth] Auth state changed:', _event);
      setSession(newSession);
      setUser(newSession?.user ?? null);
    });

    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (user?.id && !activeCustomer) {
      AsyncStorage.getItem(ACTIVE_CUSTOMER_KEY).then((stored) => {
        if (stored) {
          try {
            const parsed = JSON.parse(stored) as Customer;
            console.log('[Auth] Restored active customer from storage:', parsed.id, parsed.name);
            setActiveCustomer(parsed);
            setLinkingState('linked');
          } catch {
            console.log('[Auth] Failed to parse stored customer');
          }
        }
      });
    }
  }, [user?.id]);

  const addressesQuery = useQuery({
    queryKey: ['addresses', customerId],
    queryFn: async () => {
      if (!customerId) return [];
      console.log('[Auth] Fetching customer_addresses for customer:', customerId);
      const { data, error } = await supabase
        .from('customer_addresses')
        .select('*')
        .eq('customer_id', customerId)
        .order('created_at', { ascending: true });

      if (error) {
        console.log('[Auth] Addresses fetch error, falling back to local:', error.message);
        const stored = await AsyncStorage.getItem(ADDRESSES_KEY);
        return stored ? JSON.parse(stored) as SavedAddress[] : [];
      }

      if (data && data.length > 0) {
        const mapped: SavedAddress[] = (data as Record<string, unknown>[]).map((a) => ({
          id: a.id as string,
          label: (a.label as string) || '',
          address: (a.address as string) || '',
          latitude: (a.latitude as number) || 0,
          longitude: (a.longitude as number) || 0,
          isDefault: (a.is_default as boolean) || false,
        }));
        console.log('[Auth] Fetched customer_addresses from Supabase:', mapped.length);
        await AsyncStorage.setItem(ADDRESSES_KEY, JSON.stringify(mapped));
        return mapped;
      }

      const stored = await AsyncStorage.getItem(ADDRESSES_KEY);
      return stored ? JSON.parse(stored) as SavedAddress[] : [];
    },
    enabled: !!customerId,
  });

  useEffect(() => {
    if (addressesQuery.data) {
      setSavedAddresses(addressesQuery.data);
    }
  }, [addressesQuery.data]);

  const findCustomersByPhone = useCallback(async (authPhone: string, authUserId: string): Promise<Customer[]> => {
    const localPhone = authPhoneToLocalPhone(authPhone);
    console.log('[Auth] Looking up customers via Edge Function for phone:', localPhone);

    const { data, error } = await supabase.functions.invoke('link-customer-account', {
      body: {
        phone: localPhone,
        auth_user_id: authUserId,
        action: 'lookup',
      },
    });

    if (error) {
      console.log('[Auth] Edge Function lookup error:', error.message);
      return [];
    }

    const responseData = data as { customers?: Record<string, unknown>[] } | null;
    if (!responseData?.customers || responseData.customers.length === 0) {
      console.log('[Auth] No customers found for phone:', localPhone);
      return [];
    }

    const customers: Customer[] = responseData.customers.map((c: Record<string, unknown>) => ({
      id: c.id as string,
      name: (c.name as string) || (c.full_name as string) || '',
      full_name: (c.full_name as string) || (c.name as string) || '',
      phone: (c.phone as string) || '',
      secondary_phone: (c.secondary_phone as string | null) ?? null,
      township: (c.township as string | null) ?? null,
      address: (c.address as string | null) ?? null,
      auth_user_id: (c.auth_user_id as string | null) ?? null,
      created_at: (c.created_at as string) || '',
      updated_at: (c.updated_at as string) || '',
    }));

    console.log('[Auth] Found', customers.length, 'customer(s) for phone:', localPhone);
    return customers;
  }, []);

  const linkCustomer = useCallback(async (customer: Customer, authUserId: string) => {
    console.log('[Auth] Linking customer:', customer.id, 'to auth user:', authUserId);

    if (!customer.auth_user_id || customer.auth_user_id !== authUserId) {
      const { error } = await supabase.functions.invoke('link-customer-account', {
        body: {
          phone: customer.phone,
          auth_user_id: authUserId,
          action: 'link',
          customer_id: customer.id,
        },
      });

      if (error) {
        console.log('[Auth] Edge Function link error (non-critical):', error.message);
      } else {
        console.log('[Auth] Customer auth_user_id updated via Edge Function');
      }
    }

    setActiveCustomer({ ...customer, auth_user_id: authUserId });
    setLinkingState('linked');
    await AsyncStorage.setItem(ACTIVE_CUSTOMER_KEY, JSON.stringify({ ...customer, auth_user_id: authUserId }));
    queryClient.invalidateQueries({ queryKey: ['addresses'] });
    queryClient.invalidateQueries({ queryKey: ['orders'] });
  }, [queryClient]);

  const selectCustomer = useCallback(async (customerId: string) => {
    const customer = matchedCustomers.find(c => c.id === customerId);
    if (!customer || !user?.id) {
      console.log('[Auth] selectCustomer: customer not found or no user');
      return;
    }
    await linkCustomer(customer, user.id);
  }, [matchedCustomers, user?.id, linkCustomer]);

  const sendOtp = useCallback(async (phone: string) => {
    const stripped = phone.replace(/\s/g, '').replace(/^0+/, '');
    const formattedPhone = stripped.startsWith('+') ? stripped : `+95${stripped}`;
    console.log('[Auth] Sending OTP to:', formattedPhone);
    const { error } = await supabase.auth.signInWithOtp({ phone: formattedPhone });
    if (error) {
      console.log('[Auth] OTP send error:', error.message);
      throw new Error(error.message);
    }
    console.log('[Auth] OTP sent successfully');
  }, []);

  const verifyOtp = useCallback(async (phone: string, token: string) => {
    const stripped = phone.replace(/\s/g, '').replace(/^0+/, '');
    const formattedPhone = stripped.startsWith('+') ? stripped : `+95${stripped}`;
    console.log('[Auth] Verifying OTP for:', formattedPhone);
    const { data, error } = await supabase.auth.verifyOtp({
      phone: formattedPhone,
      token,
      type: 'sms',
    });
    if (error) {
      console.log('[Auth] OTP verify error:', error.message);
      throw new Error(error.message);
    }
    console.log('[Auth] OTP verified, session:', data.session ? 'yes' : 'no');

    if (data.user) {
      setLinkingState('checking');
      const customers = await findCustomersByPhone(formattedPhone, data.user.id);

      if (customers.length === 1) {
        console.log('[Auth] Single customer match, auto-linking:', customers[0].name);
        await linkCustomer(customers[0], data.user.id);
        return { ...data, linkingState: 'linked' as const };
      } else if (customers.length > 1) {
        console.log('[Auth] Multiple customer matches:', customers.length);
        setMatchedCustomers(customers);
        setLinkingState('select_profile');
        return { ...data, linkingState: 'select_profile' as const };
      } else {
        console.log('[Auth] No customer match, need registration');
        setLinkingState('register_new');
        return { ...data, linkingState: 'register_new' as const };
      }
    }

    return { ...data, linkingState: 'idle' as const };
  }, [findCustomersByPhone, linkCustomer]);

  const registerNewCustomer = useCallback(async (customerData: {
    name: string;
    phone: string;
    township: string;
    address: string;
  }) => {
    if (!user?.id) {
      console.log('[Auth] registerNewCustomer: no auth user');
      throw new Error('Not authenticated');
    }

    const localPhone = customerData.phone.startsWith('0')
      ? customerData.phone
      : '0' + customerData.phone.replace(/^\+95/, '');

    console.log('[Auth] Registering new customer via Edge Function:', customerData.name);

    const { data, error } = await supabase.functions.invoke('register-customer', {
      body: {
        full_name: customerData.name,
        township: customerData.township,
        address: customerData.address,
      },
    });

    if (error) {
      console.log('[Auth] Edge Function register error:', error.message);
      throw new Error(error.message || 'Registration failed');
    }

    const responseData = data as { ok?: boolean; customer?: Record<string, unknown> } | null;
    if (!responseData?.ok || !responseData?.customer) {
      console.log('[Auth] Edge Function returned no customer data:', JSON.stringify(data));
      throw new Error('Registration failed — no customer data returned');
    }

    const c = responseData.customer;
    const newCustomer: Customer = {
      id: c.id as string,
      name: (c.name as string) || (c.full_name as string) || customerData.name,
      full_name: (c.full_name as string) || (c.name as string) || customerData.name,
      phone: (c.phone as string) || localPhone,
      secondary_phone: (c.secondary_phone as string | null) ?? null,
      township: (c.township as string | null) ?? customerData.township,
      address: (c.address as string | null) ?? customerData.address,
      auth_user_id: user.id,
      created_at: (c.created_at as string) || new Date().toISOString(),
      updated_at: (c.updated_at as string) || new Date().toISOString(),
    };

    console.log('[Auth] New customer created via Edge Function:', newCustomer.id);
    setActiveCustomer(newCustomer);
    setLinkingState('linked');
    await AsyncStorage.setItem(ACTIVE_CUSTOMER_KEY, JSON.stringify(newCustomer));
    queryClient.invalidateQueries({ queryKey: ['addresses'] });
    queryClient.invalidateQueries({ queryKey: ['orders'] });

    return newCustomer;
  }, [user?.id, queryClient]);

  const logout = useCallback(async () => {
    console.log('[Auth] Logging out');
    const { error } = await supabase.auth.signOut();
    if (error) {
      console.log('[Auth] Sign out error:', error.message);
    }
    setSession(null);
    setUser(null);
    setActiveCustomer(null);
    setMatchedCustomers([]);
    setLinkingState('idle');
    setSavedAddresses([]);
    await AsyncStorage.removeItem(ACTIVE_CUSTOMER_KEY);
    await AsyncStorage.removeItem(ADDRESSES_KEY);
    queryClient.clear();
  }, [queryClient]);

  const addAddress = useCallback(async (address: Omit<SavedAddress, 'id'>) => {
    const newAddress: SavedAddress = { ...address, id: `addr_${Date.now()}` };

    if (customerId) {
      console.log('[Auth] Adding address to customer_addresses:', address.label);
      const { error } = await supabase.fromInsert('customer_addresses', {
        id: newAddress.id,
        customer_id: customerId,
        label: address.label,
        address: address.address,
        latitude: address.latitude,
        longitude: address.longitude,
        is_default: address.isDefault,
      });
      if (error) {
        console.log('[Auth] Address insert error:', error.message);
      }
      queryClient.invalidateQueries({ queryKey: ['addresses'] });
    }

    const updated = [...savedAddresses, newAddress];
    setSavedAddresses(updated);
    await AsyncStorage.setItem(ADDRESSES_KEY, JSON.stringify(updated));
    return newAddress;
  }, [savedAddresses, customerId, queryClient]);

  const getDefaultAddress = useCallback(() => {
    return savedAddresses.find(a => a.isDefault) || savedAddresses[0] || null;
  }, [savedAddresses]);

  // vC13 Task B: save delivery address + township to the customer's own row.
  // Uses customers_update_own_profile RLS (auth_user_id = auth.uid()), verified
  // in prod. Updates ONLY address + township columns — nothing else.
  const updateCustomerAddress = useCallback(async (address: string, township: string) => {
    if (!activeCustomer) {
      throw new Error('No active customer — cannot update address');
    }
    console.log('[Auth] Updating address for customer:', activeCustomer.id);
    const { error } = await supabase
      .fromUpdate('customers', { address, township })
      .eq('id', activeCustomer.id);

    if (error) {
      console.log('[Auth] Address update error:', error.message);
      throw new Error(error.message);
    }

    const updated: Customer = { ...activeCustomer, address, township };
    setActiveCustomer(updated);
    await AsyncStorage.setItem(ACTIVE_CUSTOMER_KEY, JSON.stringify(updated));
    queryClient.invalidateQueries({ queryKey: ['orders'] });
    console.log('[Auth] Address updated successfully');
  }, [activeCustomer, queryClient]);

  const activeProfile = activeCustomer ? {
    id: activeCustomer.id,
    phoneNumber: activeCustomer.phone,
    name: activeCustomer.name,
    isDefault: true,
  } : null;

  return {
    isAuthenticated,
    isLoading,
    phoneNumber,
    activeProfile,
    activeCustomer,
    customerId,
    matchedCustomers,
    linkingState,
    savedAddresses,
    session,
    user,
    sendOtp,
    verifyOtp,
    logout,
    selectCustomer,
    registerNewCustomer,
    addAddress,
    getDefaultAddress,
    updateCustomerAddress,
  };
});
