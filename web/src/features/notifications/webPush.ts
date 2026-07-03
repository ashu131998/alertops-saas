'use client';
import { api } from '../../lib/api';

const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? '';

export function pushSupported(): boolean {
  return (
    typeof window !== 'undefined' &&
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    'Notification' in window
  );
}

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = window.atob(base64);
  const output = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) output[i] = raw.charCodeAt(i);
  return output;
}

/** Register the service worker (scoped to the whole origin, handlers only). */
export async function registerServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (!('serviceWorker' in navigator)) return null;
  try {
    return await navigator.serviceWorker.register('/sw.js');
  } catch (err) {
    console.warn('[push] SW registration failed', err);
    return null;
  }
}

/**
 * Ask for notification permission, subscribe to push, and register the
 * subscription with the backend. Safe to call repeatedly (idempotent).
 * Returns the permission state so the UI can reflect it.
 */
export async function enablePush(): Promise<NotificationPermission | 'unsupported'> {
  if (!pushSupported()) return 'unsupported';
  if (!VAPID_PUBLIC_KEY) {
    console.warn('[push] NEXT_PUBLIC_VAPID_PUBLIC_KEY is not set');
    return 'default';
  }

  const permission = await Notification.requestPermission();
  if (permission !== 'granted') return permission;

  const registration = (await navigator.serviceWorker.ready) as ServiceWorkerRegistration;

  let subscription = await registration.pushManager.getSubscription();
  if (!subscription) {
    subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY) as BufferSource,
    });
  }

  try {
    await api.post('/notifications/tokens', {
      token: JSON.stringify(subscription),
      platform: 'WEBPUSH',
    });
  } catch (err) {
    console.warn('[push] failed to register subscription with server', err);
  }

  return 'granted';
}

export function notificationPermission(): NotificationPermission | 'unsupported' {
  if (!pushSupported()) return 'unsupported';
  return Notification.permission;
}
