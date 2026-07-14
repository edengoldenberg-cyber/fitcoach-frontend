import React, { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { CheckCircle, XCircle, Loader2, Info, Smartphone, Link, RefreshCw, Settings } from 'lucide-react';
import { toast } from 'sonner';
import WebhookHealthPanel from './WebhookHealthPanel';

/**
 * WhatsAppSettingsTab — Green API operational controls.
 *
 * Credentials (GREEN_API_INSTANCE_ID, GREEN_API_TOKEN, GREEN_API_BASE_URL)
 * are managed exclusively via Railway environment variables.
 * This UI shows live connection status and provides operational actions.
 */
export default function WhatsAppSettingsTab({ coachEmail }) {
  const queryClient = useQueryClient();

  // Connection status
  const [testingConnection, setTestingConnection] = useState(false);
  const [connectionResult, setConnectionResult] = useState(null);

  // Test send (user-supplied phone)
  const [testPhone, setTestPhone] = useState('');
  const [testingSend, setTestingSend] = useState(false);
  const [sendResult, setSendResult] = useState(null);

  // Webhook / reboot
  const [webhookSetupResult, setWebhookSetupResult] = useState(null);
  const [settingWebhook, setSettingWebhook] = useState(false);
  const [rebooting, setRebooting] = useState(false);

  // Auto-check connection on mount
  const { data: statusRes, isLoading: statusLoading } = useQuery({
    queryKey: ['greenApiStatus', coachEmail],
    queryFn: () => base44.functions.invoke('testWhatsAppConnection', { coachEmail }),
    enabled: !!coachEmail,
    staleTime: 30000,
    refetchOnWindowFocus: false,
  });
  const status = statusRes?.data ?? {};
  const isConnected = !!status.connected;

  const handleCheckConnection = async () => {
    setTestingConnection(true);
    setConnectionResult(null);
    try {
      const res = await base44.functions.invoke('testWhatsAppConnection', { coachEmail });
      const result = res?.data || {};
      setConnectionResult(result);
      queryClient.invalidateQueries({ queryKey: ['greenApiStatus'] });
    } catch (e) {
      setConnectionResult({ connected: false, status: 'error', message: e.message });
    } finally {
      setTestingConnection(false);
    }
  };

  const handleSendTestMessage = async () => {
    const phone = testPhone.trim();
    if (!phone) { toast.error('הכנס מספר טלפון לבדיקה'); return; }
    setTestingSend(true);
    setSendResult(null);
    try {
      const res = await base44.functions.invoke('sendWhatsAppMessage', {
        coachEmail,
        toPhoneE164: phone,
        text: '🧪 בדיקת שליחה — FitCoach Pro. אם קיבלת הודעה זו, חיבור WhatsApp תקין ✅',
        toName: 'Test',
        contextType: 'system',
        contextId: 'manual_test_' + Date.now(),
      });
      const result = res?.data || {};
      setSendResult(result);
      if (result.ok) toast.success('הודעת בדיקה נשלחה ✅');
      else toast.error('שליחה נכשלה: ' + (result.error || 'שגיאה'));
    } catch (e) {
      setSendResult({ ok: false, error: e.message });
      toast.error('שגיאה: ' + e.message);
    } finally {
      setTestingSend(false);
    }
  };

  const handleReboot = async () => {
    setRebooting(true);
    try {
      const res = await base44.functions.invoke('rebootGreenApiInstance', { coachEmail });
      if (res?.data?.ok) toast.success('Instance reboot הופעל ✅ — המתן 30 שניות');
      else toast.error('שגיאה: ' + (res?.data?.error || 'Reboot failed'));
    } catch (e) {
      toast.error('שגיאה: ' + e.message);
    } finally {
      setRebooting(false);
    }
  };

  const handleSetupWebhook = async () => {
    setSettingWebhook(true);
    setWebhookSetupResult(null);
    try {
      const res = await base44.functions.invoke('setupGreenApiWebhook', { coachEmail });
      const result = res?.data || {};
      setWebhookSetupResult(result);
      if (result.ok) toast.success('Webhook הוגדר בהצלחה! ✅');
      else toast.error('שגיאה: ' + (result.error || 'Unknown error'));
    } catch (e) {
      setWebhookSetupResult({ ok: false, error: e.message });
      toast.error('שגיאה: ' + e.message);
    } finally {
      setSettingWebhook(false);
    }
  };

  const showResult = connectionResult || status;
  const displayConnected = connectionResult ? connectionResult.connected : isConnected;

  return (
    <div className="space-y-5 p-4" dir="rtl">

      {/* ── Connection Status Banner ─────────────────────────────────────── */}
      {statusLoading ? (
        <div className="flex items-center gap-2 p-4 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-500">
          <Loader2 className="w-4 h-4 animate-spin" /> בודק סטטוס חיבור...
        </div>
      ) : displayConnected ? (
        <div className="flex items-center gap-3 p-4 bg-green-50 border border-green-200 rounded-xl">
          <CheckCircle className="w-5 h-5 text-green-600 flex-shrink-0" />
          <div>
            <p className="font-semibold text-green-800 text-sm">WhatsApp מחובר ✅</p>
            <p className="text-xs text-green-600 mt-0.5">
              סטטוס: {showResult.status || 'authorized'}
            </p>
          </div>
        </div>
      ) : (
        <div className="flex items-start gap-3 p-4 bg-red-50 border border-red-200 rounded-xl">
          <XCircle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="font-semibold text-red-800 text-sm">WhatsApp לא מחובר</p>
            <p className="text-xs text-red-600 mt-0.5">
              {showResult.status === 'CONFIG_REQUIRED'
                ? 'GREEN_API_INSTANCE_ID ו-GREEN_API_TOKEN לא הוגדרו ב-Railway'
                : (showResult.message || showResult.status || 'בדוק את הגדרות Green API ב-Railway')}
            </p>
          </div>
        </div>
      )}

      {/* ── Credentials Notice ───────────────────────────────────────────── */}
      <Alert className="border-blue-200 bg-blue-50">
        <Settings className="w-4 h-4 text-blue-600" />
        <AlertDescription className="text-blue-700 text-sm">
          <strong>הגדרת פרטי Green API</strong> — ה-Instance ID, Token ו-URL מנוהלים דרך
          משתני סביבה ב-Railway:
          <code className="mx-1 px-1 bg-blue-100 rounded text-xs font-mono">GREEN_API_INSTANCE_ID</code>
          <code className="mx-1 px-1 bg-blue-100 rounded text-xs font-mono">GREEN_API_TOKEN</code>
          <code className="mx-1 px-1 bg-blue-100 rounded text-xs font-mono">GREEN_API_BASE_URL</code>
          <br />
          <span className="text-xs">לשינוי — עדכן ב-Railway Dashboard → Variables ואז בצע Deploy.</span>
        </AlertDescription>
      </Alert>

      {/* ── Connection Test ──────────────────────────────────────────────── */}
      <div className="bg-white rounded-xl border border-slate-200 p-4 space-y-3">
        <h3 className="font-semibold text-slate-800 text-sm flex items-center gap-2">
          <Info className="w-4 h-4" /> בדיקת מצב חיבור
        </h3>
        <Button
          variant="outline"
          onClick={handleCheckConnection}
          disabled={testingConnection}
          className="border-blue-200 text-blue-700 hover:bg-blue-50"
        >
          {testingConnection
            ? <Loader2 className="w-4 h-4 animate-spin ml-2" />
            : <RefreshCw className="w-4 h-4 ml-2" />}
          בדוק מצב חיבור עכשיו
        </Button>
        {connectionResult && (
          <div className={`p-3 rounded-lg text-sm ${connectionResult.connected ? 'bg-green-50 text-green-800 border border-green-200' : 'bg-red-50 text-red-800 border border-red-200'}`}>
            {connectionResult.connected
              ? <><CheckCircle className="w-4 h-4 inline ml-1" /> מחובר — סטטוס: {connectionResult.status}</>
              : <><XCircle className="w-4 h-4 inline ml-1" /> לא מחובר — {connectionResult.message || connectionResult.status}</>}
          </div>
        )}
      </div>

      {/* ── Test Send ────────────────────────────────────────────────────── */}
      <div className="bg-white rounded-xl border border-slate-200 p-4 space-y-3">
        <h3 className="font-semibold text-slate-800 text-sm flex items-center gap-2">
          <Smartphone className="w-4 h-4" /> שלח הודעת בדיקה
        </h3>
        <div className="flex gap-2">
          <Input
            value={testPhone}
            onChange={e => setTestPhone(e.target.value)}
            placeholder="+972XXXXXXXXX"
            dir="ltr"
            className="font-mono text-sm flex-1"
          />
          <Button
            onClick={handleSendTestMessage}
            disabled={testingSend || !isConnected}
            className="text-white shrink-0"
            style={{ backgroundColor: '#14b8a6' }}
          >
            {testingSend ? <Loader2 className="w-4 h-4 animate-spin" /> : 'שלח'}
          </Button>
        </div>
        {!isConnected && (
          <p className="text-xs text-amber-600">⚠️ נדרש חיבור תקין לפני שליחה</p>
        )}
        {sendResult && (
          <div className={`p-3 rounded-lg text-sm ${sendResult.ok ? 'bg-green-50 text-green-800 border border-green-200' : 'bg-red-50 text-red-700 border border-red-200'}`}>
            {sendResult.ok
              ? <><CheckCircle className="w-4 h-4 inline ml-1" /> הודעה נשלחה בהצלחה ✅</>
              : <><XCircle className="w-4 h-4 inline ml-1" /> שליחה נכשלה: {sendResult.error}</>}
          </div>
        )}
      </div>

      {/* ── Webhook & Reboot ─────────────────────────────────────────────── */}
      <WebhookHealthPanel coachEmail={coachEmail} />

      <div className="bg-white rounded-xl border border-slate-200 p-4 space-y-3">
        <h3 className="font-semibold text-slate-800 text-sm flex items-center gap-2">
          <Link className="w-4 h-4" /> הגדרות מתקדמות
        </h3>
        <div className="flex gap-2">
          <Button
            onClick={handleSetupWebhook}
            disabled={settingWebhook || !isConnected}
            className="flex-1 bg-green-600 hover:bg-green-700 text-white text-sm"
          >
            {settingWebhook ? <Loader2 className="w-4 h-4 animate-spin ml-2" /> : <Link className="w-4 h-4 ml-2" />}
            הגדר Webhook
          </Button>
          <Button
            onClick={handleReboot}
            disabled={rebooting || !isConnected}
            variant="outline"
            className="flex-1 border-orange-300 text-orange-700 hover:bg-orange-50 text-sm"
          >
            {rebooting ? <Loader2 className="w-4 h-4 animate-spin ml-2" /> : <RefreshCw className="w-4 h-4 ml-2" />}
            Reboot Instance
          </Button>
        </div>
        {webhookSetupResult && (
          <div className={`p-3 rounded-lg text-sm ${webhookSetupResult.ok ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
            {webhookSetupResult.ok
              ? <><CheckCircle className="w-4 h-4 inline ml-1" /> Webhook הוגדר בהצלחה</>
              : <><XCircle className="w-4 h-4 inline ml-1" /> {webhookSetupResult.error}</>}
          </div>
        )}
      </div>

    </div>
  );
}
