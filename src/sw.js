import { clientsClaim } from 'workbox-core';
import { precacheAndRoute, cleanupOutdatedCaches, createHandlerBoundToURL } from 'workbox-precaching';
import { registerRoute, NavigationRoute } from 'workbox-routing';
import { CacheFirst } from 'workbox-strategies';
import { ExpirationPlugin } from 'workbox-expiration';

// ─── TEMPORARY DIAGNOSTICS — remove after SW version confirmed ────────────────
// Unique tag per deploy. Old generateSW had no tag → absence of this message
// in the overlay proves the old SW is still controlling.
const SW_DIAG_TAG = 'injectManifest-clean-2026-07-08';

function swBroadcast(payload) {
  self.clients.matchAll({ includeUncontrolled: true, type: 'window' }).then(clients => {
    clients.forEach(c => c.postMessage({ type: 'SW_DIAG', tag: SW_DIAG_TAG, ...payload }));
  });
}

// Log SW identity on install and activate.
self.addEventListener('install', () => {
  console.log(`[SW DIAG INSTALL] tag=${SW_DIAG_TAG} url=${self.location.href}`);
  swBroadcast({ event: 'install', swURL: self.location.href });
});

self.addEventListener('activate', () => {
  console.log(`[SW DIAG ACTIVATE] tag=${SW_DIAG_TAG} url=${self.location.href}`);
  swBroadcast({ event: 'activate', swURL: self.location.href });
});

// Log every fetch the SW sees — this fires for ALL requests from controlled pages.
// If auth/me appears here → this SW (new) is seeing the request.
// If auth/me does NOT appear here → old SW intercepted it before we could log.
self.addEventListener('fetch', (event) => {
  const url = event.request.url;
  if (url.includes('/api/') || url.includes('railway.app')) {
    console.log(`[SW DIAG FETCH] tag=${SW_DIAG_TAG} url=${url} mode=${event.request.mode}`);
    swBroadcast({ event: 'fetch', url, mode: event.request.mode });
  }
});
// ─── END TEMPORARY DIAGNOSTICS ────────────────────────────────────────────────

self.skipWaiting();
clientsClaim();

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
