import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import React, { useEffect } from "react";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { AuthProvider } from "@/providers/AuthProvider";
import { OrderProvider } from "@/providers/OrderProvider";
import { I18nProvider } from "@/providers/I18nProvider";
import { PinLockProvider, usePinLock } from "@/providers/PinLockProvider";
import { useAuth } from "@/providers/AuthProvider";
import PinLockScreen from "./pin-lock";

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
      <Stack.Screen name="+not-found" />
    </Stack>
  );
}

/**
 * vC14 Task A — PIN/biometric lock overlay.
 * Renders full-screen on top of the app when lockState is 'no_pin' (mandatory
 * setup) or 'locked' (unlock). Invisible when 'unlocked' or 'loading'.
 * Only shows when the user is authenticated — no lock screen over login.
 */
function PinLockOverlay() {
  const { lockState } = usePinLock();
  const { isAuthenticated } = useAuth();
  // Only show the lock overlay when the user is authenticated. Over the login
  // screen (unauthenticated), the overlay must stay hidden so OTP entry works.
  // PinLockScreen itself also returns null when unlocked/loading.
  if (!isAuthenticated) return null;
  if (lockState === 'unlocked' || lockState === 'loading') return null;
  return <PinLockScreen />;
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
              </I18nProvider>
            </OrderProvider>
          </AuthProvider>
        </PinLockProvider>
      </GestureHandlerRootView>
    </QueryClientProvider>
  );
}
