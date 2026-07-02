import { View, Text, TouchableOpacity, StyleSheet, Alert } from 'react-native';
import { useAuthStore } from '../../features/auth/authStore';
import { authApi } from '../../features/auth/authApi';
import { wsService } from '../../features/websocket/WebSocketService';
import { secureStorage } from '../../lib/secureStorage';

const ROLE_LABELS: Record<string, string> = { ADMIN: '⚙️ Admin', SUPERVISOR: '👔 Supervisor', WORKER: '🔧 Worker' };

export default function ProfileScreen() {
  const { user, clearAuth } = useAuthStore();

  const handleLogout = () => {
    Alert.alert('Sign Out', 'Are you sure you want to sign out?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Sign Out',
        style: 'destructive',
        onPress: async () => {
          wsService.disconnect();
          const refreshToken = await secureStorage.getRefreshToken();
          if (refreshToken) {
            try { await authApi.logout(refreshToken); } catch {}
          }
          await clearAuth();
        },
      },
    ]);
  };

  if (!user) return null;

  return (
    <View style={styles.container}>
      {/* Avatar */}
      <View style={styles.avatarSection}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>{user.firstName[0]}{user.lastName[0]}</Text>
        </View>
        <Text style={styles.name}>{user.firstName} {user.lastName}</Text>
        <Text style={styles.email}>{user.email}</Text>
        <View style={styles.roleBadge}>
          <Text style={styles.roleText}>{ROLE_LABELS[user.role] ?? user.role}</Text>
        </View>
      </View>

      {/* Details */}
      <View style={styles.card}>
        {[
          ['Factory', user.factory?.name],
          ['Role', user.role],
          ['Email', user.email],
          ['User ID', user.id.slice(0, 8) + '...'],
        ].map(([k, v]) => (
          <View key={k} style={styles.row}>
            <Text style={styles.rowLabel}>{k}</Text>
            <Text style={styles.rowValue}>{v}</Text>
          </View>
        ))}
      </View>

      <TouchableOpacity style={styles.logoutBtn} onPress={handleLogout}>
        <Text style={styles.logoutText}>Sign Out</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f9fafb', padding: 16 },
  avatarSection: { alignItems: 'center', paddingVertical: 32, backgroundColor: '#fff', borderRadius: 16, marginBottom: 16 },
  avatar: { width: 80, height: 80, borderRadius: 40, backgroundColor: '#dbeafe', justifyContent: 'center', alignItems: 'center' },
  avatarText: { fontSize: 28, fontWeight: '700', color: '#1d4ed8' },
  name: { fontSize: 20, fontWeight: '700', color: '#111827', marginTop: 12 },
  email: { fontSize: 13, color: '#6b7280', marginTop: 4 },
  roleBadge: { marginTop: 8, backgroundColor: '#eff6ff', paddingHorizontal: 14, paddingVertical: 4, borderRadius: 20 },
  roleText: { fontSize: 13, color: '#1d4ed8', fontWeight: '500' },
  card: { backgroundColor: '#fff', borderRadius: 16, overflow: 'hidden', marginBottom: 16 },
  row: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: '#f3f4f6' },
  rowLabel: { fontSize: 14, color: '#6b7280' },
  rowValue: { fontSize: 14, fontWeight: '500', color: '#111827', flexShrink: 1, textAlign: 'right' },
  logoutBtn: { backgroundColor: '#fee2e2', borderRadius: 12, paddingVertical: 16, alignItems: 'center' },
  logoutText: { color: '#dc2626', fontWeight: '600', fontSize: 15 },
});
