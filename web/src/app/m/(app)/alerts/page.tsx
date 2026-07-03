'use client';
import { useState } from 'react';
import Link from 'next/link';
import { useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { alertsApi } from '../../../../features/alerts/api/alertsApi';
import type { AlertSummary, AlertSeverity, AlertStatus } from '../../../../lib/types';

const SEVERITY_COLOR: Record<AlertSeverity, string> = {
  CRITICAL: 'text-red-600',
  HIGH: 'text-orange-600',
  MEDIUM: 'text-yellow-600',
  LOW: 'text-blue-600',
};
const SEVERITY_DOT: Record<AlertSeverity, string> = {
  CRITICAL: 'bg-red-500',
  HIGH: 'bg-orange-500',
  MEDIUM: 'bg-yellow-500',
  LOW: 'bg-blue-500',
};
const STATUS_COLOR: Record<AlertStatus, string> = {
  OPEN: 'text-red-600',
  ACKNOWLEDGED: 'text-yellow-600',
  IN_PROGRESS: 'text-purple-600',
  RESOLVED: 'text-green-600',
  CLOSED: 'text-gray-500',
};

function AlertItem({ item }: { item: AlertSummary }) {
  return (
    <Link
      href={`/m/alerts/${item.id}`}
      className={`mx-3 mt-2 flex justify-between rounded-xl bg-white p-3.5 shadow-sm ${
        !item.isRead ? 'border-l-4 border-blue-500' : ''
      }`}
    >
      <div className="flex min-w-0 flex-1 gap-2.5">
        <span className={`mt-1 h-2.5 w-2.5 shrink-0 rounded-full ${SEVERITY_DOT[item.severity]}`} />
        <div className="min-w-0">
          <p className="line-clamp-2 text-sm font-medium text-gray-900">{item.title}</p>
          <p className="mt-0.5 text-xs text-gray-400">{item.machineName}</p>
        </div>
      </div>
      <div className="ml-2 flex shrink-0 flex-col items-end gap-1">
        <span className={`text-[10px] font-semibold ${SEVERITY_COLOR[item.severity]}`}>{item.severity}</span>
        <span className={`text-[10px] ${STATUS_COLOR[item.status]}`}>{item.status.replace('_', ' ')}</span>
        {!item.isRead && <span className="h-2 w-2 rounded-full bg-blue-500" />}
      </div>
    </Link>
  );
}

export default function AlertInbox() {
  const [search, setSearch] = useState('');
  const [unreadOnly, setUnreadOnly] = useState(false);
  const qc = useQueryClient();

  const { data, fetchNextPage, hasNextPage, isFetchingNextPage, isLoading } = useInfiniteQuery({
    queryKey: ['alerts', { search, unreadOnly }],
    queryFn: ({ pageParam }) =>
      alertsApi.list({ page: pageParam, limit: 20, search: search || undefined, unreadOnly }),
    getNextPageParam: (last, all) => (last.meta.hasMore ? all.length + 1 : undefined),
    initialPageParam: 1,
    refetchInterval: 30_000,
  });

  const markAllRead = useMutation({
    mutationFn: alertsApi.markAllRead,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['alerts'] });
      qc.invalidateQueries({ queryKey: ['alert-stats'] });
    },
  });

  const alerts = data?.pages.flatMap((p) => p.data) ?? [];

  return (
    <div>
      <div className="sticky top-0 z-10 flex gap-2 border-b border-gray-200 bg-white p-3">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search alerts…"
          className="min-w-0 flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-blue-500"
        />
        <button
          onClick={() => setUnreadOnly((v) => !v)}
          className={`shrink-0 rounded-lg border px-3 text-xs font-medium ${
            unreadOnly ? 'border-blue-500 bg-blue-50 text-blue-600' : 'border-gray-300 text-gray-700'
          }`}
        >
          Unread
        </button>
        <button
          onClick={() => markAllRead.mutate()}
          className="shrink-0 rounded-lg border border-gray-300 px-3 text-xs font-medium text-gray-700"
        >
          Mark all ✓
        </button>
      </div>

      {isLoading && <p className="mt-10 text-center text-sm text-gray-400">Loading…</p>}

      {!isLoading && alerts.length === 0 && (
        <p className="mt-20 text-center text-gray-500">📭 No alerts found</p>
      )}

      <div className="pb-4">
        {alerts.map((a) => (
          <AlertItem key={a.id} item={a} />
        ))}
      </div>

      {hasNextPage && (
        <button
          onClick={() => fetchNextPage()}
          disabled={isFetchingNextPage}
          className="mx-auto mb-6 block rounded-lg bg-white px-6 py-2 text-sm font-medium text-blue-600 shadow-sm disabled:opacity-60"
        >
          {isFetchingNextPage ? 'Loading…' : 'Load more'}
        </button>
      )}
    </div>
  );
}
