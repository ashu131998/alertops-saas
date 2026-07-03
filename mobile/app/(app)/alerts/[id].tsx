import { useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, TextInput, StyleSheet, Alert, ActivityIndicator } from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { formatDistanceToNow } from 'date-fns';
import { alertsApi } from '../../../features/alerts/alertsApi';
import type { ActionType, AvailableAction, AlertReplyOption } from '../../../lib/types';

const SEVERITY_COLOR: Record<string, string> = { CRITICAL: '#dc2626', HIGH: '#ea580c', MEDIUM: '#ca8a04', LOW: '#2563eb' };

export default function AlertDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const qc = useQueryClient();
  const [comment, setComment] = useState('');
  const [selectedAction, setSelectedAction] = useState<AvailableAction | null>(null);

  const { data: alert, isLoading } = useQuery({
    queryKey: ['alert', id],
    queryFn: () => alertsApi.getOne(id!),
  });

  const action = useMutation({
    mutationFn: ({ actionType, comment }: { actionType: ActionType; comment?: string }) =>
      alertsApi.takeAction(id!, actionType, comment),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['alert', id] });
      qc.invalidateQueries({ queryKey: ['alerts'] });
      qc.invalidateQueries({ queryKey: ['alert-stats'] });
      setSelectedAction(null);
      setComment('');
      Alert.alert('Success', 'Action completed');
    },
    onError: () => Alert.alert('Error', 'Action failed. Please try again.'),
  });

  const respond = useMutation({
    mutationFn: (optionId: string) => alertsApi.respond(id!, optionId),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ['alert', id] });
      qc.invalidateQueries({ queryKey: ['alerts'] });
      qc.invalidateQueries({ queryKey: ['alert-stats'] });
      Alert.alert(res.ok ? 'Sent' : 'Saved', res.message ?? res.error ?? 'Your response was recorded.');
    },
    onError: () => Alert.alert('Error', 'Could not submit your response. Please try again.'),
  });

  const handleRespond = (opt: AlertReplyOption) => {
    Alert.alert('Confirm', `Submit "${opt.label}"?`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Submit', onPress: () => respond.mutate(opt.id) },
    ]);
  };

  const handleAction = (a: AvailableAction) => {
    if (a.confirmationRequired && !a.requiresComment) {
      Alert.alert('Confirm', `Are you sure you want to ${a.label}?`, [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Confirm', style: 'destructive', onPress: () => action.mutate({ actionType: a.actionType }) },
      ]);
    } else {
      setSelectedAction(a);
    }
  };

  if (isLoading) return <ActivityIndicator style={styles.loader} color="#2563eb" />;
  if (!alert) return <Text style={styles.error}>Alert not found</Text>;

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.back}>
          <Text style={styles.backText}>← Back</Text>
        </TouchableOpacity>
        <View style={[styles.severityBadge, { backgroundColor: SEVERITY_COLOR[alert.severity] + '22' }]}>
          <Text style={[styles.severityText, { color: SEVERITY_COLOR[alert.severity] }]}>{alert.severity}</Text>
        </View>
      </View>

      <ScrollView style={styles.scroll}>
        {/* Title & Meta */}
        <View style={styles.section}>
          <Text style={styles.status}>{alert.status.replace('_', ' ')}</Text>
          <Text style={styles.title}>{alert.title}</Text>
          <Text style={styles.meta}>{(alert.machine?.name ?? alert.externalMachineName) || '—'} · {alert.factory?.name}</Text>
          <Text style={styles.meta}>{formatDistanceToNow(new Date(alert.createdAt), { addSuffix: true })}</Text>
        </View>

        {/* Description */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Description</Text>
          <Text style={styles.description}>{alert.description}</Text>
        </View>

        {/* Interactive reply — downtime reason / config selection */}
        {(() => {
          const options = alert.metadata?.options ?? [];
          const alreadyReplied = alert.timeline.some((t) => t.eventType === 'WORKER_REPLY');
          if (options.length === 0) return null;
          if (alreadyReplied) {
            return (
              <View style={styles.card}>
                <Text style={styles.cardTitle}>Your response</Text>
                <Text style={styles.repliedNote}>✅ Response submitted — see the timeline below.</Text>
              </View>
            );
          }
          return (
            <View style={styles.card}>
              <Text style={styles.cardTitle}>{alert.metadata?.prompt ?? 'Please respond'}</Text>
              {options.map((opt) => (
                <TouchableOpacity
                  key={opt.id}
                  style={[styles.optionBtn, respond.isPending && styles.optionBtnDisabled]}
                  onPress={() => handleRespond(opt)}
                  disabled={respond.isPending}
                >
                  <Text style={styles.optionLabel}>{opt.label}</Text>
                  {opt.description ? <Text style={styles.optionDesc}>{opt.description}</Text> : null}
                </TouchableOpacity>
              ))}
              {respond.isPending && <ActivityIndicator style={{ marginTop: 8 }} color="#2563eb" />}
            </View>
          );
        })()}

        {/* Timeline */}
        {alert.timeline.length > 0 && (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Timeline</Text>
            {alert.timeline.map((entry) => (
              <View key={entry.id} style={styles.timelineItem}>
                <View style={styles.timelineDot} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.timelineDesc}>{entry.description}</Text>
                  <Text style={styles.timelineTime}>{formatDistanceToNow(new Date(entry.createdAt), { addSuffix: true })}</Text>
                </View>
              </View>
            ))}
          </View>
        )}

        {/* Available Actions */}
        {alert.availableActions.length > 0 && (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Actions</Text>
            {alert.availableActions.map((a) => (
              <TouchableOpacity key={a.actionType} style={styles.actionBtn} onPress={() => handleAction(a)}>
                <Text style={styles.actionLabel}>{a.label}</Text>
                <Text style={styles.actionDesc}>{a.description}</Text>
              </TouchableOpacity>
            ))}
          </View>
        )}

        {/* Comment form */}
        {selectedAction && (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>{selectedAction.label}</Text>
            <TextInput
              style={styles.commentInput}
              value={comment}
              onChangeText={setComment}
              placeholder={selectedAction.requiresComment ? 'Comment is required...' : 'Add an optional comment...'}
              placeholderTextColor="#9ca3af"
              multiline
              numberOfLines={3}
            />
            <View style={styles.commentButtons}>
              <TouchableOpacity
                style={[styles.submitBtn, (!comment.trim() && selectedAction.requiresComment) && styles.submitBtnDisabled]}
                onPress={() => action.mutate({ actionType: selectedAction.actionType, comment: comment || undefined })}
                disabled={action.isPending || (!comment.trim() && selectedAction.requiresComment)}
              >
                {action.isPending ? <ActivityIndicator color="#fff" size="small" /> : <Text style={styles.submitText}>Submit</Text>}
              </TouchableOpacity>
              <TouchableOpacity style={styles.cancelBtn} onPress={() => { setSelectedAction(null); setComment(''); }}>
                <Text style={styles.cancelText}>Cancel</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        <View style={{ height: 40 }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f9fafb' },
  loader: { flex: 1, justifyContent: 'center' } as any,
  error: { margin: 20, color: '#dc2626' },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12, backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#e5e7eb', paddingTop: 56 },
  back: { padding: 4 },
  backText: { color: '#2563eb', fontSize: 15 },
  severityBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20 },
  severityText: { fontSize: 12, fontWeight: '700' },
  scroll: { flex: 1 },
  section: { backgroundColor: '#fff', padding: 16, marginBottom: 8 },
  status: { fontSize: 12, color: '#6b7280', fontWeight: '500', textTransform: 'uppercase', letterSpacing: 0.5 },
  title: { fontSize: 20, fontWeight: '700', color: '#111827', marginTop: 6 },
  meta: { fontSize: 13, color: '#9ca3af', marginTop: 4 },
  card: { backgroundColor: '#fff', padding: 16, marginHorizontal: 0, marginBottom: 8 },
  cardTitle: { fontSize: 14, fontWeight: '600', color: '#374151', marginBottom: 12 },
  description: { fontSize: 14, color: '#4b5563', lineHeight: 22 },
  timelineItem: { flexDirection: 'row', gap: 12, marginBottom: 12 },
  timelineDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: '#3b82f6', marginTop: 4 },
  timelineDesc: { fontSize: 13, color: '#374151' },
  timelineTime: { fontSize: 11, color: '#9ca3af', marginTop: 2 },
  actionBtn: { borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 10, padding: 12, marginBottom: 8 },
  actionLabel: { fontSize: 14, fontWeight: '600', color: '#111827' },
  actionDesc: { fontSize: 12, color: '#6b7280', marginTop: 2 },
  optionBtn: { borderWidth: 1.5, borderColor: '#bfdbfe', backgroundColor: '#eff6ff', borderRadius: 10, padding: 14, marginBottom: 8 },
  optionBtnDisabled: { opacity: 0.5 },
  optionLabel: { fontSize: 15, fontWeight: '600', color: '#1d4ed8' },
  optionDesc: { fontSize: 12, color: '#3b82f6', marginTop: 2 },
  repliedNote: { fontSize: 13, color: '#059669' },
  commentInput: { borderWidth: 1, borderColor: '#d1d5db', borderRadius: 8, padding: 12, fontSize: 14, color: '#111827', minHeight: 80, textAlignVertical: 'top' },
  commentButtons: { flexDirection: 'row', gap: 10, marginTop: 12 },
  submitBtn: { flex: 1, backgroundColor: '#2563eb', borderRadius: 8, paddingVertical: 12, alignItems: 'center' },
  submitBtnDisabled: { backgroundColor: '#93c5fd' },
  submitText: { color: '#fff', fontWeight: '600' },
  cancelBtn: { flex: 1, borderWidth: 1, borderColor: '#d1d5db', borderRadius: 8, paddingVertical: 12, alignItems: 'center' },
  cancelText: { color: '#374151', fontWeight: '500' },
});
