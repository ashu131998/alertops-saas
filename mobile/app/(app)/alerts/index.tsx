import { useState, useCallback } from 'react';
import { View, Text, FlatList, TouchableOpacity, StyleSheet, RefreshControl, TextInput, ActivityIndicator } from 'react-native';
import { useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { alertsApi } from '../../../features/alerts/alertsApi';
import type { AlertSummary, AlertSeverity, AlertStatus } from '../../../lib/types';

const SEVERITY_COLOR: Record<AlertSeverity, string> = { CRITICAL: '#dc2626', HIGH: '#ea580c', MEDIUM: '#ca8a04', LOW: '#2563eb' };
const STATUS_COLOR: Record<AlertStatus, string> = { OPEN: '#dc2626', ACKNOWLEDGED: '#ca8a04', IN_PROGRESS: '#7c3aed', RESOLVED: '#16a34a', CLOSED: '#6b7280' };

function AlertItem({ item, onPress }: { item: AlertSummary; onPress: () => void }) {
  return (
    <TouchableOpacity style={[styles.item, !item.isRead && styles.unread]} onPress={onPress}>
      <View style={styles.itemLeft}>
        <View style={[styles.dot, { backgroundColor: SEVERITY_COLOR[item.severity] }]} />
        <View style={{ flex: 1 }}>
          <Text style={styles.itemTitle} numberOfLines={2}>{item.title}</Text>
          <Text style={styles.itemMeta}>{item.machineName}</Text>
        </View>
      </View>
      <View style={styles.itemRight}>
        <Text style={[styles.severityBadge, { color: SEVERITY_COLOR[item.severity] }]}>{item.severity}</Text>
        <Text style={[styles.statusBadge, { color: STATUS_COLOR[item.status] }]}>{item.status.replace('_', ' ')}</Text>
        {!item.isRead && <View style={styles.unreadDot} />}
      </View>
    </TouchableOpacity>
  );
}

export default function AlertInboxScreen() {
  const [search, setSearch] = useState('');
  const [unreadOnly, setUnreadOnly] = useState(false);
  const qc = useQueryClient();

  const { data, fetchNextPage, hasNextPage, isFetchingNextPage, isLoading, isRefetching, refetch } = useInfiniteQuery({
    queryKey: ['alerts', { search, unreadOnly }],
    queryFn: ({ pageParam = 1 }) => alertsApi.list({ page: pageParam as number, limit: 20, search: search || undefined, unreadOnly }),
    getNextPageParam: (last, all) => (last.meta.hasMore ? all.length + 1 : undefined),
    initialPageParam: 1,
  });

  const markAllRead = useMutation({
    mutationFn: alertsApi.markAllRead,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['alerts'] }); qc.invalidateQueries({ queryKey: ['alert-stats'] }); },
  });

  const allAlerts = data?.pages.flatMap((p) => p.data) ?? [];

  const renderItem = useCallback(({ item }: { item: AlertSummary }) => (
    <AlertItem item={item} onPress={() => router.push(`/(app)/alerts/${item.id}` as any)} />
  ), []);

  const renderFooter = () =>
    isFetchingNextPage ? <ActivityIndicator style={{ margin: 16 }} color="#2563eb" /> : null;

  return (
    <View style={styles.container}>
      {/* Search bar */}
      <View style={styles.searchRow}>
        <TextInput style={styles.search} placeholder="Search alerts..." value={search} onChangeText={setSearch} placeholderTextColor="#9ca3af" />
        <TouchableOpacity style={[styles.filterBtn, unreadOnly && styles.filterActive]} onPress={() => setUnreadOnly((v) => !v)}>
          <Text style={[styles.filterText, unreadOnly && { color: '#2563eb' }]}>Unread</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.filterBtn} onPress={() => markAllRead.mutate()}>
          <Text style={styles.filterText}>Mark all ✓</Text>
        </TouchableOpacity>
      </View>

      {isLoading && <ActivityIndicator style={{ marginTop: 40 }} color="#2563eb" />}

      <FlatList
        data={allAlerts}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        onEndReached={() => { if (hasNextPage && !isFetchingNextPage) fetchNextPage(); }}
        onEndReachedThreshold={0.3}
        ListFooterComponent={renderFooter}
        refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} />}
        ListEmptyComponent={!isLoading ? <Text style={styles.empty}>📭 No alerts found</Text> : null}
        contentContainerStyle={{ flexGrow: 1 }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f9fafb' },
  searchRow: { flexDirection: 'row', gap: 8, padding: 12, backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#e5e7eb' },
  search: { flex: 1, borderWidth: 1, borderColor: '#d1d5db', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8, fontSize: 14, color: '#111827', backgroundColor: '#fff' },
  filterBtn: { justifyContent: 'center', paddingHorizontal: 10, paddingVertical: 8, borderWidth: 1, borderColor: '#d1d5db', borderRadius: 8, backgroundColor: '#fff' },
  filterActive: { borderColor: '#2563eb', backgroundColor: '#eff6ff' },
  filterText: { fontSize: 12, color: '#374151', fontWeight: '500' },
  item: { flexDirection: 'row', justifyContent: 'space-between', padding: 14, marginHorizontal: 12, marginTop: 8, backgroundColor: '#fff', borderRadius: 12, shadowColor: '#000', shadowOpacity: 0.03, shadowRadius: 4, elevation: 1 },
  unread: { borderLeftWidth: 3, borderLeftColor: '#3b82f6' },
  itemLeft: { flexDirection: 'row', gap: 10, flex: 1 },
  dot: { width: 10, height: 10, borderRadius: 5, marginTop: 3 },
  itemTitle: { fontSize: 13, fontWeight: '500', color: '#111827', flex: 1 },
  itemMeta: { fontSize: 11, color: '#9ca3af', marginTop: 3 },
  itemRight: { alignItems: 'flex-end', gap: 4, marginLeft: 8 },
  severityBadge: { fontSize: 10, fontWeight: '600' },
  statusBadge: { fontSize: 10 },
  unreadDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#3b82f6' },
  empty: { textAlign: 'center', marginTop: 80, fontSize: 16, color: '#6b7280' },
});
