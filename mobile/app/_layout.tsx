import { useEffect } from 'react';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import * as SplashScreen from 'expo-splash-screen';
import { QueryClientProvider } from '@tanstack/react-query';
import { queryClient } from '../lib/queryClient';
import { useAuthStore } from '../features/auth/authStore';
import { setupNotificationListeners } from '../features/notifications/notificationService';
import { router } from 'expo-router';

SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const { hydrateFromStorage, isLoading } = useAuthStore();

  useEffect(() => {
    hydrateFromStorage().then(() => SplashScreen.hideAsync());
  }, []);

  useEffect(() => {
    const cleanup = setupNotificationListeners(
      (_notification) => {
        // Foreground notification — handled by setNotificationHandler above
      },
      (response) => {
        const alertId = response.notification.request.content.data?.alertId as string | undefined;
        if (alertId) router.push(`/(app)/alerts/${alertId}` as any);
      },
    );
    return cleanup;
  }, []);

  if (isLoading) return null;

  return (
    <QueryClientProvider client={queryClient}>
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="(auth)" />
        <Stack.Screen name="(app)" />
      </Stack>
      <StatusBar style="auto" />
    </QueryClientProvider>
  );
}
