'use client';
import { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { formatDistanceToNow } from 'date-fns';
import toast from 'react-hot-toast';
import { alertsApi } from '../../../../../features/alerts/api/alertsApi';
import type { ActionType, AvailableAction, AlertReplyOption } from '../../../../../lib/types';

const SEVERITY_COLOR: Record<string, string> = {
  CRITICAL: '#dc2626',
  HIGH: '#ea580c',
  MEDIUM: '#ca8a04',
  LOW: '#2563eb',
};

export default function AlertDetail() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const qc = useQueryClient();
  const [comment, setComment] = useState('');
  const [selectedAction, setSelectedAction] = useState<AvailableAction | null>(null);

  const { data: alert, isLoading } = useQuery({
    queryKey: ['alert', id],
    queryFn: () => alertsApi.getOne(id),
    refetchInterval: 30_000,
  });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['alert', id] });
    qc.invalidateQueries({ queryKey: ['alerts'] });
    qc.invalidateQueries({ queryKey: ['alert-stats'] });
  };

  const action = useMutation({
    mutationFn: ({ actionType, comment }: { actionType: ActionType; comment?: string }) =>
      alertsApi.takeAction(id, actionType, comment),
    onSuccess: () => {
      invalidate();
      setSelectedAction(null);
      setComment('');
      toast.success('Action completed');
    },
    onError: () => toast.error('Action failed. Please try again.'),
  });

  const respond = useMutation({
    mutationFn: (optionId: string) => alertsApi.respond(id, optionId),
    onSuccess: (res) => {
      invalidate();
      toast.success(res.message ?? 'Your response was recorded.');
    },
    onError: () => toast.error('Could not submit your response. Please try again.'),
  });

  const handleRespond = (opt: AlertReplyOption) => {
    if (window.confirm(`Submit "${opt.label}"?`)) respond.mutate(opt.id);
  };

  const handleAction = (a: AvailableAction) => {
    if (a.confirmationRequired && !a.requiresComment) {
      if (window.confirm(`Are you sure you want to ${a.label}?`)) action.mutate({ actionType: a.actionType });
    } else {
      setSelectedAction(a);
    }
  };

  if (isLoading) return <p className="mt-20 text-center text-sm text-gray-400">Loading…</p>;
  if (!alert) return <p className="m-5 text-red-600">Alert not found</p>;

  const options = alert.metadata?.options ?? [];
  const alreadyReplied = alert.timeline.some((t) => t.eventType === 'WORKER_REPLY');
  const sevColor = SEVERITY_COLOR[alert.severity] ?? '#6b7280';

  return (
    <div>
      <header className="flex items-center justify-between border-b border-gray-200 bg-white px-4 py-3">
        <button onClick={() => router.back()} className="text-sm text-blue-600">
          ← Back
        </button>
        <span
          className="rounded-full px-2.5 py-1 text-xs font-bold"
          style={{ backgroundColor: sevColor + '22', color: sevColor }}
        >
          {alert.severity}
        </span>
      </header>

      {/* Title & meta */}
      <div className="bg-white px-4 py-4">
        <p className="text-xs font-medium uppercase tracking-wide text-gray-500">
          {alert.status.replace('_', ' ')}
        </p>
        <h1 className="mt-1.5 text-lg font-bold text-gray-900">{alert.title}</h1>
        <p className="mt-1 text-xs text-gray-400">
          {(alert.machine?.name ?? alert.externalMachineName) || '—'} · {alert.factory?.name}
        </p>
        <p className="text-xs text-gray-400">
          {formatDistanceToNow(new Date(alert.createdAt), { addSuffix: true })}
        </p>
      </div>

      {/* Description */}
      <section className="mt-2 bg-white px-4 py-4">
        <h2 className="mb-2 text-sm font-semibold text-gray-700">Description</h2>
        <p className="text-sm leading-relaxed text-gray-600">{alert.description}</p>
      </section>

      {/* Interactive MCQ reply */}
      {options.length > 0 && (
        <section className="mt-2 bg-white px-4 py-4">
          {alreadyReplied ? (
            <>
              <h2 className="mb-2 text-sm font-semibold text-gray-700">Your response</h2>
              <p className="text-sm text-green-600">✅ Response submitted — see the timeline below.</p>
            </>
          ) : (
            <>
              <h2 className="mb-3 text-sm font-semibold text-gray-700">
                {alert.metadata?.prompt ?? 'Please respond'}
              </h2>
              <div className="space-y-2">
                {options.map((opt) => (
                  <button
                    key={opt.id}
                    onClick={() => handleRespond(opt)}
                    disabled={respond.isPending}
                    className="block w-full rounded-xl border-[1.5px] border-blue-200 bg-blue-50 p-3.5 text-left disabled:opacity-50"
                  >
                    <p className="text-[15px] font-semibold text-blue-700">{opt.label}</p>
                    {opt.description && <p className="mt-0.5 text-xs text-blue-500">{opt.description}</p>}
                  </button>
                ))}
              </div>
              {respond.isPending && <p className="mt-2 text-sm text-gray-400">Submitting…</p>}
            </>
          )}
        </section>
      )}

      {/* Timeline */}
      {alert.timeline.length > 0 && (
        <section className="mt-2 bg-white px-4 py-4">
          <h2 className="mb-3 text-sm font-semibold text-gray-700">Timeline</h2>
          <div className="space-y-3">
            {alert.timeline.map((entry) => (
              <div key={entry.id} className="flex gap-3">
                <span className="mt-1 h-2.5 w-2.5 shrink-0 rounded-full bg-blue-500" />
                <div>
                  <p className="text-sm text-gray-700">{entry.description}</p>
                  <p className="mt-0.5 text-xs text-gray-400">
                    {formatDistanceToNow(new Date(entry.createdAt), { addSuffix: true })}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Available actions */}
      {alert.availableActions.length > 0 && (
        <section className="mt-2 bg-white px-4 py-4">
          <h2 className="mb-3 text-sm font-semibold text-gray-700">Actions</h2>
          <div className="space-y-2">
            {alert.availableActions.map((a) => (
              <button
                key={a.actionType}
                onClick={() => handleAction(a)}
                className="block w-full rounded-xl border border-gray-200 p-3 text-left"
              >
                <p className="text-sm font-semibold text-gray-900">{a.label}</p>
                <p className="mt-0.5 text-xs text-gray-500">{a.description}</p>
              </button>
            ))}
          </div>
        </section>
      )}

      {/* Comment form */}
      {selectedAction && (
        <section className="mt-2 bg-white px-4 py-4">
          <h2 className="mb-3 text-sm font-semibold text-gray-700">{selectedAction.label}</h2>
          <textarea
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            rows={3}
            placeholder={selectedAction.requiresComment ? 'Comment is required…' : 'Add an optional comment…'}
            className="w-full rounded-lg border border-gray-300 p-3 text-sm outline-none focus:border-blue-500"
          />
          <div className="mt-3 flex gap-2.5">
            <button
              onClick={() => action.mutate({ actionType: selectedAction.actionType, comment: comment || undefined })}
              disabled={action.isPending || (!comment.trim() && selectedAction.requiresComment)}
              className="flex-1 rounded-lg bg-blue-600 py-3 text-sm font-semibold text-white disabled:bg-blue-300"
            >
              {action.isPending ? 'Submitting…' : 'Submit'}
            </button>
            <button
              onClick={() => {
                setSelectedAction(null);
                setComment('');
              }}
              className="flex-1 rounded-lg border border-gray-300 py-3 text-sm font-medium text-gray-700"
            >
              Cancel
            </button>
          </div>
        </section>
      )}

      <div className="h-10" />
    </div>
  );
}
