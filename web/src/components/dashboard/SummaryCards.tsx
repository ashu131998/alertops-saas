'use client';
import { useQuery } from '@tanstack/react-query';
import { alertsApi } from '../../features/alerts/api/alertsApi';
import clsx from 'clsx';

interface Card {
  label: string;
  key: string;
  color: string;
  icon: string;
}

const CARDS: Card[] = [
  { label: 'Unread', key: 'unreadCount', color: 'bg-blue-50 text-blue-700', icon: '📬' },
  { label: 'Critical', key: 'criticalCount', color: 'bg-red-50 text-red-700', icon: '🚨' },
  { label: 'Open', key: 'openCount', color: 'bg-orange-50 text-orange-700', icon: '🔓' },
  { label: 'In Progress', key: 'inProgressCount', color: 'bg-purple-50 text-purple-700', icon: '🔧' },
  { label: 'Resolved', key: 'resolvedCount', color: 'bg-green-50 text-green-700', icon: '✅' },
];

export function SummaryCards() {
  const { data, isLoading } = useQuery({ queryKey: ['alert-stats'], queryFn: alertsApi.getDashboardStats, refetchInterval: 30_000 });

  if (isLoading) {
    return (
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
        {CARDS.map((c) => (
          <div key={c.key} className="h-24 animate-pulse rounded-xl bg-gray-100" />
        ))}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
      {CARDS.map(({ label, key, color, icon }) => (
        <div key={key} className={clsx('rounded-xl p-4', color)}>
          <p className="text-2xl">{icon}</p>
          <p className="mt-2 text-3xl font-bold">{(data as any)?.[key] ?? 0}</p>
          <p className="text-sm font-medium opacity-80">{label}</p>
        </div>
      ))}
    </div>
  );
}
