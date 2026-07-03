'use client';
import { useState } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { alertsApi } from '../../../features/alerts/api/alertsApi';
import { useAuthStore } from '../../../features/auth/store/authStore';
import { enablePush, notificationPermission } from '../../../features/notifications/webPush';
import type { AlertSummary, DashboardStats } from '../../../lib/types';

const SEVERITY_DOT: Record<string, string> = {
  CRITICAL: 'bg-red-500',
  HIGH: 'bg-orange-500',
  MEDIUM: 'bg-yellow-500',
  LOW: 'bg-blue-500',
};

function PushBanner() {
  const [perm, setPerm] = useState<string>(() =>
    typeof window === 'undefined' ? 'default' : notificationPermission(),
  );
  if (perm === 'granted' || perm === 'unsupported') return null;
  return (
    <button
      onClick={async () => setPerm(await enablePush())}
      className="mx-4 mt-4 flex w-[calc(100%-2rem)] items-center gap-3 rounded-xl bg-blue-600 px-4 py-3 text-left text-white"
    >
      <span className="text-xl">🔔</span>
      <span className="flex-1 text-sm font-medium">Enable alert notifications</span>
      <span className="text-sm">Turn on →</span>
    </button>
  );
}

function StatCard({ label, value, bg, text }: { label: string; value: number; bg: string; text: string }) {
  return (
    <div className={`flex min-w-[45%] flex-1 flex-col items-center rounded-2xl p-4 ${bg}`}>
      <span className={`text-3xl font-extrabold ${text}`}>{value}</span>
      <span className={`mt-1 text-xs font-medium ${text}`}>{label}</span>
    </div>
  );
}

function AlertRow({ alert }: { alert: AlertSummary }) {
  return (
    <Link href={`/m/alerts/${alert.id}`} className="flex items-center gap-3 border-b border-gray-50 px-4 py-3">
      <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${SEVERITY_DOT[alert.severity] ?? 'bg-gray-300'}`} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-gray-900">{alert.title}</p>
        <p className="mt-0.5 text-xs text-gray-400">
          {alert.machineName} · {alert.status.replace('_', ' ')}
        </p>
      </div>
      {!alert.isRead && <span className="h-2 w-2 shrink-0 rounded-full bg-blue-500" />}
    </Link>
  );
}

export default function MobileHome() {
  const user = useAuthStore((s) => s.user);

  const { data: stats } = useQuery<DashboardStats>({
    queryKey: ['alert-stats'],
    queryFn: alertsApi.getDashboardStats,
    refetchInterval: 30_000,
  });

  const { data: recent } = useQuery({
    queryKey: ['alerts', 'recent-home'],
    queryFn: () => alertsApi.list({ limit: 5, status: 'OPEN' }),
    refetchInterval: 30_000,
  });

  return (
    <div>
      <header className="border-b border-gray-200 bg-white px-5 pb-4 pt-6">
        <h1 className="text-xl font-bold text-gray-900">Good day, {user?.firstName} 👋</h1>
        <p className="mt-0.5 text-sm text-gray-500">{user?.factory?.name}</p>
      </header>

      <PushBanner />

      <div className="flex flex-wrap gap-3 p-4">
        <StatCard label="Unread" value={stats?.unreadCount ?? 0} bg="bg-blue-100" text="text-blue-700" />
        <StatCard label="Critical" value={stats?.criticalCount ?? 0} bg="bg-red-100" text="text-red-600" />
        <StatCard label="Open" value={stats?.openCount ?? 0} bg="bg-orange-100" text="text-orange-600" />
        <StatCard label="In Progress" value={stats?.inProgressCount ?? 0} bg="bg-purple-100" text="text-purple-700" />
      </div>

      <section className="mx-4 mb-6 overflow-hidden rounded-2xl bg-white shadow-sm">
        <div className="flex items-center justify-between border-b border-gray-100 px-4 py-3">
          <h2 className="text-sm font-semibold text-gray-900">Recent Open Alerts</h2>
          <Link href="/m/alerts" className="text-xs text-blue-600">
            See all →
          </Link>
        </div>
        {recent && recent.data.length === 0 && (
          <p className="px-4 py-4 text-center text-sm text-gray-500">No open alerts — all clear! ✅</p>
        )}
        {recent?.data.map((a) => (
          <AlertRow key={a.id} alert={a} />
        ))}
      </section>
    </div>
  );
}
