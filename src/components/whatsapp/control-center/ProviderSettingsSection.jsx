import React, { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { toast } from 'sonner';
import { CheckCircle, XCircle, Loader2, Link, RefreshCw, Smartphone, Info, Settings } from 'lucide-react';
import ConfirmModal from './ConfirmModal';

/**
 * ProviderSettingsSection — Green API connection status and operational controls.
 *
 * Credentials are managed via Railway environment variables only.
 * This component shows live status and provides reboot/webhook/test actions.
 */
export default function ProviderSettingsSection({ onRefresh }) {
  const queryClient = useQueryClient();

  const [testingConnection, setTestingConnection] = useState(false);
  const [connectionResult, setConnectionResult] = useState(null);
  const [settingWebhook, setSettingWebhook] = useState(false);
  const [rebooting, setRebooting] = useState(false);
  const [webhookResult, setWebhookResult] = useState(null);
  const [showWebhookConfirm, setShowWebhookConfirm] = useState(false);
  const [showRebootConfirm, setShowRebootConfirm] = useState(false);

  const { data: user } = useQuery({
    queryKey: ['currentUser'],
    queryFn: () => base44.auth.me(),
  });
  const coachEmail = user?.email;

  // Live connection status (auto-fetched)
  const { data: statusRes, isLoading: statusLoading } = useQuery({
    queryKey: ['wcc', 'greenApiStatus'],
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
      setConnectionResult(res?.data || {});
      queryClient.invalidateQueries({ queryKey: ['wcc'] });
      onRefresh?.();
    } catch (e) {
      setConnectionResult({ connected: false, status: 'error', message: e.message });
    } finally {
      setTestingConnection(false);
    }
  };

  const handleSetupWebhook = async () => {
    setShowWebhookConfirm(false);
    setSettingWebhook(true);
    setWebhookResult(null);
    try {
      const res = await base44.functions.invoke('setupGreenApiWebhook', { coachEmail });
      setWebhookResult(res?.data || {});
      if (res?.data?.ok) toast.success('Webhook הוגדר בהצלחה ✅');
      else toast.error('שגיאה: ' + (res?.data?.error || 'Unknown'));
      queryClient.invalidateQueries({ queryKey: ['wcc'] });
    } catch (e) {
      setWebhookResult({ ok: false, error: e.message });
      toast.error('שגיאה: ' + e.message);
    } finally {
      setSettingWebhook(false);
    }
  };

  const handleReboot = async () => {
    setShowRebootConfirm(false);
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

  const showResult = connectionResult || status;
  const displayConnected = connectionResult ? connectionResult.connected : isConnected;

  return (
    <div className="space-y-4">

      {/* ── Live Connection Status ──────────────────────────────────────── */}
      {statusLoading ? (
        <div className="flex items-center gap-2 p-4 bg-slate-50 border-2 border-slate-200 rounded-2xl text-sm text-slate-500">
          <Loader2 className="w-4 h-4 animate-spin" /> בודק סטטוס חיבור...
        </div>
      ) : displayConnected ? (
        <div className="flex items-center gap-3 p-4 bg-green-50 border-2 border-green-200 rounded-2xl">
          <CheckCircle className="w-6 h-6 text-green-600 flex-shrink-0" />
          <div>
            <p className="font-bold text-green-800">🟢 WhatsApp מחובר</p>
            <p className="text-xs text-green-600 mt-0.5">סטטוס: {showResult.status || 'authorized'}</p>
          </div>
        </div>
      ) : (
        <div className="flex items-start gap-3 p-4 bg-red-50 border-2 border-red-200 rounded-2xl">
          <XCircle className="w-6 h-6 text-red-500 flex-shrink-0 mt-0.5" />
          <div>
            <p className="font-bold text-red-800">🔴 WhatsApp לא מחובר</p>
            <p className="text-xs text-red-600 mt-0.5">
              {showResult.status === 'CONFIG_REQUIRED'
                ? 'GREEN_API_INSTANCE_ID ו-GREEN_API_TOKEN לא הוגדרו ב-Railway'
                : (showResult.message || showResult.status || 'בדוק הגדרות Green API')}
            </p>
          </div>
        </div>
      )}

      {/* ── Credentials Notice ───────────────────────────────────────────── */}
      <div className="bg-blue-50 border-2 border-blue-200 rounded-2xl p-4 flex items-start gap-3">
        <Settings className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
        <div>
          <p className="font-bold text-blue-800 text-sm">הגדרת פרטי Green API</p>
          <p className="text-xs text-blue-700 mt-1">
            ה-Instance ID, Token ו-URL מנוהלים דרך משתני סביבה ב-Railway:
          </p>
          <div className="flex flex-wrap gap-1 mt-1.5">
            {['GREEN_API_INSTANCE_ID', 'GREEN_API_TOKEN', 'GREEN_API_BASE_URL'].map(v => (
              <code key={v} className="px-1.5 py-0.5 bg-blue-100 text-blue-800 rounded text-xs font-mono">{v}</code>
            ))}
          </div>
          <p className="text-xs text-blue-600 mt-1.5">לשינוי — עדכן ב-Railway Dashboard → Variables ואז בצע Deploy.</p>
        </div>
      </div>

      {/* ── Connection Check ─────────────────────────────────────────────── */}
      <div className="bg-white rounded-2xl border-2 border-slate-200 p-5 shadow-sm">
        <div className="flex items-center gap-2 mb-3">
          <Info className="w-5 h-5 text-blue-600" />
          <h2 className="font-bold text-slate-800 text-base">🔍 בדיקת מצב חיבור</h2>
        </div>
        <button
          onClick={handleCheckConnection}
          disabled={testingConnection}
          className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-xl text-sm font-medium transition-colors flex items-center gap-2"
        >
          {testingConnection ? <Loader2 className="w-4 h-4 animate-spin" /> : <Info className="w-4 h-4" />}
          בדוק מצב חיבור עכשיו
        </button>

        {connectionResult && (
          <div className={`mt-3 p-3 rounded-xl text-sm border ${connectionResult.connected ? 'bg-green-50 border-green-200 text-green-800' : 'bg-red-50 border-red-200 text-red-800'}`}>
            {connectionResult.connected
              ? <><CheckCircle className="w-4 h-4 inline ml-1" /> מחובר — סטטוס: {connectionResult.status}</>
              : <><XCircle className="w-4 h-4 inline ml-1" /> לא מחובר — {connectionResult.message || connectionResult.status}</>}
          </div>
        )}
      </div>

      {/* ── Webhook & Reboot ─────────────────────────────────────────────── */}
      <div className="bg-white rounded-2xl border-2 border-slate-200 p-5 shadow-sm">
        <div className="flex items-center gap-2 mb-3">
          <Link className="w-5 h-5 text-slate-600" />
          <h2 className="font-bold text-slate-800 text-base">🔗 הגדרות מתקדמות</h2>
        </div>
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
            {webhookResult.ok
              ? <div><div className="flex items-center gap-1 font-medium"><CheckCircle className="w-4 h-4" /> Webhook הוגדר בהצלחה</div>
                  {webhookResult.webhookUrl && <div className="text-xs font-mono break-all bg-white/50 p-1 rounded mt-1">{webhookResult.webhookUrl}</div>}
                </div>
              : <div className="flex items-center gap-1"><XCircle className="w-4 h-4" /> {webhookResult.error}</div>}
          </div>
        )}
      </div>

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
        description="פעולה זו תאתחל מחדש את ה-Instance ב-Green API.\n\nהחיבור עלול להתנתק לכמה שניות."
        confirmLabel="אשר Reboot"
        confirmClass="bg-orange-600 hover:bg-orange-700 text-white"
      />
    </div>
  );
}
