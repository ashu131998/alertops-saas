'use client';
import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { AlertCard } from '../../../components/alerts/AlertCard';
import { alertsApi } from '../../../features/alerts/api/alertsApi';
import { Button } from '../../../components/ui/Button';
import type { AlertSeverity, AlertStatus } from '../../../lib/types';

const SEVERITY_OPTIONS: AlertSeverity[] = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'];
const STATUS_OPTIONS: AlertStatus[] = ['OPEN', 'ACKNOWLEDGED', 'IN_PROGRESS', 'RESOLVED', 'CLOSED'];

export default function AlertsPage() {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [severity, setSeverity] = useState<AlertSeverity | ''>('');
  const [status, setStatus] = useState<AlertStatus | ''>('');
  const [unreadOnly, setUnreadOnly] = useState(false);
  const qc = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ['alerts', { page, search, severity, status, unreadOnly }],
    queryFn: () => alertsApi.list({ page, limit: 20, search: search || undefined, severity: severity || undefined, status: status || undefined, unreadOnly }),
    placeholderData: (prev) => prev,
  });

  const markAllRead = useMutation({
    mutationFn: alertsApi.markAllRead,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['alerts'] }); qc.invalidateQueries({ queryKey: ['alert-stats'] }); toast.success('All alerts marked as read'); },
  });

  return (
    <div className="p-6">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Alert Inbox</h1>
          <p className="mt-1 text-sm text-gray-500">{data?.meta.total ?? 0} total alerts</p>
        </div>
        <Button variant="secondary" size="sm" onClick={() => markAllRead.mutate()} loading={markAllRead.isPending}>
          Mark all read
        </Button>
      </div>

      {/* Filters */}
      <div className="mb-6 flex flex-wrap gap-3">
        <input
          type="search"
          placeholder="Search alerts..."
          value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(1); }}
          className="rounded-md border border-gray-300 px-3 py-1.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
        />
        <select
          value={severity}
          onChange={(e) => { setSeverity(e.target.value as AlertSeverity | ''); setPage(1); }}
          className="rounded-md border border-gray-300 px-3 py-1.5 text-sm focus:border-blue-500 focus:outline-none"
        >
          <option value="">All severities</option>
          {SEVERITY_OPTIONS.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
        <select
          value={status}
          onChange={(e) => { setStatus(e.target.value as AlertStatus | ''); setPage(1); }}
          className="rounded-md border border-gray-300 px-3 py-1.5 text-sm focus:border-blue-500 focus:outline-none"
        >
          <option value="">All statuses</option>
          {STATUS_OPTIONS.map((s) => <option key={s} value={s}>{s.replace('_', ' ')}</option>)}
        </select>
        <label className="flex cursor-pointer items-center gap-2 text-sm text-gray-700">
          <input type="checkbox" checked={unreadOnly} onChange={(e) => { setUnreadOnly(e.target.checked); setPage(1); }} className="rounded" />
          Unread only
        </label>
      </div>

      {/* List */}
      {isLoading && <div className="space-y-2">{[...Array(5)].map((_, i) => <div key={i} className="h-20 animate-pulse rounded-lg bg-gray-100" />)}</div>}
      {!isLoading && data?.data.length === 0 && (
        <div className="py-16 text-center text-gray-500">
          <p className="text-4xl">📭</p>
          <p className="mt-2 font-medium">No alerts found</p>
        </div>
      )}
      <div className="space-y-2">
        {data?.data.map((alert) => <AlertCard key={alert.id} alert={alert} />)}
      </div>

      {/* Pagination */}
      {data && data.meta.total > 20 && (
        <div className="mt-6 flex items-center justify-between">
          <Button variant="secondary" size="sm" disabled={page === 1} onClick={() => setPage((p) => p - 1)}>Previous</Button>
          <span className="text-sm text-gray-500">Page {page} of {Math.ceil(data.meta.total / 20)}</span>
          <Button variant="secondary" size="sm" disabled={!data.meta.hasMore} onClick={() => setPage((p) => p + 1)}>Next</Button>
        </div>
      )}
    </div>
  );
}
