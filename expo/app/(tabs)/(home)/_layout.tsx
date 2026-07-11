import React from 'react';
import { Stack } from 'expo-router';

export default function HomeLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="order" options={{ presentation: 'modal', gestureEnabled: true }} />
      <Stack.Screen name="tracking" />
    </Stack>
  );
}
