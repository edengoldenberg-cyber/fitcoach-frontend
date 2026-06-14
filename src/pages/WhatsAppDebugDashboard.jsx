import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Loader2, RefreshCw, AlertCircle, CheckCircle, XCircle } from 'lucide-react';

export default function WhatsAppDebugDashboard() {
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState(null);

  // Scope everything to the currently-authenticated admin — never hardcode a specific user
  const { data: currentUser } = useQuery({
    queryKey: ['currentUser'],
    queryFn: () => base44.auth.me(),
  });
  const coachEmail = currentUser?.email;

  const { data: config } = useQuery({
    queryKey: ['whatsapp-config', coachEmail],
    queryFn: async () => {
      const configs = await base44.entities.WhatsAppProviderConfig.filter({
        coach_email: coachEmail,
      });
      return configs[0];
    },
    enabled: !!coachEmail,
  });

  // Scope failed/queued queues to this admin's coach account only
  const { data: failedMessages } = useQuery({
    queryKey: ['failed-messages', coachEmail],
    queryFn: () => base44.entities.WhatsAppMessageQueue.filter({ status: 'failed', coach_email: coachEmail }),
    enabled: !!coachEmail,
  });

  const { data: queuedMessages } = useQuery({
    queryKey: ['queued-messages', coachEmail],
    queryFn: () => base44.entities.WhatsAppMessageQueue.filter({ status: 'queued', coach_email: coachEmail }),
    enabled: !!coachEmail,
  });

  const { data: diagnostics } = useQuery({
    queryKey: ['diagnostics'],
    queryFn: async () => {
      const logs = await base44.entities.WhatsAppDiagnosticsLog.list('-created_date', 20);
      return logs.filter(l => l.event === 'SEND_FAIL');
    },
    enabled: !!coachEmail,
  });

  const testConnection = async () => {
    if (!coachEmail) return;
    setTesting(true);
    setTestResult(null);

    try {
      if (!config) {
        setTestResult({ ok: false, error: 'אין תצורה' });
        return;
      }

      const response = await base44.functions.invoke('testWhatsAppConnection', {
        coachEmail,
      });

      setTestResult({
        ok: response.status === 200,
        status: response.status,
        data: response.data,
      });
    } catch (err) {
      console.error('Test error:', err);
      setTestResult({
        ok: false,
        error: err.response?.data?.error || err.message || 'שגיאה בבדיקה',
      });
    } finally {
      setTesting(false);
    }
  };

  const reboot = async () => {
    if (!config || !coachEmail) return;
    if (!window.confirm(`לאתחל את ה-WhatsApp instance עבור ${coachEmail}?`)) return;

    try {
      setTesting(true);
      const response = await base44.functions.invoke('rebootGreenApiInstance', {
        coachEmail,
      });
      
      setTestResult({
        ok: response.status === 200,
        status: response.status,
        data: response.data || { success: true, message: 'Instance rebooted' }
      });
    } catch (err) {
      setTestResult({
        ok: false,
        error: err.response?.data?.error || err.message || 'שגיאה בـ reboot'
      });
    } finally {
      setTesting(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 p-6" dir="rtl">
      <div className="max-w-6xl mx-auto space-y-6">
        <h1 className="text-3xl font-bold">🩺 WhatsApp Diagnostics</h1>

        {/* Config Status */}
        <Card className="p-6">
          <h2 className="text-xl font-bold mb-4">תצורת GreenAPI</h2>
          {config ? (
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="font-medium">Instance ID:</span>
                <span className="font-mono">{config.instance_id}</span>
              </div>
              <div className="flex justify-between">
                <span className="font-medium">API URL:</span>
                <span className="font-mono text-xs">{config.api_url}</span>
              </div>
              <div className="flex justify-between">
                <span className="font-medium">סטטוס:</span>
                <Badge variant={config.status === 'connected' ? 'default' : 'destructive'}>
                  {config.status}
                </Badge>
              </div>
              <div className="flex justify-between">
                <span className="font-medium">מופעל:</span>
                <Badge variant={config.is_enabled ? 'default' : 'secondary'}>
                  {config.is_enabled ? 'כן' : 'לא'}
                </Badge>
              </div>
              {config.last_error && (
                <div className="bg-red-50 border border-red-200 rounded p-3 mt-3">
                  <div className="font-medium text-red-700">שגיאה אחרונה:</div>
                  <div className="text-xs text-red-600 mt-1">{config.last_error}</div>
                </div>
              )}
            </div>
          ) : (
            <div className="text-slate-500">אין תצורה</div>
          )}
          
          <div className="flex gap-3 mt-4">
            <Button onClick={testConnection} disabled={testing || !config || !coachEmail}>
              {testing ? (
                <><Loader2 className="w-4 h-4 animate-spin mr-2" /> בודק...</>
              ) : (
                <><RefreshCw className="w-4 h-4 mr-2" /> בדוק חיבור</>
              )}
            </Button>
            <Button onClick={reboot} variant="outline" disabled={!config || !coachEmail}>
              🔄 Reboot Instance
            </Button>
          </div>

          {testResult && (
            <div className={`mt-4 p-4 rounded-lg ${testResult.ok ? 'bg-green-50 border border-green-200' : 'bg-red-50 border border-red-200'}`}>
              <div className="flex items-center gap-2 mb-2">
                {testResult.ok ? (
                  <CheckCircle className="w-5 h-5 text-green-600" />
                ) : (
                  <XCircle className="w-5 h-5 text-red-600" />
                )}
                <span className="font-bold">
                  {testResult.ok ? 'מחובר' : 'לא מחובר'}
                </span>
              </div>
              <pre className="text-xs bg-white p-2 rounded overflow-auto max-h-60">
                {JSON.stringify(testResult, null, 2)}
              </pre>
            </div>
          )}
        </Card>

        {/* Queue Stats */}
        <div className="grid grid-cols-2 gap-4">
          <Card className="p-6">
            <div className="text-3xl font-bold text-red-600">{failedMessages?.length || 0}</div>
            <div className="text-sm text-slate-600 mt-1">הודעות נכשלו</div>
          </Card>
          <Card className="p-6">
            <div className="text-3xl font-bold text-amber-600">{queuedMessages?.length || 0}</div>
            <div className="text-sm text-slate-600 mt-1">הודעות בתור</div>
          </Card>
        </div>

        {/* Failed Messages */}
        {failedMessages && failedMessages.length > 0 && (
          <Card className="p-6">
            <h2 className="text-xl font-bold mb-4">הודעות נכשלו (אחרונות)</h2>
            <div className="space-y-3">
              {failedMessages.slice(0, 5).map(msg => (
                <div key={msg.id} className="bg-red-50 border border-red-200 rounded p-3">
                  <div className="flex justify-between items-start mb-2">
                    <div className="text-sm font-medium">→ {msg.to_phone_e164}</div>
                    <Badge variant="destructive">ניסיונות: {msg.attempts}</Badge>
                  </div>
                  <div className="text-xs text-slate-600 mb-2">
                    {msg.rendered_text?.slice(0, 100)}...
                  </div>
                  <div className="text-xs text-red-600 font-mono">
                    {msg.error_message}
                  </div>
                </div>
              ))}
            </div>
          </Card>
        )}

        {/* Diagnostics */}
        {diagnostics && diagnostics.length > 0 && (
          <Card className="p-6">
            <h2 className="text-xl font-bold mb-4">לוג שגיאות</h2>
            <div className="space-y-2">
              {diagnostics.slice(0, 10).map(log => (
                <div key={log.id} className="bg-slate-50 border rounded p-2 text-xs">
                  <div className="font-mono text-slate-500">
                    {new Date(log.created_date).toLocaleString('he-IL')}
                  </div>
                  <div className="mt-1">
                    {JSON.stringify(log.payload)}
                  </div>
                </div>
              ))}
            </div>
          </Card>
        )}
      </div>
    </div>
  );
}