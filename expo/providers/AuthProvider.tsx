import React, { useState, useEffect, useCallback } from 'react';
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import createContextHook from '@nkzw/create-context-hook';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase, SupabaseSession, SupabaseUser } from '@/lib/supabase';
import { devLog } from '@/lib/logger';
import { Customer, CustomerLinkingState, SavedAddress, ParkedAccount } from '@/types';
import { usePinLock } from '@/providers/PinLockProvider';

const ACTIVE_CUSTOMER_KEY = 'anygas_active_customer';
const ADDRESSES_KEY = 'anygas_addresses';
const LAST_PHONE_KEY = 'anygas_last_phone'; // vC15 Task B: welcome-back prefill (display format, not a secret)
const PARKED_SESSION_KEY = 'anygas_parked_session'; // vC16 Task A: soft sign-out session (SecureStore)
const PARKED_ACCOUNT_KEY = 'anygas_parked_account'; // vC16 Task A: parked account metadata (SecureStore)
const PARKED_CUSTOMER_KEY = 'anygas_parked_customer';
const ORDERS_KEY_PREFIX = 'anygas_orders';

async function clearCustomerOrderCache(customerId: string | null): Promise<void> {
  await AsyncStorage.removeItem(ORDERS_KEY_PREFIX);
  if (customerId) {
    await AsyncStorage.removeItem(`${ORDERS_KEY_PREFIX}:${customerId}`);
  }
}

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
  devLog('[Auth] Phone conversion:', authPhone, '->', cleaned);
  return cleaned;
}

export const [AuthProvider, useAuth] = createContextHook(() => {
  const queryClient = useQueryClient();
  const { clearPinOnSignOut, recheckPin } = usePinLock();
  // vC16 Task A: parked account state — when a soft sign-out happens, the
  // session moves to SecureStore and we track a parked account so the account
  // tile overlay can show "Continue as 095119900".
  const [parkedAccount, setParkedAccount] = useState<ParkedAccount | null>(null);
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
    devLog('[Auth] Initializing Supabase auth listener');
    const sessionRestore = supabase.auth.getSession().then(({ data: { session: currentSession } }) => {
      devLog('[Auth] Got session:', currentSession ? 'yes' : 'no');
      setSession(currentSession);
      setUser(currentSession?.user ?? null);
    });

    // vC16 Task A: check for a parked account (from a previous soft sign-out).
    // The session is in SecureStore; the account metadata tells us the phone.
    // We load it so the account tile overlay can render — but we do NOT restore
    // the session until PIN is entered.
    const parkedAccountRestore = Platform.OS !== 'web'
      ? SecureStore.getItemAsync(PARKED_ACCOUNT_KEY).then((stored) => {
        if (stored) {
          try {
            const parsed = JSON.parse(stored) as ParkedAccount;
            devLog('[Auth] Found parked account:', parsed.phone);
            setParkedAccount(parsed);
          } catch {}
        }
      }).catch(() => {})
      : Promise.resolve();

    // Auth routing must wait for both sources. Otherwise a parked account can
    // briefly fall through to the OTP screen, or protected tabs can mount
    // before the app knows that no live session exists.
    Promise.allSettled([sessionRestore, parkedAccountRestore]).then(() => {
      setIsLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, newSession) => {
      devLog('[Auth] Auth state changed:', _event);
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
            devLog('[Auth] Restored active customer from storage:', parsed.id, parsed.name);
            setActiveCustomer(parsed);
            setLinkingState('linked');
          } catch {
            devLog('[Auth] Failed to parse stored customer');
          }
        }
      });
    }
  }, [user?.id]);

  const addressesQuery = useQuery({
    queryKey: ['addresses', customerId],
    queryFn: async () => {
      if (!customerId) return [];
      devLog('[Auth] Fetching customer_addresses for customer:', customerId);
      const { data, error } = await supabase
        .from('customer_addresses')
        .select('*')
        .eq('customer_id', customerId)
        .order('created_at', { ascending: true });

      if (error) {
        devLog('[Auth] Addresses fetch error, falling back to local:', error.message);
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
        devLog('[Auth] Fetched customer_addresses from Supabase:', mapped.length);
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
    devLog('[Auth] Looking up customers via Edge Function for phone:', localPhone);

    const { data, error } = await supabase.functions.invoke('link-customer-account', {
      body: {
        phone: localPhone,
        auth_user_id: authUserId,
        action: 'lookup',
      },
    });

    if (error) {
      devLog('[Auth] Edge Function lookup error:', error.message);
      return [];
    }

    const responseData = data as { customers?: Record<string, unknown>[] } | null;
    if (!responseData?.customers || responseData.customers.length === 0) {
      devLog('[Auth] No customers found for phone:', localPhone);
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
      // vC16 Task B: landmark + GPS for the address experience
      landmark: (c.landmark as string | null) ?? null,
      gps_lat: (c.gps_lat as number | null) ?? null,
      gps_lng: (c.gps_lng as number | null) ?? null,
      auth_user_id: (c.auth_user_id as string | null) ?? null,
      created_at: (c.created_at as string) || '',
      updated_at: (c.updated_at as string) || '',
    }));

    devLog('[Auth] Found', customers.length, 'customer(s) for phone:', localPhone);
    return customers;
  }, []);

  const linkCustomer = useCallback(async (customer: Customer, authUserId: string) => {
    devLog('[Auth] Linking customer:', customer.id, 'to auth user:', authUserId);

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
        devLog('[Auth] Edge Function link error (non-critical):', error.message);
      } else {
        devLog('[Auth] Customer auth_user_id updated via Edge Function');
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
      devLog('[Auth] selectCustomer: customer not found or no user');
      return;
    }
    await linkCustomer(customer, user.id);
  }, [matchedCustomers, user?.id, linkCustomer]);

  const sendOtp = useCallback(async (phone: string) => {
    const stripped = phone.replace(/\s/g, '').replace(/^0+/, '');
    const formattedPhone = stripped.startsWith('+') ? stripped : `+95${stripped}`;
    devLog('[Auth] Sending OTP to:', formattedPhone);
    const { error } = await supabase.auth.signInWithOtp({ phone: formattedPhone });
    if (error) {
      devLog('[Auth] OTP send error:', error.message);
      throw new Error(error.message);
    }
    devLog('[Auth] OTP sent successfully');
  }, []);

  const verifyOtp = useCallback(async (phone: string, token: string) => {
    const stripped = phone.replace(/\s/g, '').replace(/^0+/, '');
    const formattedPhone = stripped.startsWith('+') ? stripped : `+95${stripped}`;
    devLog('[Auth] Verifying OTP for:', formattedPhone);
    const { data, error } = await supabase.auth.verifyOtp({
      phone: formattedPhone,
      token,
      type: 'sms',
    });
    if (error) {
      devLog('[Auth] OTP verify error:', error.message);
      throw new Error(error.message);
    }
    devLog('[Auth] OTP verified, session:', data.session ? 'yes' : 'no');

    if (data.user) {
      // vC14 Task A: after a successful OTP login, recheck whether a PIN is
      // set. New device / fresh login → no_pin → mandatory PIN setup.
      // Existing PIN on this device → locked → unlock screen.
      recheckPin();
      setLinkingState('checking');
      const customers = await findCustomersByPhone(formattedPhone, data.user.id);

      if (customers.length === 1) {
        devLog('[Auth] Single customer match, auto-linking:', customers[0].name);
        await linkCustomer(customers[0], data.user.id);
        return { ...data, linkingState: 'linked' as const };
      } else if (customers.length > 1) {
        devLog('[Auth] Multiple customer matches:', customers.length);
        setMatchedCustomers(customers);
        setLinkingState('select_profile');
        return { ...data, linkingState: 'select_profile' as const };
      } else {
        devLog('[Auth] No customer match, need registration');
        setLinkingState('register_new');
        return { ...data, linkingState: 'register_new' as const };
      }
    }

    return { ...data, linkingState: 'idle' as const };
  }, [findCustomersByPhone, linkCustomer, recheckPin]);

  const registerNewCustomer = useCallback(async (customerData: {
    name: string;
    phone: string;
    township: string;
    address: string;
    landmark?: string | null; // vC16 Task B
  }) => {
    if (!user?.id) {
      devLog('[Auth] registerNewCustomer: no auth user');
      throw new Error('Not authenticated');
    }

    const localPhone = customerData.phone.startsWith('0')
      ? customerData.phone
      : '0' + customerData.phone.replace(/^\+95/, '');

    devLog('[Auth] Registering new customer via Edge Function:', customerData.name);

    const { data, error } = await supabase.functions.invoke('register-customer', {
      body: {
        full_name: customerData.name,
        township: customerData.township,
        address: customerData.address,
        // vC16 Task B: pass landmark to the EF (it writes to customers.landmark).
        // The EF may not accept this yet — it's additive and will be ignored if absent.
        landmark: customerData.landmark || null,
      },
    });

    if (error) {
      devLog('[Auth] Edge Function register error:', error.message);
      throw new Error(error.message || 'Registration failed');
    }

    const responseData = data as { ok?: boolean; customer?: Record<string, unknown> } | null;
    if (!responseData?.ok || !responseData?.customer) {
      devLog('[Auth] Edge Function returned no customer data:', JSON.stringify(data));
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
      // vC16 Task B: landmark + GPS
      landmark: (c.landmark as string | null) ?? customerData.landmark ?? null,
      gps_lat: (c.gps_lat as number | null) ?? null,
      gps_lng: (c.gps_lng as number | null) ?? null,
      auth_user_id: user.id,
      created_at: (c.created_at as string) || new Date().toISOString(),
      updated_at: (c.updated_at as string) || new Date().toISOString(),
    };

    devLog('[Auth] New customer created via Edge Function:', newCustomer.id);
    setActiveCustomer(newCustomer);
    setLinkingState('linked');
    await AsyncStorage.setItem(ACTIVE_CUSTOMER_KEY, JSON.stringify(newCustomer));
    queryClient.invalidateQueries({ queryKey: ['addresses'] });
    queryClient.invalidateQueries({ queryKey: ['orders'] });

    return newCustomer;
  }, [user?.id, queryClient]);

  // vC16 Task A: SOFT sign-out. Moves the session from AsyncStorage to
  // SecureStore so PIN can restore it without OTP. UI state is cleared (the
  // app shows the account tile overlay). The token is NOT revoked.
  const softSignOut = useCallback(async () => {
    devLog('[Auth] Soft sign-out — parking session');
    const phoneForPrefill = activeCustomer?.phone || phoneNumber || '';
    const nameForTile = activeCustomer?.full_name || activeCustomer?.name || null;

    const sessionToPark = session;

    if (Platform.OS !== 'web' && sessionToPark) {
      // Park the session in SecureStore + account metadata.
      try {
        await SecureStore.setItemAsync(PARKED_SESSION_KEY, JSON.stringify(sessionToPark));
        const accountMeta: ParkedAccount = { phone: phoneForPrefill, name: nameForTile };
        await SecureStore.setItemAsync(PARKED_ACCOUNT_KEY, JSON.stringify(accountMeta));
        if (activeCustomer) {
          await SecureStore.setItemAsync(PARKED_CUSTOMER_KEY, JSON.stringify(activeCustomer));
        } else {
          await SecureStore.deleteItemAsync(PARKED_CUSTOMER_KEY);
        }
        setParkedAccount(accountMeta);
        devLog('[Auth] Session parked for phone:', phoneForPrefill);
      } catch (e) {
        devLog('[Auth] Failed to park session:', e);
      }
    }

    // Store phone for welcome-back prefill (same as before).
    if (phoneForPrefill) {
      await AsyncStorage.setItem(LAST_PHONE_KEY, phoneForPrefill);
    }

    // Clear the live session WITHOUT revoking the token.
    await supabase.auth.clearLocalSession();

    // Clear UI state.
    setSession(null);
    setUser(null);
    setActiveCustomer(null);
    setMatchedCustomers([]);
    setLinkingState('idle');
    setSavedAddresses([]);
    await AsyncStorage.removeItem(ACTIVE_CUSTOMER_KEY);
    await AsyncStorage.removeItem(ADDRESSES_KEY);
    await clearCustomerOrderCache(customerId);
    queryClient.clear();
  }, [queryClient, activeCustomer, phoneNumber, session, customerId]);

  // vC16 Task A: Resume a parked session after PIN success. Restores the
  // session from SecureStore to the live session path. No OTP, no SMS.
  const resumeParkedSession = useCallback(async (): Promise<boolean> => {
    if (Platform.OS === 'web') return false;
    devLog('[Auth] Resuming parked session');
    try {
      const stored = await SecureStore.getItemAsync(PARKED_SESSION_KEY);
      if (!stored) {
        devLog('[Auth] No parked session found');
        return false;
      }
      const session = JSON.parse(stored) as SupabaseSession;
      // Restore the session to the live path.
      await supabase.auth.resumeSession(session);

      // Restore the linked customer from encrypted parked storage. Older builds
      // may still have the AsyncStorage copy, so keep it as a migration fallback.
      const customerStored =
        await SecureStore.getItemAsync(PARKED_CUSTOMER_KEY) ||
        await AsyncStorage.getItem(ACTIVE_CUSTOMER_KEY);
      if (customerStored) {
        try {
          const parsed = JSON.parse(customerStored) as Customer;
          setActiveCustomer(parsed);
          setLinkingState('linked');
          await AsyncStorage.setItem(ACTIVE_CUSTOMER_KEY, JSON.stringify(parsed));
        } catch {}
      }

      // Clear the parked session — it's now live again.
      await SecureStore.deleteItemAsync(PARKED_SESSION_KEY);
      await SecureStore.deleteItemAsync(PARKED_ACCOUNT_KEY);
      await SecureStore.deleteItemAsync(PARKED_CUSTOMER_KEY);
      setParkedAccount(null);

      queryClient.invalidateQueries({ queryKey: ['orders'] });
      queryClient.invalidateQueries({ queryKey: ['addresses'] });
      devLog('[Auth] Parked session resumed successfully');
      return true;
    } catch (e) {
      devLog('[Auth] Failed to resume parked session:', e);
      return false;
    }
  }, [queryClient]);

  // vC16 Task A: Clear the parked session (used by PinLockProvider wipe paths —
  // lockout, forgot-PIN — so a wiped PIN also wipes the parked session).
  const clearParkedSession = useCallback(async () => {
    if (Platform.OS === 'web') return;
    try {
      const stored = await SecureStore.getItemAsync(PARKED_SESSION_KEY);
      if (stored) {
        const session = JSON.parse(stored) as SupabaseSession;
        // Revoke the parked token server-side.
        await supabase.auth.revokeToken(session.access_token);
      }
      await SecureStore.deleteItemAsync(PARKED_SESSION_KEY);
      await SecureStore.deleteItemAsync(PARKED_ACCOUNT_KEY);
      await SecureStore.deleteItemAsync(PARKED_CUSTOMER_KEY);
      setParkedAccount(null);
      devLog('[Auth] Parked session cleared');
    } catch (e) {
      devLog('[Auth] Failed to clear parked session:', e);
    }
  }, []);

  // vC16 Task A: REMOVE account (old hard logout, correctly named). Revokes
  // the session server-side, wipes SecureStore (PIN, parked session, attempts)
  // and the last-phone prefill. OTP required to return.
  const removeAccount = useCallback(async () => {
    devLog('[Auth] Remove account — full wipe');
    const phoneForPrefill = activeCustomer?.phone || phoneNumber || '';
    if (phoneForPrefill) {
      await AsyncStorage.setItem(LAST_PHONE_KEY, phoneForPrefill);
    }
    // Clear PIN + parked session + all SecureStore.
    await clearPinOnSignOut();
    await clearParkedSession();
    // Revoke the live session.
    const { error } = await supabase.auth.signOut();
    if (error) {
      devLog('[Auth] Sign out error:', error.message);
    }
    setSession(null);
    setUser(null);
    setActiveCustomer(null);
    setMatchedCustomers([]);
    setLinkingState('idle');
    setSavedAddresses([]);
    setParkedAccount(null);
    await AsyncStorage.removeItem(ACTIVE_CUSTOMER_KEY);
    await AsyncStorage.removeItem(ADDRESSES_KEY);
    await clearCustomerOrderCache(customerId);
    queryClient.clear();
  }, [queryClient, clearPinOnSignOut, clearParkedSession, activeCustomer, phoneNumber, customerId]);

  // Permanent-deletion success path. Unlike ordinary device removal, this
  // keeps no phone prefill and removes every customer-scoped order cache so a
  // later OTP creates a genuinely fresh local account. Each storage operation
  // is best-effort because the server identity is already gone at this point;
  // local cleanup must always finish by clearing in-memory auth state.
  const clearDeletedAccountLocally = useCallback(async () => {
    devLog('[Auth] Finalizing permanent account deletion locally');

    const cleanupResults = await Promise.allSettled([
      clearPinOnSignOut(),
      clearParkedSession(),
      supabase.auth.signOut(),
    ]);
    cleanupResults.forEach((result) => {
      if (result.status === 'rejected') {
        devLog('[Auth] Permanent deletion cleanup step failed:', result.reason);
      }
    });

    setSession(null);
    setUser(null);
    setActiveCustomer(null);
    setMatchedCustomers([]);
    setLinkingState('idle');
    setSavedAddresses([]);
    setParkedAccount(null);

    try {
      const keys = await AsyncStorage.getAllKeys();
      const keysToRemove = keys.filter((key) =>
        key === ACTIVE_CUSTOMER_KEY ||
        key === ADDRESSES_KEY ||
        key === LAST_PHONE_KEY ||
        key === ORDERS_KEY_PREFIX ||
        key.startsWith(`${ORDERS_KEY_PREFIX}:`)
      );
      if (keysToRemove.length > 0) {
        await AsyncStorage.multiRemove(keysToRemove);
      }
    } catch (error) {
      devLog('[Auth] Permanent deletion AsyncStorage cleanup failed:', error);
    }

    queryClient.clear();
  }, [queryClient, clearPinOnSignOut, clearParkedSession]);

  // vC15-compatible logout (kept for pin-lock.tsx lockout/forgot paths).
  // This is the old hard logout — redirects to login. Now delegates to
  // removeAccount semantics but is called from PIN lockout/forgot flows.
  const logout = useCallback(async () => {
    devLog('[Auth] Logout (hard — pin lockout/forgot path)');
    const phoneForPrefill = activeCustomer?.phone || phoneNumber || '';
    if (phoneForPrefill) {
      await AsyncStorage.setItem(LAST_PHONE_KEY, phoneForPrefill);
    }
    await clearPinOnSignOut();
    await clearParkedSession();
    const { error } = await supabase.auth.signOut();
    if (error) {
      devLog('[Auth] Sign out error:', error.message);
    }
    setSession(null);
    setUser(null);
    setActiveCustomer(null);
    setMatchedCustomers([]);
    setLinkingState('idle');
    setSavedAddresses([]);
    setParkedAccount(null);
    await AsyncStorage.removeItem(ACTIVE_CUSTOMER_KEY);
    await AsyncStorage.removeItem(ADDRESSES_KEY);
    await clearCustomerOrderCache(customerId);
    queryClient.clear();
  }, [queryClient, clearPinOnSignOut, clearParkedSession, activeCustomer, phoneNumber, customerId]);

  const addAddress = useCallback(async (address: Omit<SavedAddress, 'id'>) => {
    const newAddress: SavedAddress = { ...address, id: `addr_${Date.now()}` };

    if (customerId) {
      devLog('[Auth] Adding address to customer_addresses:', address.label);
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
        devLog('[Auth] Address insert error:', error.message);
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

  // vC16 Task B: save delivery address + township + landmark + GPS to the
  // customer's own row. Uses customers_update_own_profile RLS (auth_user_id =
  // auth.uid()), verified in prod. Column allowlist: address, township,
  // landmark, gps_lat, gps_lng — nothing else, ever.
  const updateCustomerAddress = useCallback(async (
    address: string,
    township: string,
    landmark?: string | null,
    gpsLat?: number | null,
    gpsLng?: number | null,
  ) => {
    if (!activeCustomer) {
      throw new Error('No active customer — cannot update address');
    }
    devLog('[Auth] Updating address for customer:', activeCustomer.id);
    // Build the update payload with ONLY the allowed columns.
    const update: Record<string, unknown> = { address, township };
    if (landmark !== undefined) update.landmark = landmark || null;
    if (gpsLat !== undefined) update.gps_lat = gpsLat;
    if (gpsLng !== undefined) update.gps_lng = gpsLng;

    const { error } = await supabase
      .fromUpdate('customers', update)
      .eq('id', activeCustomer.id);

    if (error) {
      devLog('[Auth] Address update error:', error.message);
      throw new Error(error.message);
    }

    const updated: Customer = {
      ...activeCustomer,
      address,
      township,
      landmark: landmark !== undefined ? (landmark || null) : activeCustomer.landmark,
      gps_lat: gpsLat !== undefined ? gpsLat : activeCustomer.gps_lat,
      gps_lng: gpsLng !== undefined ? gpsLng : activeCustomer.gps_lng,
    };
    setActiveCustomer(updated);
    await AsyncStorage.setItem(ACTIVE_CUSTOMER_KEY, JSON.stringify(updated));
    queryClient.invalidateQueries({ queryKey: ['orders'] });
    devLog('[Auth] Address updated successfully');
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
    // vC16 Task A: parked account + three-tier sign-out
    parkedAccount,
    softSignOut,
    resumeParkedSession,
    clearParkedSession,
    removeAccount,
    clearDeletedAccountLocally,
    sendOtp,
    verifyOtp,
    logout,
    selectCustomer,
    registerNewCustomer,
    addAddress,
    getDefaultAddress,
    updateCustomerAddress,
    // vC15 Task B: expose the last-phone keys for the login screen
    LAST_PHONE_KEY,
  };
});
