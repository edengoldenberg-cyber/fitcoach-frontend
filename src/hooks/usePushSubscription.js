/**
 * usePushSubscription.js
 *
 * Core hook for push notification state management.
 *
 * Status values:
 *   'unsupported'    — browser/device cannot support push (no PushManager)
 *   'ios_safari'     — iOS Safari (non-standalone): Push requires Home Screen PWA install
 *   'blocked'        — user denied permission (cannot prompt again)
 *   'no_permission'  — permission default, user hasn't been asked yet
 *   'no_registration'— permission granted but no browser PushSubscription
 *   'not_synced'     — browser subscription exists but missing from DB
 *   'active'         — fully registered, subscription in DB and active
 *
 * iOS architecture:
 *   Regular iOS Safari → 'ios_safari'. No SW attempt, no register button.
 *   iOS standalone PWA → register /push-only-sw.js after explicit user action.
 *     push-only-sw has NO NavigationRoute, NO caching, NO clientsClaim.
 *     It cannot cause white screens or network freezes.
 *     The index.html guard keeps push-only-sw.js alive across PWA restarts
 *     (it only removes legacy sw.js registrations by scriptURL inspection).
 *     Push subscriptions persist across close/reopen on iOS 16.4+.
 *   Non-iOS → Push works fully: sw.js registered at boot, persists across sessions.
 *
 * Push failure invariant: any failure (SW, PushManager, permission, backend) produces
 * only a toast error and a status change. The app shell is already mounted and functional
 * before any Push operation begins. No reload, no unregister, no boot coupling.
 *
 * Security: trainee_email is always taken from the JWT via the backend;
 * userEmail is used only to scope queries (not trusted for writes).
 */

import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { toast } from 'sonner';

const VAPID_PUBLIC_KEY = 'BLYV4o1VzRU6RAseJHuj0YOyPhV9fkkC_NNR38jKtXbCcOHTIYe1zK7UdxT6Sg433UwOnGXngdUqw-s_VV003HY';

// Maximum milliseconds to wait for an active SW registration before giving up.
const SW_READY_TIMEOUT_MS = 12_000;

// push-only-sw.js is used for iOS PWA mode.
// It contains only push/notificationclick handlers — no navigation interception,
// no caching, no clientsClaim. Safe for iOS: cannot cause white screen or fetch freeze.
const PUSH_ONLY_SW_PATH = '/push-only-sw.js';

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - base64String.length % 4) % 4);
  const base64  = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const output  = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; i++) output[i] = rawData.charCodeAt(i);
  return output;
}

function detectDeviceType() {
  const ua = navigator.userAgent;
  if (/android/i.test(ua)) return 'android';
  if (/iPad|iPhone|iPod/.test(ua)) return 'ios';
  return 'desktop';
}

/**
 * Returns iOS-specific Push capability:
 *   'pwa'    — iOS standalone PWA (window.navigator.standalone === true) — Push works
 *   'safari' — iOS Safari browser tab — Push not available without Home Screen install
 *   null     — not iOS
 *
 * Uses ONLY window.navigator.standalone (native iOS WebKit boolean).
 * Does NOT use matchMedia('display-mode: standalone') — that API is unreliable
 * on iOS at React init time and caused a production white-screen P0 when used
 * in index.html boot-path logic.
 */
export function detectIosCapability() {
  if (typeof navigator === 'undefined') return null;
  const ua = navigator.userAgent;
  const isIos = /iP(hone|od|ad)/.test(ua) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  if (!isIos) return null;
  // navigator.standalone: true = standalone PWA, false/undefined = Safari browser tab
  return window.navigator.standalone === true ? 'pwa' : 'safari';
}

/**
 * Returns the active ServiceWorkerRegistration within the timeout, or null.
 * Prevents an infinite hang when no SW is registered or activating.
 * Callers must handle null gracefully (show error, do not crash or reload).
 */
async function getActiveRegistration() {
  try {
    return await Promise.race([
      navigator.serviceWorker.ready,
      new Promise(resolve => setTimeout(() => resolve(null), SW_READY_TIMEOUT_MS)),
    ]);
  } catch {
    return null;
  }
}

export function usePushSubscription(userEmail) {
  const queryClient = useQueryClient();

  // iOS capability is stable within a session — computed once at mount.
  const [iosCapability] = useState(() => {
    if (typeof navigator === 'undefined') return null;
    return detectIosCapability();
  });

  const [permission, setPermission] = useState(() => {
    if (typeof Notification === 'undefined') return 'unsupported';
    return Notification.permission;
  });
  const [browserSub, setBrowserSub] = useState(null);
  const [swReady,    setSwReady]    = useState(false);
  const [isChecking, setIsChecking] = useState(false);

  // Active DB subscriptions for this user
  const { data: dbSubs = [], refetch: refetchDbSubs } = useQuery({
    queryKey: ['pushSubscriptions', userEmail],
    queryFn:  () => base44.entities.PushSubscription.filter({
      trainee_email: userEmail,
      is_active:     true,
    }),
    enabled:   !!userEmail,
    staleTime: 30_000,
  });

  // Check browser state on mount and when userEmail changes.
  // iOS Safari: skipped — no SW available, status derives entirely from iosCapability.
  // iOS PWA + others: wait for active SW (with timeout — never hangs).
  useEffect(() => {
    if (!userEmail) return;
    if (iosCapability === 'safari') return; // no SW on iOS Safari — status is 'ios_safari'

    let cancelled = false;

    async function checkBrowserState() {
      setIsChecking(true);
      try {
        if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
          setPermission('unsupported');
          return;
        }
        setPermission(Notification.permission);

        const reg = await getActiveRegistration();
        if (!reg) {
          setSwReady(false);
          setBrowserSub(null);
          return;
        }
        setSwReady(true);
        const sub = await reg.pushManager.getSubscription();
        if (!cancelled) setBrowserSub(sub || null);
      } catch {
        // Non-fatal: gracefully fall through to 'no_registration'.
      } finally {
        if (!cancelled) setIsChecking(false);
      }
    }

    checkBrowserState();
    return () => { cancelled = true; };
  }, [userEmail, iosCapability]);

  // ─── Derived status ─────────────────────────────────────────────────────────
  const status = (() => {
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) return 'unsupported';
    if (permission === 'denied')     return 'blocked';
    // iOS 16.4+ Safari: PushManager exists but Push requires standalone PWA.
    if (iosCapability === 'safari')  return 'ios_safari';
    if (permission !== 'granted')    return 'no_permission';
    if (!browserSub)                 return 'no_registration';
    if (dbSubs.length === 0)         return 'not_synced';
    return 'active';
  })();

  // ─── Subscribe ─────────────────────────────────────────────────────────────
  const subscribeMutation = useMutation({
    mutationFn: async () => {
      // Guard: iOS Safari cannot register Push — guide the user to install as PWA.
      // This is a user-facing error, not a crash. The app is already rendered and healthy.
      if (iosCapability === 'safari') {
        throw new Error(
          'כדי לקבל התראות באייפון, יש להוסיף את FitCoach למסך הבית תחילה:\n' +
          'לחץ על ⎙ ← "הוסף למסך הבית" ← פתח מהמסך הראשי.'
        );
      }

      // 1. Request permission if needed (only on explicit user action — never auto-prompted)
      if (Notification.permission !== 'granted') {
        const result = await Notification.requestPermission();
        setPermission(result);
        if (result !== 'granted') {
          throw new Error(
            result === 'denied'
              ? 'ההרשאה להתראות נדחתה. ניתן לשנות בהגדרות הדפדפן/המכשיר.'
              : 'ההרשאה להתראות לא ניתנה.'
          );
        }
      }

      // 2. Ensure a SW is registered.
      //
      //    Non-iOS: sw.js is already registered by index.html at page load.
      //      getRegistration returns it; no re-registration needed.
      //
      //    iOS PWA: no SW exists at React mount time (guard only left push-only-sw.js alone
      //      if it was already registered, or cleared nothing since there was nothing to clear).
      //      We register push-only-sw.js — a minimal SW with ONLY push/notificationclick.
      //      It has no NavigationRoute, no caching, no clientsClaim.
      //      It cannot cause white screens or freeze API calls.
      //      The index.html guard preserves it on future launches (scriptURL check).
      const existingReg = await navigator.serviceWorker.getRegistration('/');
      if (!existingReg) {
        const swPath = iosCapability === 'pwa' ? PUSH_ONLY_SW_PATH : '/sw.js';
        try {
          await navigator.serviceWorker.register(swPath, { scope: '/' });
        } catch (err) {
          throw new Error(`לא ניתן לרשום את Service Worker: ${err.message || err}`);
        }
      }

      // 3. Wait for the active SW. Uses resolved value (not stale getRegistration ref).
      //    Timeout prevents infinite hang if SW fails to activate.
      const reg = await getActiveRegistration();
      if (!reg) {
        throw new Error(
          'ה-Service Worker לא הוכן בזמן. נסה שוב.'
        );
      }
      setSwReady(true);

      // 4. Reuse existing browser subscription if present; create a new one otherwise.
      let sub;
      try {
        sub = await reg.pushManager.getSubscription();
        if (!sub) {
          sub = await reg.pushManager.subscribe({
            userVisibleOnly:      true,
            applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
          });
        }
      } catch (err) {
        throw new Error(`לא הצלחנו ליצור מנוי להתראות: ${err.message || err}`);
      }
      setBrowserSub(sub);

      // 5. Persist to backend (upsert — safe to call multiple times for same device)
      const subJson = sub.toJSON();
      const result = await base44.functions.invoke('registerPushSubscription', {
        endpoint:    subJson.endpoint,
        p256dh:      subJson.keys.p256dh,
        auth:        subJson.keys.auth,
        device_type: detectDeviceType(),
      });

      // Backend returns { ok: false } with HTTP 200 on failure — must check explicitly.
      if (!result?.ok) {
        throw new Error(result?.error || 'שגיאה בשמירת הרישום בשרת. נסה שוב.');
      }

      return sub;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pushSubscriptions', userEmail] });
    },
    onError: (err) => {
      toast.error(err?.message || 'לא הצלחנו לרשום את המכשיר. נסה שוב.');
    },
  });

  // ─── Unsubscribe ───────────────────────────────────────────────────────────
  const unsubscribeMutation = useMutation({
    mutationFn: async () => {
      const reg = await navigator.serviceWorker.getRegistration('/');
      const sub = await reg?.pushManager.getSubscription();
      const endpoint = sub?.endpoint || browserSub?.endpoint;

      if (sub) await sub.unsubscribe();
      setBrowserSub(null);

      if (endpoint) {
        await base44.functions.invoke('unregisterPushSubscription', { endpoint });
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pushSubscriptions', userEmail] });
    },
    onError: (err) => {
      toast.error(err?.message || 'שגיאה בניתוק ההתראות.');
    },
  });

  return {
    status,
    iosCapability,
    permission,
    swReady,
    browserSub,
    dbSubs,
    isChecking,
    subscribe:          subscribeMutation.mutate,
    unsubscribe:        unsubscribeMutation.mutate,
    isSubscribing:      subscribeMutation.isPending,
    isUnsubscribing:    unsubscribeMutation.isPending,
    subscribeError:     subscribeMutation.error,
    unsubscribeError:   unsubscribeMutation.error,
    refetch:            refetchDbSubs,
  };
}
