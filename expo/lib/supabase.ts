import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import { devLog } from './logger';

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL!;
const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY!;
const SESSION_KEY = 'anygas_supabase_session';

const sessionStorage = {
  async getItem(): Promise<string | null> {
    if (Platform.OS === 'web') {
      return AsyncStorage.getItem(SESSION_KEY);
    }

    const secureSession = await SecureStore.getItemAsync(SESSION_KEY);
    if (secureSession) return secureSession;

    // One-time migration for sessions created by older builds.
    const legacySession = await AsyncStorage.getItem(SESSION_KEY);
    if (legacySession) {
      await SecureStore.setItemAsync(SESSION_KEY, legacySession);
      await AsyncStorage.removeItem(SESSION_KEY);
    }
    return legacySession;
  },

  async setItem(value: string): Promise<void> {
    if (Platform.OS === 'web') {
      await AsyncStorage.setItem(SESSION_KEY, value);
      return;
    }
    await SecureStore.setItemAsync(SESSION_KEY, value);
    await AsyncStorage.removeItem(SESSION_KEY);
  },

  async removeItem(): Promise<void> {
    await AsyncStorage.removeItem(SESSION_KEY);
    if (Platform.OS !== 'web') {
      await SecureStore.deleteItemAsync(SESSION_KEY);
    }
  },
};

export interface SupabaseUser {
  id: string;
  phone?: string;
  email?: string;
  created_at?: string;
  updated_at?: string;
  [key: string]: unknown;
}

export interface SupabaseSession {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  expires_at?: number;
  token_type: string;
  user: SupabaseUser;
}

type AuthEvent = 'SIGNED_IN' | 'SIGNED_OUT' | 'TOKEN_REFRESHED' | 'INITIAL_SESSION';
type AuthListener = (event: AuthEvent, session: SupabaseSession | null) => void;

const authListeners: Set<AuthListener> = new Set();
let currentSession: SupabaseSession | null = null;

function notifyListeners(event: AuthEvent, session: SupabaseSession | null) {
  authListeners.forEach((listener) => {
    try {
      listener(event, session);
    } catch (e) {
      devLog('[Supabase] Auth listener error:', e);
    }
  });
}

function getAuthHeaders(token?: string): Record<string, string> {
  return {
    'apikey': SUPABASE_ANON_KEY,
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${token || SUPABASE_ANON_KEY}`,
  };
}

/**
 * Token refresh — vC13 Task A.
 *
 * Supabase access tokens expire after ~1 hour. Without refresh, every session
 * dies and users are forced through a fresh 20-MMK OTP on nearly every app
 * open. This function POSTs the stored refresh_token to the token endpoint
 * and stores the new session.
 *
 * Deduplicated: concurrent callers share the same in-flight promise so we
 * never fire two refreshes simultaneously. On failure, signs out cleanly.
 */
let refreshInFlight: Promise<string | null> | null = null;

async function refreshAccessToken(): Promise<string | null> {
  if (refreshInFlight) return refreshInFlight;
  refreshInFlight = (async (): Promise<string | null> => {
    try {
      const stored = await sessionStorage.getItem();
      if (!stored) return null;
      const session = JSON.parse(stored) as SupabaseSession;
      if (!session.refresh_token) return null;

      devLog('[Supabase] Refreshing access token...');
      const response = await fetch(
        `${SUPABASE_URL}/auth/v1/token?grant_type=refresh_token`,
        {
          method: 'POST',
          headers: {
            'apikey': SUPABASE_ANON_KEY,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ refresh_token: session.refresh_token }),
        },
      );

      if (!response.ok) {
        devLog('[Supabase] Token refresh failed:', response.status);
        currentSession = null;
        await sessionStorage.removeItem();
        notifyListeners('SIGNED_OUT', null);
        return null;
      }

      const result = await response.json();
      const newSession: SupabaseSession = {
        access_token: result.access_token,
        refresh_token: result.refresh_token,
        expires_in: result.expires_in,
        expires_at: result.expires_at,
        token_type: result.token_type || 'bearer',
        user: result.user,
      };

      currentSession = newSession;
      await sessionStorage.setItem(JSON.stringify(newSession));
      notifyListeners('TOKEN_REFRESHED', newSession);
      devLog('[Supabase] Token refreshed for user:', newSession.user?.id);
      return newSession.access_token;
    } catch (e) {
      devLog('[Supabase] Token refresh error:', e);
      currentSession = null;
      await sessionStorage.removeItem();
      notifyListeners('SIGNED_OUT', null);
      return null;
    } finally {
      refreshInFlight = null;
    }
  })();
  return refreshInFlight;
}

/** Check whether the current token is expired or about to expire (within 60s). */
function isTokenExpired(session: SupabaseSession | null): boolean {
  if (!session?.expires_at) return false; // no expiry info — assume valid
  const now = Math.floor(Date.now() / 1000);
  return session.expires_at - now <= 60;
}

async function getAccessToken(): Promise<string | null> {
  if (currentSession?.access_token) {
    if (isTokenExpired(currentSession)) {
      return await refreshAccessToken();
    }
    return currentSession.access_token;
  }
  try {
    const stored = await sessionStorage.getItem();
    if (stored) {
      const session = JSON.parse(stored) as SupabaseSession;
      currentSession = session;
      if (isTokenExpired(session)) {
        return await refreshAccessToken();
      }
      return session.access_token;
    }
  } catch (e) {
    devLog('[Supabase] Failed to get stored session:', e);
  }
  return null;
}

interface QueryResult<T = unknown> {
  data: T | null;
  error: { message: string; code?: string } | null;
}

class PostgrestFilterBuilder<T = unknown> {
  private url: string;
  private headers: Record<string, string>;
  private method: string;
  private body: unknown | null;
  private filters: string[] = [];
  private orderClauses: string[] = [];
  private limitValue: number | null = null;
  private selectColumns: string = '*';
  private preferHeader: string = '';

  constructor(
    baseUrl: string,
    table: string,
    headers: Record<string, string>,
    method: string,
    body?: unknown,
  ) {
    this.url = `${baseUrl}/rest/v1/${table}`;
    this.headers = { ...headers };
    this.method = method;
    this.body = body ?? null;
    if (method === 'POST') {
      this.preferHeader = 'return=representation';
    }
    if (method === 'PATCH') {
      this.preferHeader = 'return=representation';
    }
  }

  select(columns: string = '*'): this {
    this.selectColumns = columns;
    return this;
  }

  eq(column: string, value: string | number | boolean): this {
    this.filters.push(`${column}=eq.${value}`);
    return this;
  }

  is(column: string, value: null): this {
    this.filters.push(`${column}=is.${value}`);
    return this;
  }

  lte(column: string, value: number): this {
    this.filters.push(`${column}=lte.${value}`);
    return this;
  }

  order(column: string, opts?: { ascending?: boolean }): this {
    const dir = opts?.ascending === false ? 'desc' : 'asc';
    this.orderClauses.push(`${column}.${dir}`);
    return this;
  }

  limit(count: number): this {
    this.limitValue = count;
    return this;
  }

  async then<TResult = QueryResult<T[]>>(
    resolve: (value: QueryResult<T[]>) => TResult,
    reject?: (reason: unknown) => TResult,
  ): Promise<TResult> {
    try {
      const result = await this.execute();
      return resolve(result as QueryResult<T[]>);
    } catch (e) {
      if (reject) return reject(e);
      throw e;
    }
  }

  private async execute(): Promise<QueryResult<T[]>> {
    try {
      const params: string[] = [];
      if (this.method === 'GET') {
        params.push(`select=${encodeURIComponent(this.selectColumns)}`);
      }
      this.filters.forEach((f) => params.push(f));
      if (this.orderClauses.length > 0) {
        params.push(`order=${this.orderClauses.join(',')}`);
      }
      if (this.limitValue !== null) {
        params.push(`limit=${this.limitValue}`);
      }

      const queryString = params.length > 0 ? `?${params.join('&')}` : '';
      const fullUrl = `${this.url}${queryString}`;

      const fetchHeaders = { ...this.headers };
      if (this.preferHeader) {
        fetchHeaders['Prefer'] = this.preferHeader;
      }

      const fetchOptions: RequestInit = {
        method: this.method,
        headers: fetchHeaders,
      };
      if (this.body && (this.method === 'POST' || this.method === 'PATCH')) {
        fetchOptions.body = JSON.stringify(this.body);
      }

      devLog('[Supabase REST]', this.method, fullUrl);
      let response = await fetch(fullUrl, fetchOptions);
      // vC13 Task A: on 401, attempt one token refresh and retry once.
      if (response.status === 401) {
        devLog('[Supabase REST] 401, attempting token refresh...');
        const newToken = await refreshAccessToken();
        if (newToken) {
          fetchHeaders['Authorization'] = `Bearer ${newToken}`;
          response = await fetch(fullUrl, { ...fetchOptions, headers: fetchHeaders });
          devLog('[Supabase REST] Retried after refresh, status:', response.status);
        }
      }
      const text = await response.text();

      if (!response.ok) {
        devLog('[Supabase REST] Error:', response.status, text);
        let errorMsg = `HTTP ${response.status}`;
        try {
          const errJson = JSON.parse(text);
          errorMsg = errJson.message || errJson.error || errorMsg;
        } catch {}
        return { data: null, error: { message: errorMsg } };
      }

      if (!text || text.trim() === '') {
        return { data: [] as unknown as T[], error: null };
      }

      const data = JSON.parse(text);
      return { data: Array.isArray(data) ? data : [data], error: null };
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Unknown error';
      devLog('[Supabase REST] Fetch error:', message);
      return { data: null, error: { message } };
    }
  }
}

class SupabaseRestClient {
  auth = {
    getSession: async (): Promise<{ data: { session: SupabaseSession | null } }> => {
      try {
        const stored = await sessionStorage.getItem();
        if (stored) {
          const session = JSON.parse(stored) as SupabaseSession;
          currentSession = session;
          // vC13 Task A: refresh expired tokens on app open so users don't
          // re-OTP on every launch. Access tokens expire ~1 hour; if expired
          // (or within 60s of expiry), refresh via refresh_token grant.
          if (isTokenExpired(session)) {
            devLog('[Supabase] Session token expired, refreshing on restore...');
            const newToken = await refreshAccessToken();
            if (newToken) {
              return { data: { session: currentSession } };
            }
            // Refresh failed — signed out via refreshAccessToken
            return { data: { session: null } };
          }
          devLog('[Supabase] Restored session for user:', session.user?.id);
          return { data: { session } };
        }
      } catch (e) {
        devLog('[Supabase] getSession error:', e);
      }
      return { data: { session: null } };
    },

    signInWithOtp: async (params: { phone: string }): Promise<{ error: { message: string } | null }> => {
      try {
        devLog('[Supabase] Sending OTP to:', params.phone);
        const response = await fetch(`${SUPABASE_URL}/auth/v1/otp`, {
          method: 'POST',
          headers: {
            'apikey': SUPABASE_ANON_KEY,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ phone: params.phone }),
        });

        if (!response.ok) {
          const err = await response.json().catch(() => ({}));
          const msg = err.msg || err.message || err.error || `OTP failed (${response.status})`;
          devLog('[Supabase] OTP send error:', msg);
          return { error: { message: msg } };
        }
        devLog('[Supabase] OTP sent successfully');
        return { error: null };
      } catch (e) {
        const message = e instanceof Error ? e.message : 'Network error';
        return { error: { message } };
      }
    },

    verifyOtp: async (params: {
      phone: string;
      token: string;
      type: string;
    }): Promise<{
      data: { session: SupabaseSession | null; user: SupabaseUser | null };
      error: { message: string } | null;
    }> => {
      try {
        devLog('[Supabase] Verifying OTP for:', params.phone);
        const response = await fetch(`${SUPABASE_URL}/auth/v1/verify`, {
          method: 'POST',
          headers: {
            'apikey': SUPABASE_ANON_KEY,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            phone: params.phone,
            token: params.token,
            type: params.type,
          }),
        });

        const result = await response.json().catch(() => ({}));

        if (!response.ok) {
          const msg = result.msg || result.message || result.error || `Verify failed (${response.status})`;
          devLog('[Supabase] OTP verify error:', msg);
          return { data: { session: null, user: null }, error: { message: msg } };
        }

        const session: SupabaseSession | null = result.access_token
          ? {
              access_token: result.access_token,
              refresh_token: result.refresh_token,
              expires_in: result.expires_in,
              expires_at: result.expires_at,
              token_type: result.token_type || 'bearer',
              user: result.user,
            }
          : null;

        if (session) {
          currentSession = session;
          await sessionStorage.setItem(JSON.stringify(session));
          devLog('[Supabase] Session stored, user:', session.user?.id);
          notifyListeners('SIGNED_IN', session);
        }

        return {
          data: { session, user: result.user || null },
          error: null,
        };
      } catch (e) {
        const message = e instanceof Error ? e.message : 'Network error';
        return { data: { session: null, user: null }, error: { message } };
      }
    },

    signOut: async (): Promise<{ error: { message: string } | null }> => {
      try {
        const token = await getAccessToken();
        if (token) {
          await fetch(`${SUPABASE_URL}/auth/v1/logout`, {
            method: 'POST',
            headers: {
              'apikey': SUPABASE_ANON_KEY,
              'Authorization': `Bearer ${token}`,
            },
          }).catch(() => {});
        }
        currentSession = null;
        await sessionStorage.removeItem();
        notifyListeners('SIGNED_OUT', null);
        devLog('[Supabase] Signed out');
        return { error: null };
      } catch (e) {
        const message = e instanceof Error ? e.message : 'Sign out error';
        return { error: { message } };
      }
    },

    // vC16 Task A: Clear local session WITHOUT revoking the token. Used by
    // softSignOut — the session moves to SecureStore so PIN can restore it.
    clearLocalSession: async (): Promise<void> => {
      currentSession = null;
      await sessionStorage.removeItem();
      notifyListeners('SIGNED_OUT', null);
      devLog('[Supabase] Local session cleared (not revoked)');
    },

    // vC16 Task A: Restore a parked session from SecureStore back to the live
    // session path. Notifies SIGNED_IN so AuthProvider picks it up.
    resumeSession: async (session: SupabaseSession): Promise<void> => {
      currentSession = session;
      await sessionStorage.setItem(JSON.stringify(session));
      notifyListeners('SIGNED_IN', session);
      devLog('[Supabase] Session restored from parked');
    },

    // vC16 Task A: Revoke a specific token server-side (for clearing a parked
    // session without affecting the live session path).
    revokeToken: async (token: string): Promise<void> => {
      try {
        await fetch(`${SUPABASE_URL}/auth/v1/logout`, {
          method: 'POST',
          headers: {
            'apikey': SUPABASE_ANON_KEY,
            'Authorization': `Bearer ${token}`,
          },
        }).catch(() => {});
        devLog('[Supabase] Token revoked');
      } catch (e) {
        devLog('[Supabase] Revoke token error:', e);
      }
    },

    onAuthStateChange: (callback: (event: string, session: SupabaseSession | null) => void) => {
      const listener: AuthListener = (event, session) => callback(event, session);
      authListeners.add(listener);
      return {
        data: {
          subscription: {
            unsubscribe: () => {
              authListeners.delete(listener);
            },
          },
        },
      };
    },
  };

  functions = {
    invoke: async (
      functionName: string,
      options?: { body?: unknown },
    ): Promise<{ data: unknown; error: { message: string } | null }> => {
      try {
        const token = await getAccessToken();
        const url = `${SUPABASE_URL}/functions/v1/${functionName}`;
        devLog('[Supabase] Invoking function:', functionName);

        const fnHeaders: Record<string, string> = {
          'apikey': SUPABASE_ANON_KEY,
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token || SUPABASE_ANON_KEY}`,
        };
        const fnBody = options?.body ? JSON.stringify(options.body) : undefined;
        let response = await fetch(url, {
          method: 'POST',
          headers: fnHeaders,
          body: fnBody,
        });
        // vC13 Task A: on 401, attempt one token refresh and retry once.
        if (response.status === 401) {
          devLog('[Supabase] Function 401, attempting token refresh...');
          const newToken = await refreshAccessToken();
          if (newToken) {
            response = await fetch(url, {
              method: 'POST',
              headers: { ...fnHeaders, 'Authorization': `Bearer ${newToken}` },
              body: fnBody,
            });
            devLog('[Supabase] Function retried after refresh, status:', response.status);
          }
        }

        const text = await response.text();
        let data: unknown = null;
        try {
          data = JSON.parse(text);
        } catch {
          data = text;
        }

        if (!response.ok) {
          const errData = data as Record<string, unknown> | null;
          const msg =
            (errData && typeof errData === 'object' && ((errData.error as string) || (errData.message as string))) ||
            `Function error (${response.status})`;
          devLog('[Supabase] Function error:', msg);
          return { data: null, error: { message: String(msg) } };
        }

        devLog('[Supabase] Function success:', functionName);
        return { data, error: null };
      } catch (e) {
        const message = e instanceof Error ? e.message : 'Network error';
        return { data: null, error: { message } };
      }
    },
  };

  from(table: string): PostgrestFilterBuilder {
    const token = currentSession?.access_token;
    const headers = getAuthHeaders(token || undefined);
    return new PostgrestFilterBuilder(SUPABASE_URL, table, headers, 'GET');
  }

  fromInsert(table: string, data: unknown): PostgrestFilterBuilder {
    const token = currentSession?.access_token;
    const headers = getAuthHeaders(token || undefined);
    return new PostgrestFilterBuilder(SUPABASE_URL, table, headers, 'POST', data);
  }

  fromUpdate(table: string, data: unknown): PostgrestFilterBuilder {
    const token = currentSession?.access_token;
    const headers = getAuthHeaders(token || undefined);
    return new PostgrestFilterBuilder(SUPABASE_URL, table, headers, 'PATCH', data);
  }

  channel(_name: string) {
    return {
      on: (_event: string, _opts: unknown, _callback: unknown) => {
        return {
          subscribe: () => {
            devLog('[Supabase] Realtime not available in REST client, using polling instead');
            return { unsubscribe: () => {} };
          },
        };
      },
    };
  }

  removeChannel(_channel: unknown) {
    devLog('[Supabase] removeChannel (no-op in REST client)');
  }
}

export const supabase = new SupabaseRestClient();
