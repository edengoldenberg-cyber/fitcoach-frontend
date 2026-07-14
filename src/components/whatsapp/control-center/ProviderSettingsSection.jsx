import React, { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { toast } from 'sonner';
import { CheckCircle, XCircle, Loader2, Link, RefreshCw, Info } from 'lucide-react';
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

  const { data: user } = useQuery({
    queryKey: ['currentUser'],
    queryFn: () => base44.auth.me(),
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

  return (
    <div className="space-y-4">
      {/* Credentials notice — env-var managed, no UI save */}
      <div className="bg-blue-50 border-2 border-blue-200 rounded-2xl p-4 text-sm text-blue-800">
        <p className="font-bold mb-1">⚙️ הגדרות Green API</p>
        <p>ה-Instance ID, Token ו-URL מנוהלים דרך משתני סביבה ב-Railway:</p>
        <div className="flex flex-wrap gap-1 mt-1.5">
          {['GREEN_API_INSTANCE_ID', 'GREEN_API_TOKEN', 'GREEN_API_BASE_URL'].map(v => (
            <code key={v} className="px-1.5 py-0.5 bg-blue-100 rounded text-xs font-mono">{v}</code>
          ))}
        </div>
      </div>

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

      {/* Webhook Setup Card */}
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