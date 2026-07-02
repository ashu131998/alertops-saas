import { useEffect } from 'react';
import { Stack, router } from 'expo-router';
import { useAuthStore } from '../../features/auth/authStore';

export default function AuthLayout() {
  const { isAuthenticated } = useAuthStore();

  useEffect(() => {
    if (isAuthenticated) router.replace('/(app)');
  }, [isAuthenticated]);

  return <Stack screenOptions={{ headerShown: false }} />;
}
