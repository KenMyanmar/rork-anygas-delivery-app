import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import React, { useEffect } from "react";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { AuthProvider } from "@/providers/AuthProvider";
import { OrderProvider } from "@/providers/OrderProvider";
import { I18nProvider } from "@/providers/I18nProvider";

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
      <Stack.Screen name="+not-found" />
    </Stack>
  );
}

export default function RootLayout() {
  useEffect(() => {
    SplashScreen.hideAsync();
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <GestureHandlerRootView style={{ flex: 1 }}>
        <AuthProvider>
          <OrderProvider>
            <I18nProvider>
              <RootLayoutNav />
            </I18nProvider>
          </OrderProvider>
        </AuthProvider>
      </GestureHandlerRootView>
    </QueryClientProvider>
  );
}
