import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import React, { useEffect } from "react";
import { Platform } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { AuthProvider } from "@/providers/AuthProvider";
import { OrderProvider } from "@/providers/OrderProvider";
import { I18nProvider } from "@/providers/I18nProvider";
import { PinLockProvider, usePinLock } from "@/providers/PinLockProvider";
import { useAuth } from "@/providers/AuthProvider";
import PinLockScreen from "./pin-lock";
import AccountTileScreen from "./account-tile";

SplashScreen.preventAutoHideAsync();

const queryClient = new QueryClient();

function RootLayoutNav() {
  return (
    <Stack screenOptions={{ headerBackTitle: "Back" }}>
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen
        name="login"
        options={{ headerShown: false, presentation: "modal", gestureEnabled: false }}
      />
      <Stack.Screen
        name="customer-select"
        options={{ headerShown: false, presentation: "modal", gestureEnabled: false }}
      />
      <Stack.Screen
        name="customer-register"
        options={{ headerShown: false, presentation: "modal", gestureEnabled: false }}
      />
      <Stack.Screen name="pin-lock" options={{ headerShown: false, gestureEnabled: false }} />
      <Stack.Screen name="account-tile" options={{ headerShown: false, gestureEnabled: false }} />
      <Stack.Screen name="edit-address" options={{ headerShown: false, presentation: "modal" }} />
      <Stack.Screen name="+not-found" />
    </Stack>
  );
}

/**
 * vC14 Task A — PIN/biometric lock overlay.
 * Renders full-screen on top of the app when lockState is 'no_pin' (mandatory
 * setup) or 'locked' (unlock). Invisible when 'unlocked' or 'loading'.
 * Only shows when the user is authenticated — no lock screen over login.
 *
 * vC16 Task A — Account tile overlay takes priority when there's a parked
 * account (soft sign-out). The PIN lock is skipped in that state because the
 * account tile handles its own PIN entry + session resume.
 */
function PinLockOverlay() {
  const { lockState } = usePinLock();
  const { isAuthenticated, parkedAccount } = useAuth();
  // vC15.1 — PIN lock is native-only. On web, never render the overlay.
  if (Platform.OS === 'web') return null;
  // vC16 Task A: if there's a parked account (soft sign-out state), the
  // account tile overlay handles re-entry — skip the PIN lock.
  if (parkedAccount) return null;
  // Only show the lock overlay when the user is authenticated. Over the login
  // screen (unauthenticated), the overlay must stay hidden so OTP entry works.
  // PinLockScreen itself also returns null when unlocked/loading.
  if (!isAuthenticated) return null;
  if (lockState === 'unlocked' || lockState === 'loading') return null;
  return <PinLockScreen />;
}

/**
 * vC16 Task A — Account tile overlay (soft sign-out re-entry).
 * Renders full-screen when there's a parked account and no live session.
 * Native-only (same as PinLockOverlay — web bypass).
 */
function AccountTileOverlay() {
  const { isAuthenticated, parkedAccount } = useAuth();
  if (Platform.OS === 'web') return null;
  // Show the account tile when there's a parked account and no live session.
  // Once the session is resumed, isAuthenticated becomes true and the tile
  // disappears.
  if (!parkedAccount) return null;
  if (isAuthenticated) return null;
  return <AccountTileScreen />;
}

export default function RootLayout() {
  useEffect(() => {
    SplashScreen.hideAsync();
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <GestureHandlerRootView style={{ flex: 1 }}>
        <PinLockProvider>
          <AuthProvider>
            <OrderProvider>
              <I18nProvider>
                <RootLayoutNav />
                <PinLockOverlay />
                <AccountTileOverlay />
              </I18nProvider>
            </OrderProvider>
          </AuthProvider>
        </PinLockProvider>
      </GestureHandlerRootView>
    </QueryClientProvider>
  );
}
