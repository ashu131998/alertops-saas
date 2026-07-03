'use client';
import { useEffect, useRef, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import Link from 'next/link';
import { useQueryClient } from '@tanstack/react-query';
import toast, { Toaster } from 'react-hot-toast';
import { useAuthStore } from '../../../features/auth/store/authStore';
import { enablePush, notificationPermission } from '../../../features/notifications/webPush';

const WS_URL = process.env.NEXT_PUBLIC_WS_URL ?? 'ws://localhost:4000/ws';

function useAlertSocket(accessToken: string | null) {
  const qc = useQueryClient();
  const ws = useRef<WebSocket | null>(null);
  const retry = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!accessToken) return;

    function connect() {
      if (ws.current?.readyState === WebSocket.OPEN) return;
      ws.current = new WebSocket(`${WS_URL}?token=${accessToken}`);

      ws.current.onmessage = (e) => {
        try {
          const msg = JSON.parse(e.data as string);
          if (msg.type === 'ALERT_CREATED') {
            const p = (msg as any).data ?? {};
            const title = p.title ?? 'New alert';
            const machine = p.machineName ? ` — ${p.machineName}` : '';
            toast(`🔔 ${title}${machine}`, {
              duration: 6000,
              style: { background: '#1d4ed8', color: '#fff', fontWeight: 600, fontSize: '14px' },
            });
            qc.invalidateQueries({ queryKey: ['alerts'] });
            qc.invalidateQueries({ queryKey: ['alert-stats'] });
          } else if (msg.type === 'ALERT_UPDATED' || msg.type === 'ALERT_STATUS_CHANGED') {
            qc.invalidateQueries({ queryKey: ['alerts'] });
            qc.invalidateQueries({ queryKey: ['alert-stats'] });
          } else if (msg.type === 'PING') {
            ws.current?.send(JSON.stringify({ type: 'PONG' }));
          }
        } catch {}
      };

      ws.current.onclose = () => {
        retry.current = setTimeout(connect, 4000);
      };
      ws.current.onerror = () => ws.current?.close();
    }

    connect();
    return () => {
      if (retry.current) clearTimeout(retry.current);
      ws.current?.close();
    };
  }, [accessToken, qc]);
}

const TABS = [
  { href: '/m', label: 'Home', icon: '⚡' },
  { href: '/m/alerts', label: 'Alerts', icon: '🔔' },
  { href: '/m/profile', label: 'Profile', icon: '👤' },
];

export default function AppShellLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const accessToken = useAuthStore((s) => s.accessToken);
  const [mounted, setMounted] = useState(false);

  useAlertSocket(mounted && isAuthenticated ? accessToken : null);

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (mounted && !isAuthenticated) router.replace('/m/login');
  }, [mounted, isAuthenticated, router]);

  // Keep the push subscription fresh once already granted (no prompt).
  useEffect(() => {
    if (mounted && isAuthenticated && notificationPermission() === 'granted') {
      enablePush().catch(() => {});
    }
  }, [mounted, isAuthenticated]);

  if (!mounted || !isAuthenticated) return null;

  const isActive = (href: string) => (href === '/m' ? pathname === '/m' : pathname.startsWith(href));

  return (
    <div className="flex flex-1 flex-col pb-16">
      <Toaster position="top-center" containerStyle={{ top: 12 }} />
      <main className="flex-1">{children}</main>

      <nav className="fixed inset-x-0 bottom-0 z-10 mx-auto flex max-w-md border-t border-gray-200 bg-white">
        {TABS.map((tab) => (
          <Link
            key={tab.href}
            href={tab.href}
            className={`flex flex-1 flex-col items-center gap-0.5 py-2.5 text-xs ${
              isActive(tab.href) ? 'text-blue-600' : 'text-gray-500'
            }`}
          >
            <span className="text-lg leading-none">{tab.icon}</span>
            {tab.label}
          </Link>
        ))}
      </nav>
    </div>
  );
}
