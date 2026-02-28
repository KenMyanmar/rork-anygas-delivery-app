import React from 'react';
import { Stack } from 'expo-router';
import Colors from '@/constants/colors';

export default function NotificationsLayout() {
  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: Colors.surface },
        headerTitleStyle: { fontWeight: '700', color: Colors.textPrimary },
        headerShadowVisible: false,
      }}
    >
      <Stack.Screen name="index" options={{ title: 'Notifications' }} />
    </Stack>
  );
}
