import { clientsClaim } from 'workbox-core';
import { precacheAndRoute, cleanupOutdatedCaches, createHandlerBoundToURL } from 'workbox-precaching';
import { registerRoute, NavigationRoute } from 'workbox-routing';
import { CacheFirst } from 'workbox-strategies';
import { ExpirationPlugin } from 'workbox-expiration';

self.skipWaiting();
clientsClaim();

// ─── Push notification handler ────────────────────────────────────────────────
self.addEventListener('push', (event) => {
  if (!event.data) return;
  let payload = { title: 'FitCoach', body: '', url: '/', icon: '/icon-192.png' };
  try { payload = { ...payload, ...event.data.json() }; } catch {}
  event.waitUntil(
    self.registration.showNotification(payload.title, {
      body:  payload.body,
      icon:  payload.icon,
      badge: '/icon-192.png',
      tag:   'fitcoach-reminder',
      data:  { url: payload.url },
    })
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = event.notification.data?.url || '/';
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
      const existing = list.find(c => c.url.includes(self.location.origin) && 'focus' in c);
      if (existing) return existing.focus();
      return clients.openWindow(url);
    })
  );
});

precacheAndRoute(self.__WB_MANIFEST);
cleanupOutdatedCaches();

registerRoute(new NavigationRoute(createHandlerBoundToURL('index.html')));

registerRoute(
  /^https:\/\/fonts\.(googleapis|gstatic)\.com\/.*/i,
  new CacheFirst({
    cacheName: 'google-fonts',
    plugins: [new ExpirationPlugin({ maxEntries: 10, maxAgeSeconds: 60 * 60 * 24 * 365 })],
  }),
  'GET'
);

registerRoute(
  /\/assets\/.*\.js$/,
  new CacheFirst({
    cacheName: 'js-assets',
    plugins: [new ExpirationPlugin({ maxEntries: 3, maxAgeSeconds: 60 * 60 * 24 * 30 })],
  }),
  'GET'
);
