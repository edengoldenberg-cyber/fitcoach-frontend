import React, { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { CheckCircle, XCircle, Loader2, Info, Smartphone, Link, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import WebhookHealthPanel from './WebhookHealthPanel';

export default function WhatsAppSettingsTab({ coachEmail }) {
  const queryClient = useQueryClient();
  const [testingConnection, setTestingConnection] = useState(false);
  const [connectionResult, setConnectionResult] = useState(null);
  const [testingSend, setTestingSend] = useState(false);
  const [sendResult, setSendResult] = useState(null);
  const [webhookSetupResult, setWebhookSetupResult] = useState(null);
  const [settingWebhook, setSettingWebhook] = useState(false);
  const [rebooting, setRebooting] = useState(false);
  // testPhone: local input for test send (was: config.phone_number_e164 from ghost entity)
  const [testPhone, setTestPhone] = useState('');

  const handleReboot = async () => {
    setRebooting(true);
    try {
      const res = await base44.functions.invoke('rebootGreenApiInstance', { coachEmail });
      const result = res?.data || {};
      if (result.ok) {
        toast.success('Instance reboot הופעל ✅ — המתן 30 שניות');
      } else {
        toast.error('שגיאה: ' + (result.error || 'Reboot failed'));
      }
    } catch (e) {
      console.error('[WhatsAppSettingsTab] Reboot exception:', e.message);
      toast.error('שגיאה: ' + (e.message || 'Unknown error'));
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
      
      if (result.ok) {
        toast.success('Webhook הוגדר בהצלחה! ✅');
        // Force refetch to update UI
        setTimeout(() => queryClient.invalidateQueries({ queryKey: ['whatsappConfig', coachEmail] }), 500);
      } else {
        toast.error('שגיאה: ' + (result.error || 'Unknown error'));
      }
    } catch (e) {
      console.error('[WhatsAppSettingsTab] Webhook setup exception:', e.message);
      const errorMsg = e.message || 'Unknown error';
      setWebhookSetupResult({ ok: false, error: errorMsg });
      toast.error('שגיאה: ' + errorMsg);
    } finally {
      setSettingWebhook(false);
    }
  };

  const handleCheckConnection = async () => {
    setTestingConnection(true);
    setConnectionResult(null);
    try {
      console.log('[GREEN_CONNECTION_STATE_CHECK_INITIATED]');
      const res = await base44.functions.invoke('testWhatsAppConnection', { coachEmail });
      console.log('[GREEN_CONNECTION_STATE_CHECK_RESPONSE]', res?.data);
      const result = res?.data || {};
      setConnectionResult(result);
      queryClient.invalidateQueries({ queryKey: ['whatsappConfig', coachEmail] });
    } catch (e) {
      console.error('[GREEN_CONNECTION_STATE_CHECK_EXCEPTION]', e.message);
      setConnectionResult({ 
        ok: false, 
        message: e.message || 'Connection state check failed',
        errorCode: 'NETWORK_ERROR',
        debugStage: 'function_invocation'
      });
    } finally {
      setTestingConnection(false);
    }
  };

  const handleSendTestMessage = async () => {
    setTestingSend(true);
    setSendResult(null);
    try {
      console.log('[REAL_SEND_TEST_INITIATED]');
      const res = await base44.functions.invoke('sendWhatsAppMessage', {
        coachEmail,
        toPhoneE164: testPhone,
        text: '🧪 בדיקת שליחה אמיתית — הודעה זו נשלחת באמצעות נתיב הייצור המוכח. אם קיבלת הודעה זו, השליחה עובדת תקין. ✅',
        toName: 'Test',
        contextType: 'system',
        contextId: 'real_send_test_' + Date.now()
      });
      console.log('[REAL_SEND_TEST_RESPONSE]', res?.data);
      const result = res?.data || {};
      setSendResult(result);
    } catch (e) {
      console.error('[REAL_SEND_TEST_EXCEPTION]', e.message);
      setSendResult({
        ok: false,
        status: 'FAILED',
        error: e.message || 'Test send failed',
        errorCode: 'NETWORK_ERROR'
      });
    } finally {
      setTestingSend(false);
    }
  };

  return (
    <div className="space-y-6 p-4" dir="rtl">
      <Alert className="border-blue-200 bg-blue-50">
        <Info className="w-4 h-4 text-blue-600" />
        <AlertDescription className="text-blue-700 text-sm">
          <strong>הגדרות Green API</strong> — ה-Instance ID, Token ו-URL מנוהלים דרך משתני סביבה ב-Railway:
          {' '}<code className="bg-blue-100 px-1 rounded text-xs font-mono">GREEN_API_INSTANCE_ID</code>
          {' '}<code className="bg-blue-100 px-1 rounded text-xs font-mono">GREEN_API_TOKEN</code>
          {' '}<code className="bg-blue-100 px-1 rounded text-xs font-mono">GREEN_API_BASE_URL</code>
        </AlertDescription>
      </Alert>

      {/* Separated Test Panels */}
      <div className="space-y-4">
        {/* Connection State Check */}
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
          <h4 className="font-semibold text-blue-900 mb-2 flex items-center gap-2">
            <Info className="w-4 h-4" />
            בדיקת מצב חיבור Green API
          </h4>
          <p className="text-sm text-blue-700 mb-3">
            בודק רק אם ה-instance מחובר (getStateInstance endpoint) - לא שולח הודעה
          </p>
          <Button 
            variant="outline" 
            onClick={handleCheckConnection} 
            disabled={testingConnection}
            className="border-blue-300 text-blue-700 hover:bg-blue-100"
          >
            {testingConnection ? <Loader2 className="w-4 h-4 animate-spin ml-2" /> : <Info className="w-4 h-4 ml-2" />}
            בדוק מצב חיבור
          </Button>
          
          {connectionResult && (
            <div className={`mt-3 p-3 rounded-lg text-sm ${connectionResult.ok ? 'bg-green-50 text-green-800 border border-green-200' : 'bg-red-50 text-red-800 border border-red-200'}`}>
              {connectionResult.ok ? <CheckCircle className="w-4 h-4 inline ml-1" /> : <XCircle className="w-4 h-4 inline ml-1" />}
              <strong className="mr-1">{connectionResult.ok ? 'מצב חיבור תקין ✅' : 'מצב חיבור לא תקין ❌'}</strong>
              <p className="text-xs mt-1">{connectionResult.message}</p>
              {connectionResult.diagnostics?.stateInstance && (
                <p className="text-xs mt-1 font-mono">State: {connectionResult.diagnostics.stateInstance}</p>
              )}
              {connectionResult.diagnostics?.http_status && (
                <p className="text-xs mt-1 font-mono">HTTP: {connectionResult.diagnostics.http_status}</p>
              )}
              {connectionResult.diagnostics?.raw_response && !connectionResult.ok && (
                <details className="text-xs mt-2 bg-white/50 p-2 rounded">
                  <summary className="cursor-pointer font-semibold">Raw API Response</summary>
                  <pre className="mt-1 whitespace-pre-wrap break-all">{connectionResult.diagnostics.raw_response}</pre>
                </details>
              )}
            </div>
          )}
        </div>

        {/* Real Send Test */}
        <div className="bg-green-50 border border-green-200 rounded-xl p-4">
          <h4 className="font-semibold text-green-900 mb-2 flex items-center gap-2">
            <Smartphone className="w-4 h-4" />
            בדיקת שליחה אמיתית
          </h4>
          <p className="text-sm text-green-700 mb-3">
            שולח הודעה אמיתית דרך נתיב הייצור המוכח (sendMessage endpoint)
          </p>
          <div className="flex gap-2 mb-3">
            <Input
              value={testPhone}
              onChange={e => setTestPhone(e.target.value)}
              placeholder="+972XXXXXXXXX"
              dir="ltr"
              className="font-mono text-sm flex-1"
            />
            <Button
              variant="outline"
              onClick={handleSendTestMessage}
              disabled={testingSend || !testPhone.trim()}
              className="border-green-300 text-green-700 hover:bg-green-100 shrink-0"
            >
              {testingSend ? <Loader2 className="w-4 h-4 animate-spin ml-2" /> : <Smartphone className="w-4 h-4 ml-2" />}
              שלח הודעת בדיקה
            </Button>
          </div>
          {sendResult && (
            <div className={`mt-3 p-3 rounded-lg text-sm ${sendResult.ok ? 'bg-green-100 text-green-900 border border-green-300' : 'bg-red-50 text-red-800 border border-red-200'}`}>
              {sendResult.ok ? <CheckCircle className="w-4 h-4 inline ml-1" /> : <XCircle className="w-4 h-4 inline ml-1" />}
              <strong className="mr-1">{sendResult.ok ? 'הודעה נשלחה בהצלחה! ✅' : 'שליחה נכשלה ❌'}</strong>
              <p className="text-xs mt-1">בדוק את ה-WhatsApp שלך במספר: {testPhone}</p>
              {sendResult.messageId && (
                <p className="text-xs mt-1 font-mono bg-white/50 p-1 rounded">
                  providerMessageId: {sendResult.messageId}
                </p>
              )}
              {sendResult.status && (
                <p className="text-xs mt-1">Status: {sendResult.status}</p>
              )}
              {sendResult.error && (
                <p className="text-xs mt-2 text-red-700 bg-red-100 p-2 rounded">
                  שגיאה: {sendResult.error}
                </p>
              )}
              {sendResult.providerType && (
                <p className="text-xs mt-1 text-slate-600">Provider: {sendResult.providerType}</p>
              )}
            </div>
          )}
        </div>

      </div>

      {/* Webhook Health Monitor */}
      <WebhookHealthPanel coachEmail={coachEmail} />

      {/* Webhook setup section */}
      <div className="space-y-3 bg-white rounded-xl border p-4">
          <h3 className="font-semibold text-slate-800 flex items-center gap-2">
            <Link className="w-4 h-4" /> הגדרת Webhook נכנס (חובה לקבלת תגובות)
          </h3>
          <Alert className="border-amber-200 bg-amber-50">
            <Info className="w-4 h-4 text-amber-600" />
            <AlertDescription className="text-amber-700 text-sm">
              כדי שהמערכת תקבל הודעות נכנסות מלידים ותקדם את ה-Sales Flow, חייבים להגדיר Webhook ב-Green API.
              לחץ על הכפתור למטה להגדרה אוטומטית.
            </AlertDescription>
          </Alert>

          <div className="flex gap-2">
            <Button
              onClick={handleSetupWebhook}
              disabled={settingWebhook}
              className="flex-1 bg-green-600 hover:bg-green-700 text-white"
            >
              {settingWebhook ? <Loader2 className="w-4 h-4 animate-spin ml-2" /> : <Link className="w-4 h-4 ml-2" />}
              הגדר Webhook
            </Button>
            <Button
              onClick={handleReboot}
              disabled={rebooting}
              variant="outline"
              className="flex-1 border-orange-300 text-orange-700 hover:bg-orange-50"
            >
              {rebooting ? <Loader2 className="w-4 h-4 animate-spin ml-2" /> : <RefreshCw className="w-4 h-4 ml-2" />}
              Reboot Instance
            </Button>
          </div>

          {webhookSetupResult && (
            <div className={`p-3 rounded-lg text-sm ${webhookSetupResult.ok ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
              {webhookSetupResult.ok ? (
                <div className="space-y-1">
                  <div className="flex items-center gap-1 font-medium"><CheckCircle className="w-4 h-4" /> {webhookSetupResult.message}</div>
                  <div className="text-xs font-mono break-all bg-white/50 p-1 rounded">{webhookSetupResult.webhookUrl}</div>
                  <div className="text-xs">incomingWebhook: {webhookSetupResult.currentSettings?.incomingWebhook || '?'}</div>
                </div>
              ) : (
                <div className="flex items-center gap-1"><XCircle className="w-4 h-4" /> {webhookSetupResult.error}</div>
              )}
            </div>
          )}
      </div>
    </div>
  );
}