import React, { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Bell, BellOff, X } from 'lucide-react';

const VAPID_PUBLIC_KEY = 'BGHxT8YxQKZPYDJNTlJ3y0i8yPtX9GJbOZOhHqYGYZg8kN8N9VaWPbF5YqQvHbJKNzF4YqQvHbJKNzF4YqQvHbI';

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - base64String.length % 4) % 4);
  const base64 = (base64String + padding)
    .replace(/\-/g, '+')
    .replace(/_/g, '/');
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

export default function PushNotificationSetup() {
  const [showPrompt, setShowPrompt]       = useState(false);
  const [editingActive, setEditingActive] = useState(false);
  const [notificationPermission, setNotificationPermission] = useState('default');

  // Hide while mealPlanFeedback is in-flight or showing result.
  useEffect(() => {
    const handler = (e) => setEditingActive(e.detail?.active ?? false);
    window.addEventListener('fitcoach:meal-editing', handler);
    return () => window.removeEventListener('fitcoach:meal-editing', handler);
  }, []);
  const [isSupported, setIsSupported] = useState(false);
  const [serviceWorkerStatus, setServiceWorkerStatus] = useState('unknown');
  const [subscriptionExists, setSubscriptionExists] = useState(false);
  const [showDebug, setShowDebug] = useState(false);
  const queryClient = useQueryClient();

  const { data: user } = useQuery({
    queryKey: ['currentUser'],
    queryFn: () => base44.auth.me(),
  });

  const { data: traineeRecord } = useQuery({
    queryKey: ['traineeRecord', user?.email],
    queryFn: async () => {
      const results = await base44.entities.Trainee.filter({ user_email: user?.email });
      return results[0] || null;
    },
    enabled: !!user?.email,
  });

  const { data: existingSubscriptions = [] } = useQuery({
    queryKey: ['pushSubscriptions', user?.email],
    queryFn: () => base44.entities.PushSubscription.filter({ 
      trainee_email: user?.email,
      is_active: true 
    }),
    enabled: !!user?.email,
  });

  useEffect(() => {
    const checkPushStatus = async () => {
      try {
        // Check if Push API is supported
        const supported = 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
        setIsSupported(supported);

        if (supported) {
          setNotificationPermission(Notification.permission);
          
          // Check service worker status
          if ('serviceWorker' in navigator) {
            try {
              const registration = await navigator.serviceWorker.getRegistration();
              if (registration) {
                if (registration.active) {
                  setServiceWorkerStatus('active');
                } else if (registration.installing) {
                  setServiceWorkerStatus('installing');
                } else {
                  setServiceWorkerStatus('registered');
                }
                
                // Check if subscription exists
                try {
                  const subscription = await registration.pushManager.getSubscription();
                  setSubscriptionExists(!!subscription);
                } catch (subErr) {
                  console.error('[Push] Error getting subscription:', subErr);
                  setSubscriptionExists(false);
                }
              } else {
                setServiceWorkerStatus('not_registered');
              }
            } catch (swErr) {
              console.error('[Push] Error checking service worker:', swErr);
              setServiceWorkerStatus('error');
            }
          }
          
          // Only show prompt if service worker is available and user hasn't dismissed
          if (serviceWorkerStatus === 'active' && Notification.permission === 'default' && existingSubscriptions.length === 0) {
            const hasSeenPrompt = localStorage.getItem('pushPromptDismissed');
            if (!hasSeenPrompt) {
              setTimeout(() => setShowPrompt(true), 5000);
            }
          }
        }
      } catch (err) {
        console.error('[Push] Error checking push status:', err);
      }
    };

    checkPushStatus();
  }, [existingSubscriptions]);

  const subscribeToPush = useMutation({
    mutationFn: async () => {
      try {
        console.log('[Push] Starting subscription process...');
        
        // Request notification permission
        const permission = await Notification.requestPermission();
        console.log('[Push] Permission result:', permission);
        setNotificationPermission(permission);

        if (permission !== 'granted') {
          throw new Error('ההרשאה להתראות נדחתה. אנא אפשר התראות בהגדרות הדפדפן.');
        }

        // Check if service worker is supported
        if (!('serviceWorker' in navigator)) {
          throw new Error('Service Worker לא נתמך בדפדפן זה');
        }

        console.log('[Push] Registering service worker...');
        
        // Register service worker with error handling
        let registration;
        try {
          registration = await navigator.serviceWorker.register('/sw.js', {
            scope: '/',
            type: 'classic'
          });
          console.log('[Push] Service worker registered:', registration);
        } catch (swError) {
          console.error('[Push] Service worker registration failed:', swError);
          
          // Try to get existing registration
          registration = await navigator.serviceWorker.getRegistration();
          if (!registration) {
            throw new Error('Service Worker לא זמין. האפליקציה צריכה להיות מותקנת כ-PWA.');
          }
          console.log('[Push] Using existing registration:', registration);
        }
        
        // Wait for service worker to be ready
        await navigator.serviceWorker.ready;
        console.log('[Push] Service worker ready');
        
        setServiceWorkerStatus('active');

        // Check for existing subscription
        let subscription = await registration.pushManager.getSubscription();
        
        if (subscription) {
          console.log('[Push] Existing subscription found, unsubscribing...');
          await subscription.unsubscribe();
        }

        // Subscribe to push
        console.log('[Push] Creating new subscription...');
        subscription = await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY)
        });
        
        console.log('[Push] Subscription created:', subscription);
        setSubscriptionExists(true);

        const subscriptionData = subscription.toJSON();

        // Detect device type
        const ua = navigator.userAgent;
        let device_type = 'unknown';
        if (/android/i.test(ua)) device_type = 'android';
        else if (/iPad|iPhone|iPod/.test(ua)) device_type = 'ios';
        else device_type = 'desktop';

        console.log('[Push] Saving subscription to database...');
        
        // Save subscription to database
        await base44.entities.PushSubscription.create({
          trainee_email: user?.email,
          endpoint: subscriptionData.endpoint,
          p256dh: subscriptionData.keys.p256dh,
          auth: subscriptionData.keys.auth,
          device_type,
          is_active: true,
          last_used: new Date().toISOString()
        });

        console.log('[Push] ✅ Subscription saved successfully');
        
        return { success: true };
      } catch (error) {
        console.error('[Push] ❌ Subscription error:', error);
        throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pushSubscriptions'] });
      setShowPrompt(false);
      setShowDebug(false);
      alert('✅ התראות הופעלו בהצלחה!');
    },
    onError: (error) => {
      console.error('[Push] Mutation error:', error);
      alert(`❌ שגיאה בהפעלת התראות:\n\n${error.message}`);
    }
  });

  const handleDismiss = (e) => {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    setShowPrompt(false);
    setShowDebug(false);
    localStorage.setItem('pushPromptDismissed', 'true');
  };

  const handleSkip = (e) => {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    handleDismiss(e);
  };

  if (!isSupported || !user?.email) return null;
  // If coach disabled notifications prompt for this trainee — hide everything
  if (traineeRecord && traineeRecord.notifications_prompt_enabled === false) return null;

  // Only show debug panel if explicitly requested by user (never during editing)
  if (showDebug && !editingActive) {
    return (
      <>
        {/* Backdrop - clicking dismisses */}
        <div 
          className="fixed inset-0 bg-black/20 z-40"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            setShowDebug(false);
            setShowPrompt(false);
            localStorage.setItem('pushPromptDismissed', 'true');
          }}
        />
        <div className="fixed bottom-24 left-4 right-4 z-50 max-w-md mx-auto" dir="rtl">
          <Card className="p-4 shadow-xl border-2 border-slate-300">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-bold text-slate-800">🔔 סטטוס Push Notifications</h3>
            <Button 
              variant="ghost" 
              size="icon" 
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setShowDebug(false);
                setShowPrompt(false);
                localStorage.setItem('pushPromptDismissed', 'true');
              }}
              className="flex-shrink-0"
            >
              <X className="w-4 h-4" />
            </Button>
          </div>
          
          <div className="space-y-2 text-sm mb-4">
            <div className="flex justify-between items-center p-2 bg-slate-50 rounded">
              <span className="text-slate-600">Push Permission:</span>
              <span className={`font-medium ${
                notificationPermission === 'granted' ? 'text-green-600' : 
                notificationPermission === 'denied' ? 'text-red-600' : 'text-orange-600'
              }`}>
                {notificationPermission}
              </span>
            </div>
            
            <div className="flex justify-between items-center p-2 bg-slate-50 rounded">
              <span className="text-slate-600">Service Worker:</span>
              <span className={`font-medium ${
                serviceWorkerStatus === 'active' ? 'text-green-600' : 'text-orange-600'
              }`}>
                {serviceWorkerStatus}
              </span>
            </div>
            
            <div className="flex justify-between items-center p-2 bg-slate-50 rounded">
              <span className="text-slate-600">Subscription:</span>
              <span className={`font-medium ${subscriptionExists ? 'text-green-600' : 'text-red-600'}`}>
                {subscriptionExists ? 'yes' : 'no'}
              </span>
            </div>
            
            <div className="flex justify-between items-center p-2 bg-slate-50 rounded">
              <span className="text-slate-600">User Subscribed:</span>
              <span className={`font-medium ${existingSubscriptions.length > 0 ? 'text-green-600' : 'text-red-600'}`}>
                {existingSubscriptions.length > 0 ? 'subscribed' : 'not subscribed'}
              </span>
            </div>
          </div>

          {notificationPermission !== 'granted' && (
            <Button
              onClick={() => subscribeToPush.mutate()}
              disabled={subscribeToPush.isPending}
              className="w-full mb-2"
              style={{ backgroundColor: '#79DBD6', color: 'white' }}
            >
              {subscribeToPush.isPending ? 'מפעיל...' : '🔔 הפעל התראות'}
            </Button>
          )}
          
          {notificationPermission === 'denied' && (
            <div className="p-3 bg-blue-50 border border-blue-200 rounded text-sm text-blue-700 mb-2">
              ℹ️ Push הושבת. ניתן להפעיל בהגדרות הדפדפן. המערכת תמשיך לעבוד עם התראות פנימיות.
            </div>
          )}
          
          {(serviceWorkerStatus === 'not_registered' || serviceWorkerStatus === 'error') && (
            <div className="p-3 bg-blue-50 border border-blue-200 rounded text-sm text-blue-700 mb-2">
              ℹ️ Push Notifications לא זמין כרגע. המערכת משתמשת בהתראות פנימיות בלבד.
            </div>
          )}
          
          {notificationPermission === 'granted' && !subscriptionExists && (
            <Button
              onClick={() => subscribeToPush.mutate()}
              disabled={subscribeToPush.isPending}
              className="w-full"
              variant="outline"
            >
              🔄 צור Subscription חדש
            </Button>
          )}
          
          <div className="flex gap-2 mt-2">
            <Button
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                handleDismiss(e);
              }}
              variant="ghost"
              size="sm"
              className="flex-1 text-xs"
            >
              סגור
            </Button>
            <Button
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                handleSkip(e);
              }}
              variant="outline"
              size="sm"
              className="flex-1 text-xs"
            >
              דלג לעכשיו
            </Button>
          </div>
        </Card>
      </div>
      </>
    );
  }

  // Show regular prompt
  if (!showPrompt || editingActive || existingSubscriptions.length > 0 || notificationPermission === 'denied') {
    return null;
  }

  return (
    <>
      {/* Backdrop - clicking dismisses */}
      <div 
        className="fixed inset-0 bg-black/20 z-40"
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          handleDismiss(e);
        }}
      />
      <div className="fixed bottom-24 left-4 right-4 z-50 max-w-md mx-auto" dir="rtl">
        <Card className="p-4 shadow-xl border-2" style={{ borderColor: '#79DBD6' }}>
        <div className="flex items-start gap-3">
          <div className="p-2 rounded-full" style={{ backgroundColor: '#79DBD6' }}>
            <Bell className="w-5 h-5 text-white" />
          </div>
          <div className="flex-1">
            <h3 className="font-bold text-slate-800 mb-1">קבל התראות בזמן אמת</h3>
            <p className="text-sm text-slate-600 mb-3">
              קבל תזכורות לארוחות, מים ואימונים - גם כשהאפליקציה סגורה
            </p>
            <div className="flex gap-2">
              <Button
                onClick={() => subscribeToPush.mutate()}
                disabled={subscribeToPush.isPending}
                className="flex-1"
                style={{ backgroundColor: '#79DBD6', color: 'white' }}
              >
                {subscribeToPush.isPending ? 'מפעיל...' : 'הפעל התראות'}
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={handleSkip}
              >
                דלג
              </Button>
            </div>
            <div className="flex gap-2 mt-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowDebug(true)}
                className="flex-1 text-xs text-slate-500"
              >
                מידע טכני
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={handleSkip}
                className="flex-1 text-xs text-slate-500"
              >
                דלג לעכשיו
              </Button>
            </div>
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              handleDismiss(e);
            }}
            className="text-slate-400 flex-shrink-0"
          >
            <X className="w-4 h-4" />
          </Button>
        </div>
      </Card>
    </div>
    </>
  );
}