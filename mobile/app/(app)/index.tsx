import { ScrollView, View, Text, TouchableOpacity, StyleSheet, RefreshControl } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useAuthStore } from '../../features/auth/authStore';
import { alertsApi } from '../../features/alerts/alertsApi';
import type { DashboardStats, AlertSummary } from '../../lib/types';

const SEVERITY_COLORS: Record<string, string> = {
  CRITICAL: '#fee2e2',
  HIGH: '#ffedd5',
  MEDIUM: '#fef9c3',
  LOW: '#dbeafe',
};

function SummaryCard({ label, value, bg, textColor }: { label: string; value: number; bg: string; textColor: string }) {
  return (
    <View style={[styles.summaryCard, { backgroundColor: bg }]}>
      <Text style={[styles.summaryValue, { color: textColor }]}>{value}</Text>
      <Text style={[styles.summaryLabel, { color: textColor }]}>{label}</Text>
    </View>
  );
}

function AlertRow({ alert }: { alert: AlertSummary }) {
  return (
    <TouchableOpacity style={styles.alertRow} onPress={() => router.push(`/(app)/alerts/${alert.id}` as any)}>
      <View style={[styles.severityDot, { backgroundColor: SEVERITY_COLORS[alert.severity] ?? '#e5e7eb' }]} />
      <View style={{ flex: 1 }}>
        <Text style={styles.alertTitle} numberOfLines={1}>{alert.title}</Text>
        <Text style={styles.alertMeta}>{alert.machineName} · {alert.status.replace('_', ' ')}</Text>
      </View>
      {!alert.isRead && <View style={styles.unreadDot} />}
    </TouchableOpacity>
  );
}

export default function HomeScreen() {
  const { user } = useAuthStore();
  const { data: stats, refetch: refetchStats, isRefetching: r1 } = useQuery<DashboardStats>({
    queryKey: ['alert-stats'],
    queryFn: alertsApi.getDashboardStats,
    refetchInterval: 30_000,
  });
  const { data: recentAlerts, refetch: refetchAlerts, isRefetching: r2 } = useQuery({
    queryKey: ['alerts', 'recent-home'],
    queryFn: () => alertsApi.list({ limit: 5, status: 'OPEN' }),
    refetchInterval: 30_000,
  });

  const onRefresh = () => { refetchStats(); refetchAlerts(); };

  return (
    <ScrollView style={styles.container} refreshControl={<RefreshControl refreshing={r1 || r2} onRefresh={onRefresh} />}>
      <View style={styles.header}>
        <Text style={styles.greeting}>Good day, {user?.firstName} 👋</Text>
        <Text style={styles.factory}>{user?.factory?.name}</Text>
      </View>

      {/* Summary cards */}
      <View style={styles.grid}>
        <SummaryCard label="Unread" value={stats?.unreadCount ?? 0} bg="#dbeafe" textColor="#1d4ed8" />
        <SummaryCard label="Critical" value={stats?.criticalCount ?? 0} bg="#fee2e2" textColor="#dc2626" />
        <SummaryCard label="Open" value={stats?.openCount ?? 0} bg="#ffedd5" textColor="#ea580c" />
        <SummaryCard label="In Progress" value={stats?.inProgressCount ?? 0} bg="#f3e8ff" textColor="#7c3aed" />
      </View>

      {/* Recent alerts */}
      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Recent Open Alerts</Text>
          <TouchableOpacity onPress={() => router.push('/(app)/alerts' as any)}>
            <Text style={styles.seeAll}>See all →</Text>
          </TouchableOpacity>
        </View>
        {recentAlerts?.data.length === 0 && (
          <Text style={styles.empty}>No open alerts — all clear! ✅</Text>
        )}
        {recentAlerts?.data.map((a) => <AlertRow key={a.id} alert={a} />)}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f9fafb' },
  header: { padding: 20, paddingTop: 60, backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#e5e7eb' },
  greeting: { fontSize: 22, fontWeight: '700', color: '#111827' },
  factory: { fontSize: 13, color: '#6b7280', marginTop: 2 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, padding: 16 },
  summaryCard: { flex: 1, minWidth: '45%', borderRadius: 14, padding: 16, alignItems: 'center' },
  summaryValue: { fontSize: 32, fontWeight: '800' },
  summaryLabel: { fontSize: 12, fontWeight: '500', marginTop: 4 },
  section: { margin: 16, backgroundColor: '#fff', borderRadius: 16, overflow: 'hidden', shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 6, elevation: 1 },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16, borderBottomWidth: 1, borderBottomColor: '#f3f4f6' },
  sectionTitle: { fontSize: 15, fontWeight: '600', color: '#111827' },
  seeAll: { fontSize: 13, color: '#2563eb' },
  alertRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#f9fafb' },
  severityDot: { width: 10, height: 10, borderRadius: 5 },
  alertTitle: { fontSize: 13, fontWeight: '500', color: '#111827' },
  alertMeta: { fontSize: 11, color: '#9ca3af', marginTop: 2 },
  unreadDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#3b82f6' },
  empty: { padding: 16, textAlign: 'center', color: '#6b7280', fontSize: 14 },
});
