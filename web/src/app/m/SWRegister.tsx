'use client';
import { useEffect } from 'react';
import { registerServiceWorker } from '../../features/notifications/webPush';

/** Registers the push service worker once, on mount. Renders nothing. */
export function SWRegister() {
  useEffect(() => {
    registerServiceWorker();
  }, []);
  return null;
}
