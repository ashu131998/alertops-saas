'use client';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { MachineCard } from '../../../components/machines/MachineCard';
import { machinesApi } from '../../../features/machines/api/machinesApi';
import type { MachineStatus } from '../../../lib/types';

const STATUS_OPTIONS: MachineStatus[] = ['ONLINE', 'OFFLINE', 'WARNING', 'CRITICAL', 'MAINTENANCE'];

export default function MachinesPage() {
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<MachineStatus | ''>('');

  const { data: machines, isLoading } = useQuery({
    queryKey: ['machines', { search, status }],
    queryFn: () => machinesApi.list({ search: search || undefined, status: status || undefined }),
    refetchInterval: 15_000,
  });

  const { data: summary } = useQuery({ queryKey: ['machine-status-summary'], queryFn: machinesApi.getStatusSummary, refetchInterval: 15_000 });

  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Machines</h1>
        <p className="mt-1 text-sm text-gray-500">{machines?.length ?? 0} machines registered</p>
      </div>

      {/* Status summary */}
      {summary && (
        <div className="mb-6 flex flex-wrap gap-3">
          {Object.entries(summary).map(([s, count]) => (
            <div key={s} className="rounded-lg border border-gray-200 bg-white px-4 py-2 text-center">
              <p className="text-lg font-bold text-gray-900">{count}</p>
              <p className="text-xs text-gray-500">{s}</p>
            </div>
          ))}
        </div>
      )}

      {/* Filters */}
      <div className="mb-6 flex flex-wrap gap-3">
        <input type="search" placeholder="Search machines..." value={search} onChange={(e) => setSearch(e.target.value)}
          className="rounded-md border border-gray-300 px-3 py-1.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500" />
        <select value={status} onChange={(e) => setStatus(e.target.value as MachineStatus | '')}
          className="rounded-md border border-gray-300 px-3 py-1.5 text-sm focus:border-blue-500 focus:outline-none">
          <option value="">All statuses</option>
          {STATUS_OPTIONS.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
      </div>

      {isLoading && <div className="space-y-2">{[...Array(5)].map((_, i) => <div key={i} className="h-16 animate-pulse rounded-lg bg-gray-100" />)}</div>}
      <div className="space-y-2">
        {machines?.map((m) => <MachineCard key={m.id} machine={m} />)}
      </div>
    </div>
  );
}
