import React, { useState } from 'react';
import { Inbox, Trash2, RefreshCw, ChevronDown, ChevronUp, Loader2, RotateCcw, FlaskConical } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { toast } from 'sonner';
import ConfirmModal from './ConfirmModal';

export default function QueueSection({ queueCounts, onRefresh, killSwitchActive }) {
  const [showPurgeConfirm, setShowPurgeConfirm] = useState(false);
  const [purging, setPurging] = useState(false);
  const [showPreview, setShowPreview] = useState(false);

  // Hard Reset state
  const [showHardReset, setShowHardReset] = useState(false);
  const [resetConfirmText, setResetConfirmText] = useState('');
  const [resetting, setResetting] = useState(false);
  const [resetResult, setResetResult] = useState(null);
  const [includeFailed, setIncludeFailed] = useState(true);

  // Simulate + Reset state
  const [simResetting, setSimResetting] = useState(false);
  const [simResult, setSimResult] = useState(null);

  const { data: queueItems = [] } = useQuery({
    queryKey: ['wcc', 'queuePreview'],
    queryFn: () => base44.entities.WhatsAppMessageQueue.filter({}),
    enabled: showPreview,
  });

  const pendingItems = queueItems.filter(q => ['queued', 'sending', 'failed'].includes(q.status));

  const handlePurge = async () => {
    setPurging(true);
    try {
      const res = await base44.functions.invoke('cleanWhatsAppQueue', { deleteAll: true });
      toast.success(`נמחקו ${res?.data?.deleted || 0} הודעות מהתור`);
      onRefresh();
      setShowPreview(false);
    } catch (e) {
      toast.error('שגיאה בניקוי התור: ' + e.message);
    } finally {
      setPurging(false);
      setShowPurgeConfirm(false);
    }
  };

  const handleHardReset = async () => {
    if (resetConfirmText.trim() !== 'RESET QUEUE') return;
    setResetting(true);
    setResetResult(null);
    try {
      const res = await base44.functions.invoke('resetWhatsAppQueue', { includeFailed });
      const data = res?.data;
      if (!data?.ok) {
        toast.error('שגיאה: ' + (data?.error || 'Unknown error'));
        return;
      }
      setResetResult(data);
      toast.success(`✅ איפוס הושלם — ${data.deleted} הודעות נמחקו`);
      setShowHardReset(false);
      setResetConfirmText('');
      setShowPreview(false);
      onRefresh();
    } catch (e) {
      toast.error('שגיאה באיפוס: ' + e.message);
    } finally {
      setResetting(false);
    }
  };

  const handleResetAndSimulate = async () => {
    if (resetConfirmText.trim() !== 'RESET QUEUE') return;
    setSimResetting(true);
    setResetResult(null);
    setSimResult(null);
    try {
      // Step 1: Hard reset
      const resetRes = await base44.functions.invoke('resetWhatsAppQueue', { includeFailed });
      const resetData = resetRes?.data;
      if (!resetData?.ok) {
        toast.error('שגיאה באיפוס: ' + (resetData?.error || 'Unknown error'));
        return;
      }
      setResetResult(resetData);

      // Step 2: Run simulation (read-only, no sending)
      const simRes = await base44.functions.invoke('simulateOutboundMessages', {});
      setSimResult(simRes?.data);

      toast.success(`✅ איפוס + סימולציה הושלמו — ${resetData.deleted} נמחקו`);
      setShowHardReset(false);
      setResetConfirmText('');
      setShowPreview(false);
      onRefresh();
    } catch (e) {
      toast.error('שגיאה: ' + e.message);
    } finally {
      setSimResetting(false);
    }
  };

  const statCards = [
    { label: 'בתור', value: queueCounts.queued, color: 'text-amber-600', bg: 'bg-amber-50 border-amber-200' },
    { label: 'שולח', value: queueCounts.sending, color: 'text-blue-600', bg: 'bg-blue-50 border-blue-200' },
    { label: 'כשלון', value: queueCounts.failed, color: 'text-red-600', bg: 'bg-red-50 border-red-200' },
    { label: 'נשלח היום', value: queueCounts.sent_today, color: 'text-green-600', bg: 'bg-green-50 border-green-200' },
  ];

  const resetConfirmValid = resetConfirmText.trim() === 'RESET QUEUE';
  const totalPending = queueCounts.total_unsent || 0;

  return (
    <div className="bg-white rounded-2xl border-2 border-slate-200 p-5 shadow-sm">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Inbox className="w-5 h-5 text-slate-600" />
          <h2 className="font-bold text-slate-800 text-lg">📬 Message Queue</h2>
        </div>
        <button
          onClick={onRefresh}
          className="flex items-center gap-1 px-3 py-1.5 bg-slate-100 hover:bg-slate-200 rounded-lg text-sm text-slate-600 transition-colors min-h-0 min-w-0"
        >
          <RefreshCw className="w-3.5 h-3.5" /> רענן
        </button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
        {statCards.map(s => (
          <div key={s.label} className={`rounded-xl border-2 p-4 ${s.bg}`}>
            <div className="text-xs text-slate-500 mb-1">{s.label}</div>
            <div className={`text-3xl font-bold ${s.color}`}>{s.value}</div>
          </div>
        ))}
      </div>

      {/* Status bar */}
      <div className={`rounded-xl p-3 mb-4 border-2 ${
        totalPending === 0
          ? 'bg-green-50 border-green-200'
          : 'bg-amber-50 border-amber-300'
      }`}>
        <span className="font-bold">
          {totalPending === 0
            ? '✅ התור נקי — אין הודעות ממתינות'
            : `⚠️ ${totalPending} הודעות ממתינות לשליחה`}
        </span>
      </div>

      {/* Safety clarification when outbound enabled but queue empty */}
      {killSwitchActive === false && totalPending === 0 && (
        <div className="rounded-xl bg-blue-50 border-2 border-blue-200 p-3 mb-4 text-sm text-blue-800">
          ℹ️ <strong>Outbound פעיל, אך אין הודעות בתור.</strong> לא נשלח דבר עד שהודעה תתווסף לתור על ידי scheduler.
        </div>
      )}

      {/* Reset result summary + Safety Report */}
      {resetResult && (
        <div className="rounded-xl bg-green-50 border-2 border-green-300 p-3 mb-4 text-sm space-y-2">
          <div className="font-bold text-green-800">✅ QUEUE_RESET_BUTTON_FIXED_AND_SAFE</div>
          <div className="font-medium text-green-700">נמחקו: {resetResult.deleted} הודעות</div>
          <div className="flex flex-wrap gap-2 text-xs text-green-700">
            {resetResult.breakdown?.queued > 0 && <span className="bg-white rounded px-2 py-0.5 border">בתור: {resetResult.breakdown.queued}</span>}
            {resetResult.breakdown?.failed > 0 && <span className="bg-white rounded px-2 py-0.5 border">כשלון: {resetResult.breakdown.failed}</span>}
            {resetResult.breakdown?.sending_stuck > 0 && <span className="bg-white rounded px-2 py-0.5 border">תקועים: {resetResult.breakdown.sending_stuck}</span>}
            {resetResult.breakdown?.retry > 0 && <span className="bg-white rounded px-2 py-0.5 border">retry: {resetResult.breakdown.retry}</span>}
          </div>
          <div className="text-xs text-green-600 pt-1 border-t border-green-200">
            🔒 הודעות sent לא נמחקו · נשלח ע"י: {resetResult.performedBy}
          </div>
          {simResult && (
            <div className="pt-1 border-t border-green-200 text-green-700">
              🧪 סימולציה: {simResult?.total || 0} הודעות פוטנציאליות בתור החדש
            </div>
          )}
          {killSwitchActive === false && (
            <div className="pt-1 border-t border-green-200 bg-amber-50 rounded-lg p-2 text-amber-800 font-medium text-xs">
              ⚠️ Outbound עדיין פעיל! מומלץ לכבות Kill Switch עד שתאשר שהכל תקין.
            </div>
          )}
        </div>
      )}

      {/* Action buttons */}
      <div className="flex gap-2 flex-wrap">
        {totalPending > 0 && (
          <>
            {/* Soft purge (existing) */}
            <button
              onClick={() => setShowPurgeConfirm(true)}
              className="flex items-center gap-2 px-4 py-2 bg-slate-600 hover:bg-slate-700 text-white rounded-lg text-sm font-medium transition-colors min-h-0 min-w-0"
            >
              <Trash2 className="w-4 h-4" />
              נקה ישן ({totalPending})
            </button>

            {/* Preview */}
            <button
              onClick={() => setShowPreview(!showPreview)}
              className="flex items-center gap-2 px-4 py-2 bg-slate-700 hover:bg-slate-800 text-white rounded-lg text-sm font-medium transition-colors min-h-0 min-w-0"
            >
              {showPreview ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
              📊 Preview
            </button>
          </>
        )}

        {/* Hard Reset — always visible */}
        <button
          onClick={() => { setShowHardReset(true); setResetConfirmText(''); }}
          className="flex items-center gap-2 px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg text-sm font-bold transition-colors min-h-0 min-w-0"
        >
          <RotateCcw className="w-4 h-4" />
          🧹 אפס תור הודעות (Reset Queue)
        </button>

        <div className="px-4 py-2 bg-slate-100 rounded-lg text-sm text-slate-500">
          🔒 Worker מושהה (kill switch פעיל)
        </div>
      </div>

      {/* Queue Preview */}
      {showPreview && pendingItems.length > 0 && (
        <div className="mt-4 space-y-2 max-h-72 overflow-y-auto">
          <div className="text-xs font-bold text-slate-600 mb-2">
            מציג {Math.min(pendingItems.length, 20)} מתוך {pendingItems.length} הודעות ממתינות:
          </div>
          {pendingItems.slice(0, 20).map((msg) => (
            <div key={msg.id} className="p-3 bg-slate-50 rounded-xl border border-slate-200 text-sm">
              <div className="flex items-center justify-between mb-1">
                <span className="font-medium text-slate-800">{msg.to_name || 'Unknown'}</span>
                <div className="flex items-center gap-2">
                  <span className="font-mono text-xs text-slate-400">
                    {(msg.to_phone_e164 || '').slice(0, 6)}****
                  </span>
                  <span className={`text-xs px-2 py-0.5 rounded-full font-bold ${
                    msg.status === 'failed' ? 'bg-red-100 text-red-700' :
                    msg.status === 'sending' ? 'bg-blue-100 text-blue-700' :
                    'bg-amber-100 text-amber-700'
                  }`}>{msg.status}</span>
                </div>
              </div>
              {msg.template_key && (
                <div className="text-xs text-slate-400 font-mono mb-1">{msg.template_key}</div>
              )}
              <div className="text-xs text-slate-600 bg-white p-2 rounded-lg border border-slate-100 leading-relaxed line-clamp-2" dir="auto">
                {msg.rendered_text?.slice(0, 150)}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Soft purge confirm */}
      <ConfirmModal
        open={showPurgeConfirm}
        onClose={() => setShowPurgeConfirm(false)}
        onConfirm={handlePurge}
        title="🗑️ ניקוי תור ה-WhatsApp"
        description={`פעולה זו תמחק הודעות ישנות/כשלו (failed/cancelled/old).\n\nהודעות שנשלחו (sent) לא יימחקו.\n\nלא ניתן לבטל פעולה זו.`}
        confirmLabel={purging ? 'מוחק...' : `מחק`}
        confirmClass="bg-red-600 hover:bg-red-700 text-white"
        loading={purging}
      />

      {/* HARD RESET MODAL */}
      {showHardReset && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4" dir="rtl">
          <div className="bg-white rounded-2xl p-6 max-w-md w-full shadow-2xl border-2 border-red-300">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 bg-red-100 rounded-full flex items-center justify-center flex-shrink-0">
                <RotateCcw className="w-5 h-5 text-red-600" />
              </div>
              <h3 className="text-xl font-bold text-slate-900">
                אתה עומד למחוק את כל ההודעות שלא נשלחו
              </h3>
            </div>

            {/* Breakdown */}
            <div className="rounded-xl bg-red-50 border border-red-200 p-4 mb-4 text-sm space-y-1.5">
              <div className="font-bold text-red-800 mb-2">📊 מה יימחק:</div>
              <div className="grid grid-cols-2 gap-2">
                <div className="flex justify-between bg-white rounded-lg px-3 py-2 border">
                  <span className="text-slate-600">בתור (queued)</span>
                  <span className="font-bold text-amber-700">{queueCounts.queued || 0}</span>
                </div>
                <div className="flex justify-between bg-white rounded-lg px-3 py-2 border">
                  <span className="text-slate-600">שולח (sending)</span>
                  <span className="font-bold text-blue-700">{queueCounts.sending || 0}</span>
                </div>
                <div className="flex justify-between bg-white rounded-lg px-3 py-2 border">
                  <span className="text-slate-600">כשלון (failed)</span>
                  <span className="font-bold text-red-700">{queueCounts.failed || 0}</span>
                </div>
                <div className="flex justify-between bg-white rounded-lg px-3 py-2 border">
                  <span className="text-slate-600">סה"כ</span>
                  <span className="font-bold text-slate-900">{totalPending}</span>
                </div>
              </div>
            </div>

            {/* Include failed toggle */}
            <div className="flex items-center gap-3 mb-4 p-3 bg-slate-50 rounded-xl border">
              <input
                type="checkbox"
                id="includeFailed"
                checked={includeFailed}
                onChange={e => setIncludeFailed(e.target.checked)}
                className="w-4 h-4 accent-red-600"
              />
              <label htmlFor="includeFailed" className="text-sm text-slate-700">
                כלול גם הודעות שנכשלו (failed)
              </label>
            </div>

            {/* Warning */}
            <div className="rounded-xl bg-amber-50 border border-amber-300 p-3 mb-4 text-sm text-amber-800">
              ⚠️ <strong>הפעולה תמחק את כל ההודעות שלא נשלחו לצמיתות.</strong>
              <br />הודעות שנשלחו (sent) לא יימחקו.
            </div>

            {/* Confirm input */}
            <div className="mb-4">
              <label className="text-xs text-slate-500 mb-1 block">
                הקלד <strong className="font-mono text-slate-800">RESET QUEUE</strong> לאישור:
              </label>
              <input
                type="text"
                value={resetConfirmText}
                onChange={e => setResetConfirmText(e.target.value)}
                placeholder="RESET QUEUE"
                className="w-full border-2 rounded-lg px-3 py-2 text-sm font-mono focus:border-red-400 focus:outline-none"
                dir="ltr"
                autoFocus
              />
            </div>

            {/* Buttons */}
            <div className="flex gap-2">
              <button
                onClick={() => { setShowHardReset(false); setResetConfirmText(''); }}
                className="flex-1 px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-sm font-medium transition-colors"
              >
                ביטול
              </button>
              <button
                onClick={handleHardReset}
                disabled={!resetConfirmValid || resetting}
                className="flex-1 px-4 py-2 bg-red-600 hover:bg-red-700 disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-lg text-sm font-bold transition-colors flex items-center justify-center gap-2"
              >
                {resetting ? <Loader2 className="w-4 h-4 animate-spin" /> : <RotateCcw className="w-4 h-4" />}
                🧹 אפס תור
              </button>
              <button
                onClick={handleResetAndSimulate}
                disabled={!resetConfirmValid || simResetting || resetting}
                className="flex-1 px-4 py-2 bg-violet-600 hover:bg-violet-700 disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-lg text-sm font-bold transition-colors flex items-center justify-center gap-2"
              >
                {simResetting ? <Loader2 className="w-4 h-4 animate-spin" /> : <FlaskConical className="w-4 h-4" />}
                🧪 נקה + סימולציה
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}