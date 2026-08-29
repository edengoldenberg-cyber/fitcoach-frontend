/**
 * usePushSubscription.js
 *
 * Core hook for push notification state management.
 *
 * Status values:
 *   'unsupported'    — browser cannot support push
 *   'blocked'        — user denied permission (cannot prompt again)
 *   'no_permission'  — permission default, user hasn't been asked yet
 *   'no_registration'— permission granted but no browser PushSubscription
 *   'not_synced'     — browser subscription exists but missing from DB
 *   'active'         — fully registered, subscription in DB and active
 *
 * Security: trainee_email is always taken from the JWT via the backend;
 * the userEmail prop is used only to scope queries (not trusted for writes).
 */

import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { toast } from 'sonner';

const VAPID_PUBLIC_KEY = 'BLYV4o1VzRU6RAseJHuj0YOyPhV9fkkC_NNR38jKtXbCcOHTIYe1zK7UdxT6Sg433UwOnGXngdUqw-s_VV003HY';

// Milliseconds to wait for navigator.serviceWorker.ready before giving up.
// Keeps iOS (which may have no SW) from hanging indefinitely.
const SW_READY_TIMEOUT_MS = 12_000;

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

// Returns the active ServiceWorkerRegistration within the timeout, or null.
// Prevents an infinite hang on iOS where the guard may have unregistered all SWs.
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
  // Uses getActiveRegistration() so we don't return early when the SW is still
  // installing (which would leave browserSub=null forever until remount).
  useEffect(() => {
    if (!userEmail) return;
    let cancelled = false;

    async function checkBrowserState() {
      setIsChecking(true);
      try {
        if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
          setPermission('unsupported');
          return;
        }
        setPermission(Notification.permission);

        // Wait for an active registration. On iOS without a SW this times out
        // and correctly resolves to null → status stays no_registration (not hung).
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
        // Non-fatal; gracefully fall through to 'no_registration' status
      } finally {
        if (!cancelled) setIsChecking(false);
      }
    }

    checkBrowserState();
    return () => { cancelled = true; };
  }, [userEmail]);

  // Derived status — combines browser + DB state
  const status = (() => {
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) return 'unsupported';
    if (permission === 'denied')    return 'blocked';
    if (permission !== 'granted')   return 'no_permission';
    if (!browserSub)                return 'no_registration';
    if (dbSubs.length === 0)        return 'not_synced';
    return 'active';
  })();

  // ─── Subscribe ─────────────────────────────────────────────────────────────
  const subscribeMutation = useMutation({
    mutationFn: async () => {
      // 1. Request permission if needed
      if (Notification.permission !== 'granted') {
        const result = await Notification.requestPermission();
        setPermission(result);
        if (result !== 'granted') {
          throw new Error(
            result === 'denied'
              ? 'ההרשאה להתראות נדחתה. ניתן לשנות זאת בהגדרות הדפדפן/המכשיר.'
              : 'ההרשאה להתראות לא ניתנה.'
          );
        }
      }

      // 2. Ensure SW is registered (registers one if none exists)
      const existingReg = await navigator.serviceWorker.getRegistration('/');
      if (!existingReg) {
        await navigator.serviceWorker.register('/sw.js', { scope: '/', type: 'classic' });
      }

      // 3. Wait for the active SW (use the resolved value — not the stale getRegistration ref)
      const reg = await getActiveRegistration();
      if (!reg) {
        throw new Error(
          'ה-Service Worker לא הוכן בזמן. ' +
          'ודא שהאפליקציה מותקנת על המסך הראשי (PWA) ונסה שוב.'
        );
      }
      setSwReady(true);

      // 4. Reuse existing browser subscription if valid; create new one otherwise
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
        throw new Error(
          `לא הצלחנו ליצור מנוי להתראות: ${err.message || err}`
        );
      }
      setBrowserSub(sub);

      // 5. Persist to backend (upsert — safe to call multiple times on same device)
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

      // Remove from browser
      if (sub) await sub.unsubscribe();
      setBrowserSub(null);

      // Mark inactive in backend
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
