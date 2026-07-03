'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '../../../../features/auth/store/authStore';
import { authApi } from '../../../../features/auth/api/authApi';
import { enablePush, notificationPermission } from '../../../../features/notifications/webPush';

const ROLE_LABELS: Record<string, string> = {
  ADMIN: '⚙️ Admin',
  SUPERVISOR: '👔 Supervisor',
  WORKER: '🔧 Worker',
};

export default function Profile() {
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const clearAuth = useAuthStore((s) => s.clearAuth);
  const [perm, setPerm] = useState<string>('default');

  useEffect(() => setPerm(notificationPermission()), []);

  const handleLogout = async () => {
    if (!window.confirm('Are you sure you want to sign out?')) return;
    const refreshToken = typeof window !== 'undefined' ? localStorage.getItem('refresh_token') : null;
    if (refreshToken) {
      try {
        await authApi.logout(refreshToken);
      } catch {}
    }
    clearAuth();
    router.replace('/m/login');
  };

  if (!user) return null;

  const rows: [string, string | undefined][] = [
    ['Factory', user.factory?.name],
    ['Role', user.role],
    ['Email', user.email],
    ['User ID', user.id.slice(0, 8) + '…'],
  ];

  return (
    <div className="p-4">
      <div className="mb-4 flex flex-col items-center rounded-2xl bg-white py-8">
        <div className="flex h-20 w-20 items-center justify-center rounded-full bg-blue-100">
          <span className="text-2xl font-bold text-blue-700">
            {user.firstName[0]}
            {user.lastName[0]}
          </span>
        </div>
        <p className="mt-3 text-xl font-bold text-gray-900">
          {user.firstName} {user.lastName}
        </p>
        <p className="mt-1 text-sm text-gray-500">{user.email}</p>
        <span className="mt-2 rounded-full bg-blue-50 px-3.5 py-1 text-sm font-medium text-blue-700">
          {ROLE_LABELS[user.role] ?? user.role}
        </span>
      </div>

      <div className="mb-4 overflow-hidden rounded-2xl bg-white">
        {rows.map(([k, v]) => (
          <div key={k} className="flex justify-between border-b border-gray-100 px-4 py-3.5 last:border-0">
            <span className="text-sm text-gray-500">{k}</span>
            <span className="text-right text-sm font-medium text-gray-900">{v}</span>
          </div>
        ))}
      </div>

      {/* Notifications status */}
      <div className="mb-4 flex items-center justify-between rounded-2xl bg-white px-4 py-3.5">
        <span className="text-sm text-gray-700">Alert notifications</span>
        {perm === 'granted' ? (
          <span className="text-sm font-medium text-green-600">On ✓</span>
        ) : perm === 'unsupported' ? (
          <span className="text-sm text-gray-400">Not supported</span>
        ) : (
          <button
            onClick={async () => setPerm(await enablePush())}
            className="rounded-lg bg-blue-600 px-3 py-1.5 text-sm font-medium text-white"
          >
            Enable
          </button>
        )}
      </div>

      <button
        onClick={handleLogout}
        className="w-full rounded-xl bg-red-100 py-4 text-sm font-semibold text-red-600"
      >
        Sign Out
      </button>
    </div>
  );
}
