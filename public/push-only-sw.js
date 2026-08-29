/**
 * push-only-sw.js
 *
 * Minimal push-only service worker for iOS standalone PWA.
 *
 * Deliberately contains ONLY push event handlers. It does NOT:
 *   - intercept navigation requests (no NavigationRoute)
 *   - cache any assets (no CacheFirst / precache)
 *   - call clientsClaim() (does not seize control of existing pages)
 *   - call skipWaiting() (does not forcibly preempt any earlier SW)
 *   - add a fetch listener (does not touch API calls)
 *
 * Safe for iOS PWA mode:
 *   - No fetch listener    → cannot cause iOS cross-origin fetch-freeze
 *   - No NavigationRoute   → navigation falls through to network (no white-screen risk)
 *   - No clientsClaim      → does not seize control of existing page clients
 *   - No caching           → iOS guard's cache-clear has nothing to destroy
 *
 * The iOS index.html guard keeps this SW alive across PWA restarts (it only removes
 * legacy Workbox registrations whose scriptURL does not contain 'push-only-sw.js').
 * Push subscriptions therefore persist across PWA close/reopen on iOS 16.4+.
 *
 * iOS storage isolation: iOS Home Screen PWAs run in a separate web app context from
 * the Safari browser (separate SW/cache/localStorage storage). Safari's execution of
 * the iOS guard never touches this file's registration.
 *
 * Non-iOS platforms use the full sw.js (registered by index.html at boot).
 * This file is registered on iOS PWA only, after explicit user action.
 */

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
