import React, { useState, useEffect } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Activity, Bell, Copy, RefreshCw, Send } from 'lucide-react';
import { toast } from 'sonner';

export default function PushDiagnosticsPanel() {
  const [diagnostics, setDiagnostics] = useState({
    isStandalone: false,
    serviceWorkerRegistered: false,
    permission: 'default',
    subscriptionExists: false,
    lastSubscriptionUpdate: null
  });

  const { data: user } = useQuery({
    queryKey: ['currentUser'],
    queryFn: () => base44.auth.me(),
  });

  const { data: subscriptions = [] } = useQuery({
    queryKey: ['pushSubscriptions', user?.email],
    queryFn: () => base44.entities.PushSubscription.filter({ 
      trainee_email: user?.email,
      is_active: true 
    }),
    enabled: !!user?.email,
  });

  useEffect(() => {
    const checkDiagnostics = async () => {
      const isStandalone = window.matchMedia('(display-mode: standalone)').matches || 
                          window.navigator.standalone === true;
      
      let serviceWorkerRegistered = false;
      let subscriptionExists = false;

      if ('serviceWorker' in navigator) {
        try {
          const registration = await navigator.serviceWorker.getRegistration();
          serviceWorkerRegistered = !!registration?.active;
          
          if (registration) {
            const subscription = await registration.pushManager.getSubscription();
            subscriptionExists = !!subscription;
          }
        } catch (err) {
          console.error('[PushDiagnostics] Error checking SW:', err);
        }
      }

      const permission = 'Notification' in window ? Notification.permission : 'unsupported';

      const lastSubscriptionUpdate = subscriptions.length > 0 
        ? subscriptions[0].last_used || subscriptions[0].created_date 
        : null;

      setDiagnostics({
        isStandalone,
        serviceWorkerRegistered,
        permission,
        subscriptionExists,
        lastSubscriptionUpdate
      });
    };

    checkDiagnostics();
  }, [subscriptions]);

  const registerSWMutation = useMutation({
    mutationFn: async () => {
      if (!('serviceWorker' in navigator)) {
        throw new Error('Service Worker לא נתמך');
      }

      const registration = await navigator.serviceWorker.register('/sw.js', {
        scope: '/',
        type: 'classic'
      });

      await navigator.serviceWorker.ready;
      
      return registration;
    },
    onSuccess: () => {
      toast.success('✅ Service Worker נרשם בהצלחה');
      setTimeout(() => window.location.reload(), 1000);
    },
    onError: (error) => {
      toast.error(`❌ שגיאה: ${error.message}`);
    }
  });

  const requestPermissionMutation = useMutation({
    mutationFn: async () => {
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') {
        throw new Error('ההרשאה נדחתה');
      }
      return permission;
    },
    onSuccess: () => {
      toast.success('✅ הרשאה ניתנה');
      window.location.reload();
    },
    onError: (error) => {
      toast.error(`❌ ${error.message}`);
    }
  });

  const createSubscriptionMutation = useMutation({
    mutationFn: async () => {
      // This will trigger the full subscription flow
      window.location.reload();
    },
    onSuccess: () => {
      toast.success('✅ Subscription נוצר');
    }
  });

  const sendTestPushMutation = useMutation({
    mutationFn: async () => {
      const result = await base44.functions.invoke('sendWebPushNotification', {
        user_email: user?.email,
        title: '🔔 בדיקת Push',
        body: 'זוהי הודעת בדיקה מ-FitCoach Pro',
        data: {
          action_url: '/',
          type: 'test'
        }
      });
      return result.data;
    },
    onSuccess: (data) => {
      if (data.ok && data.sent_count > 0) {
        toast.success(`✅ Push נשלח בהצלחה ל-${data.sent_count} מכשירים`);
      } else {
        toast.error(`❌ Push נכשל: ${data.error || 'לא ידוע'}`);
      }
    },
    onError: (error) => {
      toast.error(`❌ שגיאה: ${error.message}`);
    }
  });

  const copyDebugReport = () => {
    const report = `
=== FitCoach Pro - Push Diagnostics ===
Timestamp: ${new Date().toISOString()}
User: ${user?.email || 'N/A'}

PWA Status:
- Standalone: ${diagnostics.isStandalone ? 'YES' : 'NO'}
- Service Worker: ${diagnostics.serviceWorkerRegistered ? 'REGISTERED' : 'NOT REGISTERED'}

Push Status:
- Permission: ${diagnostics.permission}
- Browser Subscription: ${diagnostics.subscriptionExists ? 'EXISTS' : 'MISSING'}
- DB Subscriptions: ${subscriptions.length}
- Last Update: ${diagnostics.lastSubscriptionUpdate || 'Never'}

Device Info:
- User Agent: ${navigator.userAgent}
- Platform: ${navigator.platform}
- Language: ${navigator.language}
`;

    navigator.clipboard.writeText(report);
    toast.success('✅ דוח הועתק ללוח');
  };

  return (
    <Card className="p-6">
      <div className="flex items-center gap-3 mb-4">
        <Activity className="w-6 h-6 text-purple-600" />
        <h3 className="font-bold text-lg">Push Diagnostics</h3>
      </div>

      <div className="space-y-3 mb-4">
        <div className="flex justify-between items-center p-2 bg-slate-50 rounded">
          <span className="text-sm text-slate-600">PWA Standalone:</span>
          <Badge variant={diagnostics.isStandalone ? 'default' : 'secondary'}>
            {diagnostics.isStandalone ? 'YES' : 'NO'}
          </Badge>
        </div>

        <div className="flex justify-between items-center p-2 bg-slate-50 rounded">
          <span className="text-sm text-slate-600">Service Worker:</span>
          <Badge variant={diagnostics.serviceWorkerRegistered ? 'default' : 'destructive'}>
            {diagnostics.serviceWorkerRegistered ? 'REGISTERED' : 'NOT REGISTERED'}
          </Badge>
        </div>

        <div className="flex justify-between items-center p-2 bg-slate-50 rounded">
          <span className="text-sm text-slate-600">Permission:</span>
          <Badge variant={
            diagnostics.permission === 'granted' ? 'default' : 
            diagnostics.permission === 'denied' ? 'destructive' : 'secondary'
          }>
            {diagnostics.permission.toUpperCase()}
          </Badge>
        </div>

        <div className="flex justify-between items-center p-2 bg-slate-50 rounded">
          <span className="text-sm text-slate-600">Subscription:</span>
          <Badge variant={diagnostics.subscriptionExists ? 'default' : 'secondary'}>
            {diagnostics.subscriptionExists ? 'EXISTS' : 'MISSING'}
          </Badge>
        </div>

        <div className="flex justify-between items-center p-2 bg-slate-50 rounded">
          <span className="text-sm text-slate-600">DB Subscriptions:</span>
          <span className="font-medium">{subscriptions.length}</span>
        </div>

        {diagnostics.lastSubscriptionUpdate && (
          <div className="flex justify-between items-center p-2 bg-slate-50 rounded">
            <span className="text-sm text-slate-600">Last Update:</span>
            <span className="text-xs text-slate-500">
              {new Date(diagnostics.lastSubscriptionUpdate).toLocaleString('he-IL')}
            </span>
          </div>
        )}
      </div>

      <div className="space-y-2">
        <Button
          onClick={() => registerSWMutation.mutate()}
          disabled={registerSWMutation.isPending || diagnostics.serviceWorkerRegistered}
          variant="outline"
          className="w-full"
          size="sm"
        >
          <RefreshCw className="w-3 h-3 mr-2" />
          Register SW
        </Button>

        <Button
          onClick={() => requestPermissionMutation.mutate()}
          disabled={requestPermissionMutation.isPending || diagnostics.permission === 'granted'}
          variant="outline"
          className="w-full"
          size="sm"
        >
          <Bell className="w-3 h-3 mr-2" />
          Request Permission
        </Button>

        <Button
          onClick={() => createSubscriptionMutation.mutate()}
          disabled={!diagnostics.serviceWorkerRegistered || diagnostics.permission !== 'granted'}
          variant="outline"
          className="w-full"
          size="sm"
        >
          <Bell className="w-3 h-3 mr-2" />
          Create Subscription
        </Button>

        <Button
          onClick={() => sendTestPushMutation.mutate()}
          disabled={sendTestPushMutation.isPending || subscriptions.length === 0}
          className="w-full"
          size="sm"
          style={{ backgroundColor: '#79DBD6', color: 'white' }}
        >
          <Send className="w-3 h-3 mr-2" />
          {sendTestPushMutation.isPending ? 'שולח...' : 'Send Test Push'}
        </Button>

        <Button
          onClick={copyDebugReport}
          variant="ghost"
          className="w-full"
          size="sm"
        >
          <Copy className="w-3 h-3 mr-2" />
          Copy Debug Report
        </Button>
      </div>

      {!diagnostics.isStandalone && (
        <div className="mt-4 p-3 bg-blue-50 border border-blue-200 rounded text-xs text-blue-700">
          ℹ️ <strong>iOS Users:</strong> Install to Home Screen to enable push notifications
        </div>
      )}
    </Card>
  );
}