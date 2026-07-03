/* AlertOps service worker — push notifications for the /m PWA. */

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

// A no-op fetch listener is required for the app to be "installable" as a PWA.
// We deliberately don't cache/intercept, so the desktop dashboard is untouched.
self.addEventListener('fetch', () => {});

self.addEventListener('push', (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch (e) {
    payload = { title: 'AlertOps', body: event.data ? event.data.text() : 'New alert' };
  }

  const title = payload.title || 'AlertOps';
  const alertId = payload.data && payload.data.alertId;

  event.waitUntil(
    self.registration.showNotification(title, {
      body: payload.body || '',
      icon: '/icon-192.png',
      badge: '/icon-192.png',
      tag: alertId ? `alert-${alertId}` : undefined,
      renotify: true,
      requireInteraction: true,
      vibrate: [200, 100, 200],
      data: payload.data || {},
    }),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const alertId = event.notification.data && event.notification.data.alertId;
  const url = alertId ? `/m/alerts/${alertId}` : '/m';

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if (client.url.includes('/m') && 'focus' in client) {
          client.navigate(url);
          return client.focus();
        }
      }
      return self.clients.openWindow(url);
    }),
  );
});
