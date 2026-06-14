import React, { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { toast } from 'sonner';
import { Switch } from '@/components/ui/switch';
import { CheckCircle, XCircle, Loader2, Link, RefreshCw, Smartphone, Info, Wifi } from 'lucide-react';
import ConfirmModal from './ConfirmModal';

export default function ProviderSettingsSection({ killSwitchActive, onRefresh }) {
  const queryClient = useQueryClient();
  const [testingConnection, setTestingConnection] = useState(false);
  const [connectionResult, setConnectionResult] = useState(null);
  const [settingWebhook, setSettingWebhook] = useState(false);
  const [rebooting, setRebooting] = useState(false);
  const [webhookResult, setWebhookResult] = useState(null);
  const [showWebhookConfirm, setShowWebhookConfirm] = useState(false);
  const [showRebootConfirm, setShowRebootConfirm] = useState(false);
  const [formInitialized, setFormInitialized] = useState(false);

  const { data: configs = [] } = useQuery({
    queryKey: ['wcc', 'providerConfigFull'],
    queryFn: () => base44.entities.WhatsAppProviderConfig.filter({}),
  });
  const config = configs[0] || null;

  const { data: user } = useQuery({
    queryKey: ['currentUser'],
    queryFn: () => base44.auth.me(),
  });

  const [form, setForm] = useState({
    provider_type: 'greenapi',
    phone_number_e164: '',
    api_url: '',
    instance_id: '',
    api_token: '',
    is_enabled: false,
  });

  useEffect(() => {
    if (config && !formInitialized) {
      setForm({
        provider_type: config.provider_type || 'greenapi',
        phone_number_e164: config.phone_number_e164 || '',
        api_url: config.api_url || '',
        instance_id: config.instance_id || '',
        api_token: config.api_token || '',
        is_enabled: config.is_enabled || false,
      });
      setFormInitialized(true);
    }
  }, [config, formInitialized]);

  const PLACEHOLDER_TOKENS = ['YOUR_API_TOKEN', 'YOUR_TOKEN', '••••••••'];

  const saveMutation = useMutation({
    mutationFn: async (data) => {
      const coachEmail = user?.email;
      const payload = { ...data, coach_email: coachEmail };

      // Trim all string fields
      if (payload.api_url) payload.api_url = payload.api_url.trim();
      if (payload.instance_id) payload.instance_id = payload.instance_id.trim();
      if (payload.phone_number_e164) payload.phone_number_e164 = payload.phone_number_e164.trim();

      // Never overwrite stored token with a placeholder or empty value
      const tokenRaw = (payload.api_token || '').trim();
      const isPlaceholder = !tokenRaw || PLACEHOLDER_TOKENS.includes(tokenRaw) ||
        /^[•*\s]+$/.test(tokenRaw) || tokenRaw.startsWith('•');
      if (isPlaceholder) {
        delete payload.api_token; // keep existing token in DB
      } else {
        payload.api_token = tokenRaw;
      }

      if (config?.id) {
        return base44.entities.WhatsAppProviderConfig.update(config.id, payload);
      } else {
        return base44.entities.WhatsAppProviderConfig.create(payload);
      }
    },
    onSuccess: (saved) => {
      // Update form with exactly what was saved — do NOT reset formInitialized
      // This prevents the useEffect from re-populating form with stale DB values
      if (saved) {
        setForm({
          provider_type: saved.provider_type || 'greenapi',
          phone_number_e164: saved.phone_number_e164 || '',
          api_url: saved.api_url || '',
          instance_id: saved.instance_id || '',
          api_token: saved.api_token || '',
          is_enabled: saved.is_enabled || false,
        });
      }
      // Invalidate background queries for other components (status bar, etc.)
      queryClient.invalidateQueries({ queryKey: ['wcc', 'providerConfigFull'] });
      queryClient.invalidateQueries({ queryKey: ['wcc', 'providerConfigs'] });
      toast.success('הגדרות נשמרו ✅');
      onRefresh?.();
    },
    onError: (e) => toast.error('שגיאה בשמירה: ' + e.message),
  });

  const handleCheckConnection = async () => {
    setTestingConnection(true);
    setConnectionResult(null);
    const res = await base44.functions.invoke('testWhatsAppConnection', { coachEmail: user?.email });
    setConnectionResult(res?.data || {});
    setTestingConnection(false);
    queryClient.invalidateQueries({ queryKey: ['wcc'] });
  };

  const handleSetupWebhook = async () => {
    setShowWebhookConfirm(false);
    setSettingWebhook(true);
    setWebhookResult(null);
    const res = await base44.functions.invoke('setupGreenApiWebhook', { coachEmail: user?.email });
    setWebhookResult(res?.data || {});
    setSettingWebhook(false);
    if (res?.data?.ok) toast.success('Webhook הוגדר בהצלחה ✅');
    else toast.error('שגיאה: ' + (res?.data?.error || 'Unknown'));
    queryClient.invalidateQueries({ queryKey: ['wcc'] });
  };

  const handleReboot = async () => {
    setShowRebootConfirm(false);
    setRebooting(true);
    const res = await base44.functions.invoke('rebootGreenApiInstance', { coachEmail: user?.email });
    setRebooting(false);
    if (res?.data?.ok) toast.success('Instance reboot הופעל ✅ — המתן 30 שניות');
    else toast.error('שגיאה: ' + (res?.data?.error || 'Reboot failed'));
  };

  const isGreenApi = form.provider_type === 'greenapi';

  return (
    <div className="space-y-4">
      {/* Provider Settings Card */}
      <div className="bg-white rounded-2xl border-2 border-slate-200 p-5 shadow-sm">
        <div className="flex items-center gap-2 mb-4">
          <Smartphone className="w-5 h-5 text-slate-600" />
          <h2 className="font-bold text-slate-800 text-lg">⚙️ הגדרות ספק WhatsApp</h2>
        </div>

        <div className="grid gap-3">
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">סוג ספק</label>
            <select
              value={form.provider_type}
              onChange={e => setForm(f => ({ ...f, provider_type: e.target.value }))}
              className="w-full border-2 border-slate-200 rounded-xl px-3 py-2 text-sm focus:border-teal-400 outline-none bg-white"
            >
              <option value="greenapi">Green API</option>
              <option value="mock">🧪 Mock (סימולציה)</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">מספר טלפון (E164)</label>
            <input
              type="text"
              value={form.phone_number_e164}
              onChange={e => setForm(f => ({ ...f, phone_number_e164: e.target.value }))}
              placeholder="+9725XXXXXXXX"
              className="w-full border-2 border-slate-200 rounded-xl px-3 py-2 text-sm font-mono focus:border-teal-400 outline-none"
              dir="ltr"
            />
          </div>

          {isGreenApi && (
            <>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">API URL</label>
                <input
                  type="text"
                  value={form.api_url}
                  onChange={e => setForm(f => ({ ...f, api_url: e.target.value }))}
                  placeholder="https://api.green-api.com"
                  className="w-full border-2 border-slate-200 rounded-xl px-3 py-2 text-sm font-mono focus:border-teal-400 outline-none"
                  dir="ltr"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">idInstance</label>
                <input
                  type="text"
                  value={form.instance_id}
                  onChange={e => setForm(f => ({ ...f, instance_id: e.target.value }))}
                  placeholder="1234567890"
                  className="w-full border-2 border-slate-200 rounded-xl px-3 py-2 text-sm font-mono focus:border-teal-400 outline-none"
                  dir="ltr"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">apiTokenInstance</label>
                <input
                  type="password"
                  value={form.api_token}
                  onChange={e => setForm(f => ({ ...f, api_token: e.target.value }))}
                  placeholder="••••••••"
                  className="w-full border-2 border-slate-200 rounded-xl px-3 py-2 text-sm font-mono focus:border-teal-400 outline-none"
                  dir="ltr"
                />
              </div>
            </>
          )}

          <div className="flex items-center justify-between p-3 bg-slate-50 rounded-xl border border-slate-200">
            <div>
              <p className="text-sm font-medium text-slate-700">הפעל WhatsApp Automations</p>
              <p className="text-xs text-slate-500 mt-0.5">כאשר כבוי, הודעות יזוהו כ-SKIPPED ולא יישלחו</p>
            </div>
            <Switch
              checked={form.is_enabled}
              onCheckedChange={v => setForm(f => ({ ...f, is_enabled: v }))}
            />
          </div>
        </div>

        <button
          onClick={() => saveMutation.mutate(form)}
          disabled={saveMutation.isPending}
          className="mt-4 px-5 py-2 bg-slate-800 hover:bg-slate-900 disabled:opacity-50 text-white rounded-xl text-sm font-medium transition-colors flex items-center gap-2"
        >
          {saveMutation.isPending && <Loader2 className="w-4 h-4 animate-spin" />}
          שמור הגדרות
        </button>
      </div>

      {/* Last Known Status Card */}
      {config && (
        <div className="bg-white rounded-2xl border-2 border-slate-200 p-5 shadow-sm">
          <div className="flex items-center gap-2 mb-3">
            <Wifi className="w-5 h-5 text-slate-600" />
            <h2 className="font-bold text-slate-800 text-lg">📡 Last Known Status</h2>
          </div>
          <div className="flex items-center gap-3">
            <span className={`px-3 py-1 rounded-full text-sm font-bold ${
              config.status === 'connected'
                ? 'bg-green-100 text-green-700'
                : 'bg-slate-100 text-slate-500'
            }`}>
              {config.status === 'connected' ? '🟢 Connected' : '⚫ Disconnected'}
            </span>
            {config.last_test_at && (
              <span className="text-xs text-slate-400">
                Last check: {new Date(config.last_test_at).toLocaleString('he-IL')}
              </span>
            )}
          </div>
          {config.last_error && (
            <div className="mt-2 text-xs text-red-600 bg-red-50 p-2 rounded-lg font-mono break-all">
              {config.last_error.slice(0, 200)}
            </div>
          )}
        </div>
      )}

      {/* Connection Check Card */}
      <div className="bg-blue-50 border-2 border-blue-200 rounded-2xl p-5 shadow-sm">
        <div className="flex items-center gap-2 mb-2">
          <Info className="w-5 h-5 text-blue-600" />
          <h2 className="font-bold text-blue-900 text-lg">🔍 בדיקת מצב חיבור Green API</h2>
        </div>
        <p className="text-sm text-blue-700 mb-3">
          בודק אם ה-instance מחובר (getStateInstance בלבד) — לא שולח הודעה
        </p>
        <button
          onClick={handleCheckConnection}
          disabled={testingConnection}
          className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-xl text-sm font-medium transition-colors flex items-center gap-2"
        >
          {testingConnection ? <Loader2 className="w-4 h-4 animate-spin" /> : <Info className="w-4 h-4" />}
          בדוק מצב חיבור
        </button>

        {connectionResult && (
          <div className={`mt-3 p-3 rounded-xl text-sm border ${connectionResult.ok ? 'bg-green-50 border-green-200 text-green-800' : 'bg-red-50 border-red-200 text-red-800'}`}>
            {connectionResult.ok ? <CheckCircle className="w-4 h-4 inline ml-1" /> : <XCircle className="w-4 h-4 inline ml-1" />}
            <strong>{connectionResult.ok ? 'מחובר ✅' : 'לא מחובר ❌'}</strong>
            <p className="text-xs mt-1">{connectionResult.message}</p>
            {connectionResult.diagnostics?.stateInstance && (
              <p className="text-xs mt-1 font-mono">State: {connectionResult.diagnostics.stateInstance}</p>
            )}
          </div>
        )}
      </div>

      {/* Webhook Setup Card - GreenAPI only */}
      {isGreenApi && (
        <div className="bg-white rounded-2xl border-2 border-slate-200 p-5 shadow-sm">
          <div className="flex items-center gap-2 mb-3">
            <Link className="w-5 h-5 text-slate-600" />
            <h2 className="font-bold text-slate-800 text-lg">🔗 הגדרת Webhook נכנס</h2>
          </div>
          <p className="text-sm text-slate-600 mb-3 bg-amber-50 border border-amber-200 rounded-lg p-3">
            ℹ️ כדי שהמערכת תקבל הודעות נכנסות ותקדם Sales Flow, חייבים להגדיר Webhook ב-Green API.
            לחץ למטה להגדרה אוטומטית.
          </p>

          <div className="flex gap-2">
            <button
              onClick={() => setShowWebhookConfirm(true)}
              disabled={settingWebhook}
              className="flex-1 px-4 py-2 bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white rounded-xl text-sm font-medium transition-colors flex items-center justify-center gap-2"
            >
              {settingWebhook ? <Loader2 className="w-4 h-4 animate-spin" /> : <Link className="w-4 h-4" />}
              הגדר Webhook
            </button>
            <button
              onClick={() => setShowRebootConfirm(true)}
              disabled={rebooting}
              className="flex-1 px-4 py-2 border-2 border-orange-300 text-orange-700 hover:bg-orange-50 disabled:opacity-50 rounded-xl text-sm font-medium transition-colors flex items-center justify-center gap-2"
            >
              {rebooting ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
              Reboot Instance
            </button>
          </div>

          {webhookResult && (
            <div className={`mt-3 p-3 rounded-xl text-sm ${webhookResult.ok ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-red-50 text-red-700 border border-red-200'}`}>
              {webhookResult.ok ? (
                <div>
                  <div className="font-medium flex items-center gap-1"><CheckCircle className="w-4 h-4" /> {webhookResult.message}</div>
                  {webhookResult.webhookUrl && (
                    <div className="text-xs font-mono break-all bg-white/50 p-1 rounded mt-1">{webhookResult.webhookUrl}</div>
                  )}
                </div>
              ) : (
                <div className="flex items-center gap-1"><XCircle className="w-4 h-4" /> {webhookResult.error}</div>
              )}
            </div>
          )}
        </div>
      )}

      <ConfirmModal
        open={showWebhookConfirm}
        onClose={() => setShowWebhookConfirm(false)}
        onConfirm={handleSetupWebhook}
        title="🔗 הגדרת Webhook ב-Green API"
        description="פעולה זו תגדיר את כתובת ה-Webhook ב-Green API לקבלת הודעות נכנסות.\n\nזוהי פעולת קונפיגורציה בלבד — לא נשלחת שום הודעה."
        confirmLabel={settingWebhook ? 'מגדיר...' : 'אשר הגדרה'}
        confirmClass="bg-green-600 hover:bg-green-700 text-white"
      />
      <ConfirmModal
        open={showRebootConfirm}
        onClose={() => setShowRebootConfirm(false)}
        onConfirm={handleReboot}
        title="🔄 Reboot Green API Instance"
        description="פעולה זו תאתחל מחדש את ה-Instance ב-Green API.\n\nהחיבור עלול להתנתק לכמה שניות. לא נשלחת הודעה."
        confirmLabel="אשר Reboot"
        confirmClass="bg-orange-600 hover:bg-orange-700 text-white"
      />
    </div>
  );
}