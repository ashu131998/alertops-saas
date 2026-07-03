import type { Metadata, Viewport } from 'next';
import { SWRegister } from './SWRegister';

export const metadata: Metadata = {
  title: 'AlertOps',
  manifest: '/manifest.webmanifest',
  appleWebApp: { capable: true, statusBarStyle: 'default', title: 'AlertOps' },
};

export const viewport: Viewport = {
  themeColor: '#1d4ed8',
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
};

export default function MobileLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto flex min-h-screen w-full max-w-md flex-col bg-gray-50">
      <SWRegister />
      {children}
    </div>
  );
}
