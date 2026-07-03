'use client';
import { useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuthStore } from '../../../features/auth/store/authStore';
import { enablePush, notificationPermission } from '../../../features/notifications/webPush';

const TABS = [
  { href: '/m', label: 'Home', icon: '⚡' },
  { href: '/m/alerts', label: 'Alerts', icon: '🔔' },
  { href: '/m/profile', label: 'Profile', icon: '👤' },
];

export default function AppShellLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const [mounted, setMounted] = useState(false);

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
