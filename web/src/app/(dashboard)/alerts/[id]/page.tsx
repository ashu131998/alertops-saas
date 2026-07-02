'use client';
import { useState } from 'react';
import { useParams } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { formatDistanceToNow } from 'date-fns';
import toast from 'react-hot-toast';
import { alertsApi } from '../../../../features/alerts/api/alertsApi';
import { AlertTimeline } from '../../../../components/alerts/AlertTimeline';
import { Badge, severityVariant, statusVariant } from '../../../../components/ui/Badge';
import { Button } from '../../../../components/ui/Button';
import type { ActionType } from '../../../../lib/types';

export default function AlertDetailPage() {
  const { id } = useParams<{ id: string }>();
  const qc = useQueryClient();
  const [selectedAction, setSelectedAction] = useState<ActionType | null>(null);
  const [comment, setComment] = useState('');
  const [showConfirm, setShowConfirm] = useState(false);

  const { data: alert, isLoading } = useQuery({
    queryKey: ['alert', id],
    queryFn: () => alertsApi.getOne(id),
  });

  const action = useMutation({
    mutationFn: ({ actionType, comment }: { actionType: ActionType; comment?: string }) =>
      alertsApi.takeAction(id, actionType, comment),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['alert', id] });
      qc.invalidateQueries({ queryKey: ['alerts'] });
      qc.invalidateQueries({ queryKey: ['alert-stats'] });
      setSelectedAction(null);
      setComment('');
      setShowConfirm(false);
      toast.success('Action completed');
    },
    onError: () => toast.error('Action failed'),
  });

  if (isLoading) return <div className="p-6 text-sm text-gray-500">Loading...</div>;
  if (!alert) return <div className="p-6 text-sm text-red-500">Alert not found</div>;

  const selectedActionDef = alert.availableActions.find((a) => a.actionType === selectedAction);

  const handleActionClick = (actionType: ActionType) => {
    setSelectedAction(actionType);
    const def = alert.availableActions.find((a) => a.actionType === actionType);
    if (def?.confirmationRequired) setShowConfirm(true);
    else if (!def?.requiresComment) {
      action.mutate({ actionType });
    }
  };

  const handleSubmit = () => {
    if (!selectedAction) return;
    action.mutate({ actionType: selectedAction, comment: comment || undefined });
  };

  return (
    <div className="p-6">
      {/* Header */}
      <div className="mb-6">
        <div className="flex flex-wrap items-center gap-2">
          <Badge label={alert.severity} variant={severityVariant(alert.severity)} />
          <Badge label={alert.status.replace('_', ' ')} variant={statusVariant(alert.status)} />
        </div>
        <h1 className="mt-2 text-2xl font-bold text-gray-900">{alert.title}</h1>
        <p className="mt-1 text-sm text-gray-500">
          {alert.machine?.name} · {alert.factory?.name} ·{' '}
          {formatDistanceToNow(new Date(alert.createdAt), { addSuffix: true })}
        </p>
      </div>

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-3">
        {/* Main content */}
        <div className="space-y-6 lg:col-span-2">
          <section className="rounded-xl border border-gray-200 bg-white p-6">
            <h2 className="font-semibold text-gray-900">Description</h2>
            <p className="mt-2 text-sm text-gray-700">{alert.description}</p>
          </section>

          <section className="rounded-xl border border-gray-200 bg-white p-6">
            <h2 className="mb-4 font-semibold text-gray-900">Timeline</h2>
            <AlertTimeline entries={alert.timeline} />
          </section>
        </div>

        {/* Actions panel */}
        <div className="space-y-4">
          {/* Machine info */}
          <div className="rounded-xl border border-gray-200 bg-white p-4">
            <h3 className="text-sm font-semibold text-gray-700">Machine</h3>
            <p className="mt-1 font-medium text-gray-900">{alert.machine?.name}</p>
            <p className="text-sm text-gray-500">{alert.machine?.location}</p>
          </div>

          {/* Actions */}
          {alert.availableActions.length > 0 && (
            <div className="rounded-xl border border-gray-200 bg-white p-4">
              <h3 className="mb-3 text-sm font-semibold text-gray-700">Actions</h3>
              <div className="space-y-2">
                {alert.availableActions.map((a) => (
                  <button
                    key={a.actionType}
                    onClick={() => handleActionClick(a.actionType)}
                    className="w-full rounded-lg border border-gray-200 px-3 py-2 text-left text-sm transition-colors hover:bg-gray-50"
                  >
                    <p className="font-medium text-gray-900">{a.label}</p>
                    <p className="text-xs text-gray-500">{a.description}</p>
                  </button>
                ))}
              </div>

              {/* Comment input for actions that need it */}
              {selectedActionDef?.requiresComment && (
                <div className="mt-3">
                  <textarea
                    value={comment}
                    onChange={(e) => setComment(e.target.value)}
                    placeholder="Add a comment..."
                    rows={3}
                    className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                  <div className="mt-2 flex gap-2">
                    <Button size="sm" onClick={handleSubmit} loading={action.isPending} disabled={!comment.trim()}>
                      Submit
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => { setSelectedAction(null); setComment(''); }}>
                      Cancel
                    </Button>
                  </div>
                </div>
              )}

              {/* Confirmation */}
              {showConfirm && selectedActionDef?.confirmationRequired && !selectedActionDef.requiresComment && (
                <div className="mt-3 rounded-lg bg-yellow-50 p-3">
                  <p className="text-sm text-yellow-800">Confirm: {selectedActionDef.label}?</p>
                  <div className="mt-2 flex gap-2">
                    <Button size="sm" onClick={handleSubmit} loading={action.isPending}>Confirm</Button>
                    <Button size="sm" variant="ghost" onClick={() => { setShowConfirm(false); setSelectedAction(null); }}>Cancel</Button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
