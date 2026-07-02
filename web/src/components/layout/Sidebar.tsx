'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import clsx from 'clsx';
import { useAuthStore } from '../../features/auth/store/authStore';

const NAV = [
  { href: '/dashboard', label: 'Dashboard', icon: '⚡' },
  { href: '/dashboard/alerts', label: 'Alerts', icon: '🔔' },
  { href: '/dashboard/machines', label: 'Machines', icon: '⚙️' },
  { href: '/dashboard/factories', label: 'Factories', icon: '🏭' },
];

export function Sidebar() {
  const pathname = usePathname();
  const { user, clearAuth } = useAuthStore();

  return (
    <aside className="flex h-screen w-64 flex-col border-r border-gray-200 bg-white">
      <div className="flex h-16 items-center gap-2 border-b border-gray-200 px-6">
        <span className="text-2xl">🏭</span>
        <span className="text-lg font-bold text-gray-900">AlertOps</span>
      </div>

      <nav className="flex-1 overflow-y-auto px-4 py-4">
        <ul className="space-y-1">
          {NAV.map(({ href, label, icon }) => (
            <li key={href}>
              <Link
                href={href}
                className={clsx(
                  'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                  pathname === href || pathname.startsWith(href + '/')
                    ? 'bg-blue-50 text-blue-700'
                    : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900',
                )}
              >
                <span>{icon}</span>
                {label}
              </Link>
            </li>
          ))}
        </ul>
      </nav>

      <div className="border-t border-gray-200 p-4">
        <div className="mb-3 text-xs text-gray-500">
          <p className="font-medium text-gray-700">{user?.firstName} {user?.lastName}</p>
          <p>{user?.role} · {user?.factory?.name}</p>
        </div>
        <button
          onClick={clearAuth}
          className="w-full rounded-md bg-gray-100 px-3 py-2 text-sm text-gray-600 hover:bg-gray-200"
        >
          Sign out
        </button>
      </div>
    </aside>
  );
}
