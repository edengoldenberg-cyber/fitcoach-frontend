/**
 * PushNotificationSetup.jsx
 *
 * Floating prompt shown to trainees who haven't yet enabled push notifications.
 * Shown at most once per session (dismissed → stored in localStorage).
 * Triggers only after a 5-second delay to avoid interfering with initial load.
 *
 * For full push management the trainee uses AutomationSettings → Push section.
 */

import React, { useState, useEffect } from 'react';
import { useQuery }                   from '@tanstack/react-query';
import { base44 }                     from '@/api/base44Client';
import { Button }                     from '@/components/ui/button';
import { Card }                       from '@/components/ui/card';
import { Bell, X }                    from 'lucide-react';
import { usePushSubscription }        from '@/hooks/usePushSubscription';

export default function PushNotificationSetup() {
  const [show, setShow] = useState(false);

  const { data: user } = useQuery({
    queryKey: ['currentUser'],
    queryFn:  () => base44.auth.me(),
  });

  const { data: traineeRecord } = useQuery({
    queryKey: ['traineeRecord', user?.email],
    queryFn:  async () => {
      const r = await base44.entities.Trainee.filter({ user_email: user?.email });
      return r[0] || null;
    },
    enabled: !!user?.email,
  });

  const { status, subscribe, isSubscribing } = usePushSubscription(user?.email);

  // Show the prompt once, 5 seconds after mount, unless already dismissed or active
  useEffect(() => {
    if (status === 'active' || status === 'blocked' || status === 'unsupported') return;
    if (localStorage.getItem('pushPromptDismissed')) return;

    const t = setTimeout(() => setShow(true), 5000);
    return () => clearTimeout(t);
  }, [status]);

  const dismiss = (e) => {
    e?.stopPropagation();
    setShow(false);
    localStorage.setItem('pushPromptDismissed', '1');
  };

  // Hide during meal editing (suppress modal during AI flow)
  useEffect(() => {
    const h = (e) => { if (e.detail?.active) setShow(false); };
    window.addEventListener('fitcoach:meal-editing', h);
    return () => window.removeEventListener('fitcoach:meal-editing', h);
  }, []);

  if (!user?.email) return null;
  if (traineeRecord?.notifications_prompt_enabled === false) return null;
  if (!show) return null;
  if (status === 'active' || status === 'blocked' || status === 'unsupported') return null;

  return (
    <>
      <div
        className="fixed inset-0 bg-black/20 z-40"
        onClick={dismiss}
      />
      <div className="fixed bottom-24 left-4 right-4 z-50 max-w-md mx-auto" dir="rtl">
        <Card className="p-4 shadow-xl border-2" style={{ borderColor: '#79DBD6' }}>
          <div className="flex items-start gap-3">
            <div className="p-2 rounded-full flex-shrink-0" style={{ backgroundColor: '#79DBD6' }}>
              <Bell className="w-5 h-5 text-white" />
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="font-bold text-slate-800 mb-1">קבל התראות בזמן אמת</h3>
              <p className="text-sm text-slate-600 mb-3">
                תזכורות לארוחות, מים ואימונים — גם כשהאפליקציה סגורה
              </p>
              <div className="flex gap-2">
                <Button
                  onClick={() => { subscribe(); dismiss(); }}
                  disabled={isSubscribing}
                  className="flex-1"
                  style={{ backgroundColor: '#79DBD6', color: 'white' }}
                >
                  {isSubscribing ? 'מפעיל...' : 'הפעל התראות'}
                </Button>
                <Button variant="ghost" size="sm" onClick={dismiss}>
                  דלג
                </Button>
              </div>
            </div>
            <Button
              variant="ghost"
              size="icon"
              onClick={dismiss}
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
