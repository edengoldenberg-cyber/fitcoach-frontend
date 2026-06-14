import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
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
  const [saveError, setSaveError] = useState(null);

  const { data: configs = [], isLoading } = useQuery({
    queryKey: ['whatsappConfig', coachEmail],
    queryFn: () => base44.entities.WhatsAppProviderConfig.filter({ coach_email: coachEmail }),
    enabled: !!coachEmail,
  });

  const config = configs[0];
  const [formInitialized, setFormInitialized] = useState(false);

  const [form, setForm] = useState({
    provider_type: 'mock',
    phone_number_e164: '',
    api_url: '',
    instance_id: '',
    api_token: '',
    is_enabled: false,
  });

  // Initialize form ONCE from DB — never override after user edits
  React.useEffect(() => {
    if (config && !formInitialized) {
      setForm({
        provider_type: config.provider_type || 'mock',
        phone_number_e164: config.phone_number_e164 || '',
        api_url: config.api_url || '',
        instance_id: config.instance_id || '',
        api_token: config.api_token || '',
        is_enabled: config.is_enabled || false,
      });
      setFormInitialized(true);
    }
  }, [config, formInitialized]);

  const saveMutation = useMutation({
    mutationFn: async (data) => {
      console.log('[GREEN_SETTINGS_SAVE_STARTED]');
      console.log('[GREEN_SETTINGS_SAVE_PAYLOAD]', JSON.stringify({ 
        provider_type: data.provider_type, 
        phone: data.phone_number_e164,
        api_url: data.api_url,
        instance_id: data.instance_id,
        is_enabled: data.is_enabled
      }));
      
      try {
        if (config?.id) {
          const result = await base44.entities.WhatsAppProviderConfig.update(config.id, { ...data, coach_email: coachEmail });
          console.log('[GREEN_SETTINGS_SAVE_SUCCESS]');
          return result;
        } else {
          const result = await base44.entities.WhatsAppProviderConfig.create({ ...data, coach_email: coachEmail });
          console.log('[GREEN_SETTINGS_SAVE_SUCCESS]');
          return result;
        }
      } catch (err) {
        console.log('[GREEN_SETTINGS_SAVE_FAILED]', err.message);
        throw err;
      }
    },
    onSuccess: (saved) => {
      // Reset formInitialized so next load re-syncs with saved data
      setFormInitialized(false);
      setSaveError(null);
      queryClient.invalidateQueries({ queryKey: ['whatsappConfig', coachEmail] });
      toast.success('הגדרות נשמרו');
    },
    onError: (e) => {
      setSaveError(e.message);
      toast.error('שגיאה בשמירה: ' + e.message);
    },
  });

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
        toPhoneE164: config.phone_number_e164,
        text: '🧪 בדיקת שליחה אמיתית — הודעה זו נשלחת באמצעות נתיב הייצור המוכח. אם קיבלת הודעה זו, השליחה עובדת תקין. ✅',
        toName: 'Test',
        contextType: 'system',
        contextId: 'real_send_test_' + Date.now()
      });
      console.log('[REAL_SEND_TEST_RESPONSE]', res?.data);
      const result = res?.data || {};
      setSendResult(result);
      queryClient.invalidateQueries({ queryKey: ['whatsappConfig', coachEmail] });
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

  if (isLoading) return <div className="p-6 text-center text-slate-500">טוען הגדרות...</div>;

  const needsProviderFields = form.provider_type !== 'mock';

  return (
    <div className="space-y-6 p-4" dir="rtl">
      {form.provider_type === 'mock' && (
        <Alert className="border-blue-200 bg-blue-50">
          <Info className="w-4 h-4 text-blue-600" />
          <AlertDescription className="text-blue-700 text-sm">
            <strong>Mock Provider.</strong> מצב סימולציה — הודעות לא נשלחות בפועל.
          </AlertDescription>
        </Alert>
      )}

      <div className="space-y-4 bg-white rounded-xl border p-4">
        <h3 className="font-semibold text-slate-800 flex items-center gap-2">
          <Smartphone className="w-4 h-4" /> הגדרות ספק WhatsApp
        </h3>

        <div className="grid gap-4">
          <div className="space-y-1">
            <Label>סוג ספק</Label>
            <Select value={form.provider_type} onValueChange={v => setForm(f => ({ ...f, provider_type: v }))}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="mock">🧪 Mock (סימולציה)</SelectItem>
                <SelectItem value="greenapi">Green API</SelectItem>
                <SelectItem value="meta_cloud">Meta Cloud API</SelectItem>
                <SelectItem value="twilio">Twilio</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1">
            <Label>מספר טלפון (E164, למשל +9725XXXXXXXX)</Label>
            <Input
              value={form.phone_number_e164}
              onChange={e => setForm(f => ({ ...f, phone_number_e164: e.target.value }))}
              placeholder="+9725XXXXXXXX"
              dir="ltr"
            />
          </div>

          {needsProviderFields && form.provider_type === 'greenapi' && (
            <>
              <div className="space-y-1">
                <Label>API URL</Label>
                <Input
                  value={form.api_url}
                  onChange={e => setForm(f => ({ ...f, api_url: e.target.value }))}
                  dir="ltr"
                  placeholder="https://api.green-api.com"
                />
              </div>
              <div className="space-y-1">
                <Label>idInstance</Label>
                <Input value={form.instance_id} onChange={e => setForm(f => ({ ...f, instance_id: e.target.value }))} dir="ltr" placeholder="1234567890" />
              </div>
              <div className="space-y-1">
                <Label>apiTokenInstance</Label>
                <Input
                  type="password"
                  value={form.api_token}
                  onChange={e => setForm(f => ({ ...f, api_token: e.target.value }))}
                  dir="ltr"
                  placeholder="••••••••"
                />
              </div>
            </>
          )}

          <div className="flex items-center justify-between p-3 bg-slate-50 rounded-lg">
            <div>
              <p className="font-medium text-slate-700">הפעל WhatsApp Automations</p>
              <p className="text-xs text-slate-500">כאשר כבוי, הודעות יתוייגו כ-SKIPPED ולא יישלחו</p>
            </div>
            <Switch checked={form.is_enabled} onCheckedChange={v => setForm(f => ({ ...f, is_enabled: v }))} />
          </div>
        </div>

        <div className="flex gap-2">
          <Button onClick={() => saveMutation.mutate(form)} disabled={saveMutation.isPending}>
            {saveMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin ml-2" /> : null}
            שמור הגדרות
          </Button>
        </div>
      </div>

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
          <Button 
            variant="outline" 
            onClick={handleSendTestMessage} 
            disabled={testingSend || !config?.phone_number_e164}
            className="border-green-300 text-green-700 hover:bg-green-100"
          >
            {testingSend ? <Loader2 className="w-4 h-4 animate-spin ml-2" /> : <Smartphone className="w-4 h-4 ml-2" />}
            שלח הודעת בדיקה אמיתית
          </Button>
          {!config?.phone_number_e164 && (
            <p className="text-xs text-amber-600 mt-2">⚠️ נדרש מספר טלפון בהגדרות</p>
          )}
          
          {sendResult && (
            <div className={`mt-3 p-3 rounded-lg text-sm ${sendResult.ok ? 'bg-green-100 text-green-900 border border-green-300' : 'bg-red-50 text-red-800 border border-red-200'}`}>
              {sendResult.ok ? <CheckCircle className="w-4 h-4 inline ml-1" /> : <XCircle className="w-4 h-4 inline ml-1" />}
              <strong className="mr-1">{sendResult.ok ? 'הודעה נשלחה בהצלחה! ✅' : 'שליחה נכשלה ❌'}</strong>
              <p className="text-xs mt-1">בדוק את ה-WhatsApp שלך במספר: {config?.phone_number_e164}</p>
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

        {saveError && (
          <div className="flex items-start gap-2 p-3 rounded-lg bg-red-50 text-red-700 text-sm">
            <XCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
            <div className="flex-1">
              <p className="font-medium">שגיאה בשמירה</p>
              <p className="text-xs mt-1">{saveError}</p>
            </div>
          </div>
        )}

        {config && (
          <div className="space-y-2 text-xs bg-slate-50 p-3 rounded-lg">
            <div className="flex items-center gap-2">
              <span className="text-slate-600">Last known status:</span>
              {(config.provider_type === 'mock' || !config.provider_type) ? (
                <Badge variant="default">✅ Mock (always ok)</Badge>
              ) : (
                <Badge variant={config.status === 'connected' ? 'default' : config.status === 'error' ? 'destructive' : 'secondary'}>
                  {config.status === 'connected' ? '✅ Connected' : config.status === 'error' ? '❌ Error' : '⚪ Unknown'}
                </Badge>
              )}
            </div>
            {config.last_test_at && (
              <div className="text-slate-500">
                Last connection check: {new Date(config.last_test_at).toLocaleString('he-IL')}
              </div>
            )}
            {config.last_error && (
              <div className="text-red-600 text-xs p-2 bg-red-50 rounded">
                Last error: {config.last_error.slice(0, 200)}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Webhook Health Monitor */}
      {config?.provider_type === 'greenapi' && (
        <WebhookHealthPanel coachEmail={coachEmail} />
      )}

      {/* Webhook setup section - Green API only */}
      {config?.provider_type === 'greenapi' && (
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
      )}
    </div>
  );
}