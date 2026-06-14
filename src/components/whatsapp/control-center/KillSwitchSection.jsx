import React, { useState } from 'react';
import { Power, PowerOff, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import ConfirmModal from './ConfirmModal';
import ImpactCheckPanel from './ImpactCheckPanel';

export default function KillSwitchSection({ killSwitchActive, onToggle, isToggling }) {
  const [showEnableConfirm, setShowEnableConfirm] = useState(false);
  const [showDisableConfirm, setShowDisableConfirm] = useState(false);
  const [impactData, setImpactData] = useState(null);
  const [confirmText, setConfirmText] = useState('');

  const immediateCount = impactData?.summary?.immediateQueue ?? null;
  const hasImpactData = impactData !== null;
  const isRisky = hasImpactData && immediateCount > 0;
  const confirmRequired = isRisky;
  const confirmValid = !confirmRequired || confirmText === 'ENABLE WHATSAPP';

  const handleEnableClick = () => {
    if (!hasImpactData) {
      toast.warning('יש לבצע בדיקת השפעה לפני ההפעלה');
      return;
    }
    if (impactData?.summary?.blockers?.length > 0 && immediateCount > 0) {
      toast.error('לא ניתן להפעיל — יש חסמים פתוחים. נקה את התור תחילה.');
      return;
    }
    setConfirmText('');
    setShowEnableConfirm(true);
  };

  const handleConfirmEnable = async () => {
    if (!confirmValid) return;
    setShowEnableConfirm(false);
    await onToggle(true);
  };

  const handleConfirmDisable = async () => {
    setShowDisableConfirm(false);
    await onToggle(false);
  };

  return (
    <div className={`rounded-2xl border-2 p-5 shadow-sm ${
      killSwitchActive
        ? 'bg-slate-900 border-slate-700'
        : 'bg-red-50 border-red-400'
    }`}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          {killSwitchActive
            ? <PowerOff className="w-6 h-6 text-green-400" />
            : <Power className="w-6 h-6 text-red-600" />
          }
          <div>
            <h2 className={`font-bold text-xl ${killSwitchActive ? 'text-white' : 'text-red-900'}`}>
              Global WhatsApp Kill Switch
            </h2>
            <p className={`text-sm ${killSwitchActive ? 'text-slate-400' : 'text-red-700'}`}>
              {killSwitchActive
                ? 'כל שליחת WhatsApp חסומה — לא ניתן לשלוח כלום'
                : '⚠️ שליחה מאופשרת — הודעות יכולות לצאת'}
            </p>
          </div>
        </div>

        <div className={`px-6 py-3 rounded-xl font-bold text-lg ${
          killSwitchActive
            ? 'bg-red-900 text-red-300'
            : 'bg-red-600 text-white animate-pulse'
        }`}>
          {killSwitchActive ? '🔴 BLOCKED' : '🟢 LIVE'}
        </div>
      </div>

      <div className={`mt-4 p-4 rounded-xl ${killSwitchActive ? 'bg-slate-800' : 'bg-red-100'}`}>
        <div className={`text-sm font-bold mb-2 ${killSwitchActive ? 'text-slate-300' : 'text-red-800'}`}>
          פונקציות מוגנות:
        </div>
        <div className="flex flex-wrap gap-2">
          {['whatsAppQueueWorker', 'enqueueWhatsAppMessage', 'sendWhatsAppMessage', 'claimAndQueueOutbound',
            'reminderMealLog', 'reminderWaterLog', 'workoutMotivationCheck', 'nudgeScheduler',
            'flowTimeoutChecker', 'onTraineeCreated'].map(fn => (
            <span key={fn} className={`text-xs px-2 py-1 rounded-full font-mono ${
              killSwitchActive ? 'bg-green-900 text-green-300' : 'bg-red-200 text-red-800'
            }`}>
              {killSwitchActive ? '🔒' : '🔓'} {fn}
            </span>
          ))}
        </div>
      </div>

      {/* Impact Check Panel — only when kill switch is ON */}
      <ImpactCheckPanel
        killSwitchActive={killSwitchActive}
        onImpactLoaded={setImpactData}
      />

      <div className="mt-4 flex gap-3 items-center">
        {killSwitchActive ? (
          <button
            onClick={handleEnableClick}
            disabled={isToggling}
            className={`px-4 py-2 disabled:opacity-50 text-white rounded-lg text-sm font-medium transition-colors flex items-center gap-2 ${
              !hasImpactData
                ? 'bg-slate-600 hover:bg-slate-500'
                : isRisky
                  ? 'bg-amber-700 hover:bg-amber-600'
                  : 'bg-green-700 hover:bg-green-600'
            }`}
          >
            {isToggling ? <Loader2 className="w-4 h-4 animate-spin" /> : <Power className="w-4 h-4" />}
            הפעל שליחה (Enable Outbound)
          </button>
        ) : (
          <button
            onClick={() => setShowDisableConfirm(true)}
            disabled={isToggling}
            className="px-4 py-2 bg-red-700 hover:bg-red-600 disabled:opacity-50 text-white rounded-lg text-sm font-medium transition-colors flex items-center gap-2"
          >
            {isToggling ? <Loader2 className="w-4 h-4 animate-spin" /> : <PowerOff className="w-4 h-4" />}
            חסום שליחה (Disable Outbound)
          </button>
        )}
        <span className="text-xs text-slate-400 self-center">
          ✅ נשלט דרך DB — SystemConfig["GLOBAL_WHATSAPP_ENABLED"]
        </span>
      </div>

      {/* Enable Confirm Modal */}
      {showEnableConfirm && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4" dir="rtl">
          <div className="bg-slate-900 border border-slate-600 rounded-2xl p-6 max-w-md w-full shadow-2xl">
            <h3 className="text-xl font-bold text-white mb-2">
              {isRisky ? '🚨 אזהרת הפעלה' : '⚠️ הפעלת שליחת WhatsApp'}
            </h3>

            {isRisky ? (
              <div className="bg-red-900/40 border border-red-500 rounded-xl p-3 mb-4 text-sm text-red-300">
                <strong>{immediateCount} הודעות יישלחו מיד</strong> להפעלה זו.
                <br />בשעה הקרובה: ~{impactData?.summary?.estimatedNextHour} הודעות
              </div>
            ) : (
              <div className="bg-green-900/30 border border-green-600 rounded-xl p-3 mb-4 text-sm text-green-300">
                ✅ אין הודעות מיידיות — התור נקי
              </div>
            )}

            <p className="text-slate-300 text-sm mb-4">
              פעולה זו תאפשר שליחת WhatsApp לכל המתאמנים והלידים.<br />
              כל האוטומציות הפעילות יתחילו לשלוח הודעות אמיתיות.
            </p>

            {confirmRequired && (
              <div className="mb-4">
                <label className="text-xs text-slate-400 mb-1 block">
                  הקלד <strong className="text-white font-mono">ENABLE WHATSAPP</strong> לאישור:
                </label>
                <input
                  type="text"
                  value={confirmText}
                  onChange={e => setConfirmText(e.target.value)}
                  placeholder="ENABLE WHATSAPP"
                  className="w-full bg-slate-800 border border-slate-600 text-white rounded-lg px-3 py-2 text-sm font-mono focus:border-amber-500 focus:outline-none"
                  dir="ltr"
                />
              </div>
            )}

            <div className="flex gap-3">
              <button
                onClick={() => setShowEnableConfirm(false)}
                className="flex-1 px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-lg text-sm font-medium transition-colors"
              >
                ביטול
              </button>
              <button
                onClick={handleConfirmEnable}
                disabled={!confirmValid}
                className="flex-1 px-4 py-2 bg-green-700 hover:bg-green-600 disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-lg text-sm font-bold transition-colors"
              >
                ✅ הפעל
              </button>
            </div>
          </div>
        </div>
      )}

      <ConfirmModal
        open={showDisableConfirm}
        onClose={() => setShowDisableConfirm(false)}
        onConfirm={handleConfirmDisable}
        title="🔴 חסימת שליחת WhatsApp"
        description={`פעולה זו תחסום את כל שליחת ה-WhatsApp.\n\nהודעות בתור לא יישלחו עד להפעלה מחדש.`}
        confirmLabel="🔴 חסום הכל"
        confirmClass="bg-red-600 hover:bg-red-700 text-white"
      />
    </div>
  );
}