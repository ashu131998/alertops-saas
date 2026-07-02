import { useEffect } from 'react';
import { Tabs, router } from 'expo-router';
import { useAuthStore } from '../../features/auth/authStore';
import { wsService } from '../../features/websocket/WebSocketService';
import { secureStorage } from '../../lib/secureStorage';

export default function AppLayout() {
  const { isAuthenticated, clearAuth } = useAuthStore();

  useEffect(() => {
    if (!isAuthenticated) {
      wsService.disconnect();
      router.replace('/(auth)/login');
      return;
    }
    // Ensure WebSocket is connected
    secureStorage.getAccessToken().then((token) => {
      if (token) wsService.connect(token);
    });
  }, [isAuthenticated]);

  return (
    <Tabs
      screenOptions={{
        headerStyle: { backgroundColor: '#fff' },
        headerTintColor: '#111827',
        tabBarActiveTintColor: '#2563eb',
        tabBarInactiveTintColor: '#6b7280',
        tabBarStyle: { borderTopColor: '#e5e7eb' },
      }}
    >
      <Tabs.Screen name="index" options={{ title: 'Home', tabBarLabel: 'Home', tabBarIcon: ({ color }) => <TabIcon icon="⚡" color={color} /> }} />
      <Tabs.Screen name="alerts/index" options={{ title: 'Alert Inbox', tabBarLabel: 'Alerts', tabBarIcon: ({ color }) => <TabIcon icon="🔔" color={color} /> }} />
      <Tabs.Screen name="alerts/[id]" options={{ href: null }} />
      <Tabs.Screen name="profile" options={{ title: 'Profile', tabBarLabel: 'Profile', tabBarIcon: ({ color }) => <TabIcon icon="👤" color={color} /> }} />
    </Tabs>
  );
}

function TabIcon({ icon, color }: { icon: string; color: string }) {
  return <>{icon}</>;
}
