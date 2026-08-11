/**
 * WhatsAppKillSwitch.jsx — P0 admin operations panel.
 * Admin role only. Coach and trainee are blocked server-side.
 *
 * Actions:
 *  1. Emergency Stop       (atomic: pause + hold + audit)
 *  2. Pause                (manual pause)
 *  3. Resume               (resume ONLY — does NOT release held)
 *  4. Release Held         (controlled batch release — separate from Resume)
 *  5. Discard Held         (destructive clear — separate from Release, requires confirmation)
 *  6. Manual Test Message  (bypasses pause; consumes a rate slot; admin only)
 *
 * Rate-limiter display: shows live rolling-60s window count / limit / remaining.
 * All destructive/release actions require explicit confirmation showing affected count.
 */

import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Button }   from '@/components/ui/button';
import { Input }    from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge }    from '@/components/ui/badge';
import { Card }     from '@/components/ui/card';
import {
  AlertCircle, CheckCircle2, Pause, Play, Trash2, Send,
  RefreshCw, ShieldAlert, Zap, PackageOpen, Gauge,
} from 'lucide-react';
import { toast } from 'sonner';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function invoke(fn, body = {}) {
  return base44.functions.invoke(fn, body);
}

function StatusBadge({ paused }) {
  return paused
    ? <Badge className="bg-red-100 text-red-800 border-red-300 text-sm px-3 py-1">⏸ מושהה (PAUSED)</Badge>
    : <Badge className="bg-green-100 text-green-800 border-green-300 text-sm px-3 py-1">▶ פעיל (RUNNING)</Badge>;
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function WhatsAppKillSwitch() {
  const qc = useQueryClient();

  const [discardConfirm,   setDiscardConfirm]   = useState(false);
  const [releaseConfirm,   setReleaseConfirm]   = useState(null); // null | batchSize number
  const [testPhone,        setTestPhone]         = useState('');
  const [testMessage,      setTestMessage]       = useState('');
  const [pauseReason,      setPauseReason]       = useState('');

  // ── Status query ─────────────────────────────────────────────────────────
  const { data: statusRes, isLoading, refetch } = useQuery({
    queryKey:  ['whatsappKillSwitch'],
    queryFn:   () => invoke('getWhatsAppSystemStatus'),
    refetchInterval: 15_000,
  });

  const gate  = statusRes?.data?.gate  ?? {};
  const queue = statusRes?.data?.queue ?? { by_status: [], sent_last_hour: 0 };
  const rate  = statusRes?.data?.rate  ?? {};   // { count, limit, remaining, window_seconds }
  const paused = gate.paused ?? true;

  const byStatus = {};
  (queue.by_status || []).forEach(r => { byStatus[r.status] = r; });
  const queuedCount  = Number(byStatus['queued']?.total   ?? 0);
  const sendingCount = Number(byStatus['sending']?.total  ?? 0);
  const heldCount    = Number(queue.total_held ?? 0);
  const pickable     = Number(byStatus['queued']?.pickable ?? 0);

  const rateCount     = Number(rate.count     ?? 0);
  const rateLimit     = Number(rate.limit     ?? WHATSAPP_CONFIG_DISPLAY.sendsPerMinute ?? 20);
  const rateRemaining = Number(rate.remaining ?? Math.max(0, rateLimit - rateCount));
  const rateWindow    = Number(rate.window_seconds ?? 60);

  // ── Audit query ───────────────────────────────────────────────────────────
  const { data: auditRes } = useQuery({
    queryKey: ['whatsappOpsAudit'],
    queryFn:  () => invoke('getWhatsAppOpsAudit'),
    refetchInterval: 30_000,
  });
  const auditRows = auditRes?.data?.audit ?? [];

  // ── Shared invalidation helper ────────────────────────────────────────────
  const refreshAll = () => {
    qc.invalidateQueries(['whatsappKillSwitch']);
    qc.invalidateQueries(['whatsappOpsAudit']);
    // Force immediate refetch of status — don't wait for background invalidation
    setTimeout(() => refetch(), 200);
  };

  // ── Emergency stop mutation ───────────────────────────────────────────────
  const emergencyMut = useMutation({
    mutationFn: () => invoke('adminEmergencyStop', { reason: pauseReason || 'Emergency stop' }),
    onSuccess: (res) => {
      if (res?.ok) {
        toast.success(`🛑 עצירת חירום — ${res.data?.held?.held ?? 0} הודעות הוקפאו`);
        refreshAll();
      } else {
        toast.error('שגיאה בעצירת חירום: ' + (res?.error || 'unknown'));
      }
    },
    onError: (e) => toast.error('שגיאה: ' + e.message),
  });

  // ── Pause mutation ────────────────────────────────────────────────────────
  const pauseMut = useMutation({
    mutationFn: () => invoke('adminPauseWhatsApp', { reason: pauseReason || 'Admin manual pause' }),
    onSuccess: (res) => {
      if (res?.ok) {
        toast.success(`✅ מערכת WhatsApp הושהתה — ${res.data?.held?.held ?? 0} הודעות הוקפאו`);
        refreshAll();
      } else {
        toast.error('שגיאה בהשהיית המערכת: ' + (res?.error || 'unknown'));
      }
    },
    onError: (e) => toast.error('שגיאה: ' + e.message),
  });

  // ── Resume mutation ───────────────────────────────────────────────────────
  // Resume does NOT release held messages — that is a separate explicit step.
  const resumeMut = useMutation({
    mutationFn: () => invoke('adminResumeWhatsApp', { reason: 'Admin manual resume' }),
    onSuccess: (res) => {
      if (res?.ok) {
        toast.success('▶ מערכת WhatsApp חזרה לפעילות');
        toast.warning(
          '⚠️ הודעות מוקפאות (is_held) לא שוחזרו אוטומטית. השתמש בשחרור מבוקר.',
          { duration: 8000 }
        );
        refreshAll();
      } else {
        toast.error('שגיאה בהחזרת המערכת: ' + (res?.error || 'unknown'));
      }
    },
    onError: (e) => toast.error('שגיאה: ' + e.message),
  });

  // ── Discard Held mutation (adminClearWhatsAppQueue) ───────────────────────
  // Destructive: permanently deletes all held queued/sending rows.
  // Requires explicit confirmation step showing affected count.
  const discardMut = useMutation({
    mutationFn: () => invoke('adminClearWhatsAppQueue', { reason: 'Admin discarded held queue' }),
    onSuccess: (res) => {
      if (res?.ok) {
        const c = res.data?.cleared;
        toast.success(`🗑 הודעות מוקפאות נמחקו: ${c?.total ?? 0} הודעות (${c?.pending ?? 0} ממתינות, ${c?.sending ?? 0} בשליחה)`);
        setDiscardConfirm(false);
        refreshAll();
      } else {
        toast.error('שגיאה במחיקה: ' + (res?.error || 'unknown'));
      }
    },
    onError: (e) => toast.error('שגיאה: ' + e.message),
  });

  // ── Release Held mutation ─────────────────────────────────────────────────
  // Controlled: releases batchSize held rows for worker pickup.
  // Requires explicit confirmation step showing batch size and remaining count.
  const releaseMut = useMutation({
    mutationFn: (batchSize) => invoke('adminReleaseHeldMessages', {
      batch_size: batchSize,
      reason: `Controlled release post-incident (batch=${batchSize})`,
    }),
    onSuccess: (res) => {
      if (res?.ok) {
        toast.success(`📬 שוחררו ${res.data?.released} הודעות — נותרו ${res.data?.remaining} מוקפאות`);
        setReleaseConfirm(null);
        refreshAll();
      } else {
        toast.error('שגיאה בשחרור: ' + (res?.error || 'unknown'));
      }
    },
    onError: (e) => toast.error('שגיאה: ' + e.message),
  });

  // ── Test message mutation ─────────────────────────────────────────────────
  // adminSendTestMessage: bypasses pause but NOT the global rate limiter.
  const testMut = useMutation({
    mutationFn: () => invoke('adminSendTestMessage', { toPhoneE164: testPhone, message: testMessage }),
    onSuccess: (res) => {
      if (res?.ok && res.data?.sent) {
        toast.success(`✅ הודעת בדיקה נשלחה ל-${testPhone} (${res.data.idMessage})`);
        setTestPhone('');
        setTestMessage('');
        qc.invalidateQueries(['whatsappOpsAudit']);
        refetch(); // rate count changes after test send
      } else if (res?.error === 'rate_limited') {
        toast.error(`⏱ מגבלת קצב גלובלית — ${res.details || ''}`);
      } else {
        toast.error('שגיאה בשליחת הבדיקה: ' + (res?.error || 'unknown'));
      }
    },
    onError: (e) => toast.error('שגיאה: ' + e.message),
  });

  // ─────────────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6 p-4" dir="rtl">

      {/* Header */}
      <div className="flex items-center gap-3">
        <ShieldAlert className="w-6 h-6 text-red-500" />
        <div>
          <h2 className="text-lg font-bold text-slate-900">מרכז בקרת חירום — WhatsApp Kill Switch</h2>
          <p className="text-sm text-slate-500">גישת מנהל בלבד. פעולות בלתי הפיכות מסומנות.</p>
        </div>
        <Button variant="outline" size="sm" className="mr-auto" onClick={() => refetch()} disabled={isLoading}>
          <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
        </Button>
      </div>

      {/* ── Status + operational metrics ─────────────────────────────────────── */}
      <Card className="p-4 border-2" style={{ borderColor: paused ? '#fca5a5' : '#86efac' }}>
        <div className="flex items-center justify-between mb-2">
          <StatusBadge paused={paused} />
          <div className="text-xs text-slate-400 text-left">
            {gate.updated_by && (
              <span>שונה: {gate.updated_by} · {gate.updated_at ? new Date(gate.updated_at).toLocaleString('he-IL') : '—'}</span>
            )}
          </div>
        </div>
        {gate.reason && <p className="text-xs text-slate-600 mb-2">סיבה: {gate.reason}</p>}
        {gate.env_override && (
          <p className="text-xs text-amber-700 font-medium mb-2">⚠ WHATSAPP_AUTOMATIONS_PAUSED=true בסביבה (דריסת קוד קשה)</p>
        )}

        {/* Queue metrics */}
        <div className="grid grid-cols-3 md:grid-cols-6 gap-2 mt-2">
          {[
            { label: 'גודל תור',     val: queuedCount,                   color: 'text-slate-800' },
            { label: 'ניתן לאיסוף', val: pickable,                       color: pickable > 0 ? 'text-red-700 font-bold' : 'text-green-700' },
            { label: 'בשליחה',       val: sendingCount,                  color: 'text-blue-700' },
            { label: 'מוקפאות',      val: heldCount,                     color: 'text-purple-700' },
            { label: 'נכשלו היום',   val: queue.failed_today ?? 0,       color: 'text-red-600' },
            { label: 'נשלחו/שעה',   val: queue.sent_last_hour ?? 0,     color: 'text-slate-600' },
          ].map(({ label, val, color }) => (
            <div key={label} className="bg-slate-50 rounded p-2 text-center">
              <div className={`text-lg font-bold ${color}`}>{val}</div>
              <div className="text-xs text-slate-500">{label}</div>
            </div>
          ))}
        </div>

        {/* ── Rate-limiter panel ──────────────────────────────────────────────── */}
        {/* Shows live rolling-60s window stats from the backend rate limiter.
            Backed by whatsapp_rate_limit table via admitSend() PostgreSQL advisory lock.
            count/limit/remaining come directly from getWhatsAppSystemStatus → getRateState(). */}
        <div className="mt-3 border border-indigo-200 rounded-lg bg-indigo-50 p-3">
          <div className="flex items-center gap-2 mb-2">
            <Gauge className="w-4 h-4 text-indigo-600" />
            <span className="text-xs font-semibold text-indigo-800">
              מגבלת קצב גלובלית (Rolling {rateWindow}s Window)
            </span>
            <span className="text-xs text-indigo-500 mr-auto">
              מתאפס בתחום גלגלתי — לא לפי דקה קלנדרית
            </span>
          </div>
          <div className="grid grid-cols-3 gap-2">
            <div className="bg-white rounded p-2 text-center border border-indigo-100">
              <div className={`text-xl font-bold ${rateCount >= rateLimit ? 'text-red-600' : 'text-indigo-700'}`}>
                {statusRes ? rateCount : '—'}
              </div>
              <div className="text-xs text-slate-500">שימוש נוכחי</div>
            </div>
            <div className="bg-white rounded p-2 text-center border border-indigo-100">
              <div className="text-xl font-bold text-slate-700">{statusRes ? rateLimit : '—'}</div>
              <div className="text-xs text-slate-500">מגבלה ({rateWindow}s)</div>
            </div>
            <div className="bg-white rounded p-2 text-center border border-indigo-100">
              <div className={`text-xl font-bold ${rateRemaining === 0 ? 'text-red-600' : 'text-green-600'}`}>
                {statusRes ? rateRemaining : '—'}
              </div>
              <div className="text-xs text-slate-500">נותר בחלון</div>
            </div>
          </div>
          {statusRes && rateCount >= rateLimit && (
            <p className="text-xs text-red-700 font-semibold mt-2 text-center">
              ⛔ מגבלת הקצב הגיעה — שליחות נחסמות עד שהחלון יתחדש
            </p>
          )}
        </div>

        {/* Secondary metrics */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mt-2">
          <div className="bg-slate-50 rounded p-2">
            <div className="text-xs text-slate-500">הודעה ממתינה ישנה ביותר</div>
            <div className="text-xs font-medium text-slate-700 truncate">
              {queue.oldest_pickable_created_at
                ? new Date(queue.oldest_pickable_created_at).toLocaleString('he-IL')
                : '—'}
            </div>
          </div>
          <div className="bg-slate-50 rounded p-2">
            <div className="text-xs text-slate-500">הודעה מוקפאת ישנה ביותר</div>
            <div className="text-xs font-medium text-slate-700 truncate">
              {(() => {
                const oldestHeld = queue.by_status?.reduce((m, r) => {
                  if (!r.oldest_held) return m;
                  return !m || new Date(r.oldest_held) < new Date(m) ? r.oldest_held : m;
                }, null);
                return oldestHeld ? new Date(oldestHeld).toLocaleString('he-IL') : '—';
              })()}
            </div>
          </div>
          <div className="bg-slate-50 rounded p-2">
            <div className="text-xs text-slate-500">מצב מקור</div>
            <div className="text-xs font-medium text-slate-700">
              {gate.source === 'database'       ? 'מסד נתונים'
               : gate.source === 'default_absent' ? 'ברירת מחדל (אין שורה)'
               : gate.source === 'db_error'       ? '⚠ שגיאת DB'
               : gate.source || '—'}
            </div>
          </div>
          <div className="bg-slate-50 rounded p-2">
            <div className="text-xs text-slate-500">מצב פעיל</div>
            <div className="text-sm font-bold text-slate-800">
              {paused ? '⏸ מושהה' : '▶ פעיל'}
              {gate.source === 'default_absent' && <span className="text-xs text-amber-600 mr-1"> (ברירת מחדל)</span>}
            </div>
          </div>
        </div>
      </Card>

      {/* ── Emergency Stop ────────────────────────────────────────────────────── */}
      <Card className="p-4 border-2 border-red-400 bg-red-50">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-2">
            <Zap className="w-5 h-5 text-red-600" />
            <div>
              <div className="font-bold text-red-800">עצירת חירום (Emergency Stop)</div>
              <div className="text-xs text-red-600">
                עוצר הכל בפעולה אטומית אחת: מפסיק שיקול + מקפיא תור + כותב ביקורת.
                המסך יתרענן מיד לאחר הלחיצה ויציג PAUSED.
              </div>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <Input
              placeholder="סיבה (אופציונלי)"
              value={pauseReason}
              onChange={e => setPauseReason(e.target.value)}
              className="text-sm w-48"
            />
            <Button
              className="bg-red-700 hover:bg-red-800 text-white font-bold px-6"
              disabled={paused || emergencyMut.isPending}
              onClick={() => emergencyMut.mutate()}
            >
              {emergencyMut.isPending ? 'עוצר...' : '🛑 עצור הכל'}
            </Button>
          </div>
        </div>
        {paused && (
          <p className="text-sm text-green-700 mt-2 text-center font-bold bg-green-50 rounded p-2">
            ✅ המערכת מושהית (PAUSED) — אין הודעות יוצאות
          </p>
        )}
      </Card>

      {/* ── Action grid ──────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">

        {/* 1. Pause */}
        <Card className="p-4 space-y-3">
          <div className="flex items-center gap-2 text-red-700 font-semibold">
            <Pause className="w-4 h-4" />
            עצור התראות ותזכורות
          </div>
          <p className="text-xs text-slate-500">
            מושהה + מקפיא תור. לשימוש מניעתי — לא עצירת חירום.
          </p>
          <Button
            className="w-full bg-red-600 hover:bg-red-700 text-white"
            disabled={paused || pauseMut.isPending}
            onClick={() => pauseMut.mutate()}
          >
            {pauseMut.isPending ? 'מושהה...' : 'עצור עכשיו'}
          </Button>
          {paused && <p className="text-xs text-green-600 text-center">המערכת כבר מושהית ✓</p>}
        </Card>

        {/* 2. Resume — does NOT release held */}
        <Card className="p-4 space-y-3">
          <div className="flex items-center gap-2 text-green-700 font-semibold">
            <Play className="w-4 h-4" />
            חדש פעילות (Resume)
          </div>
          <p className="text-xs text-slate-500">
            מחדש שליחה. הודעות מוקפאות (is_held) נשארות מוקפאות — שחרר אותן ידנית בנפרד.
          </p>
          {heldCount > 0 && (
            <p className="text-xs text-amber-600 font-medium">
              ⚠ {heldCount} הודעות עדיין מוקפאות. שחרר אותן בכרטיס השחרור המבוקר שלהלן.
            </p>
          )}
          <Button
            className="w-full bg-green-600 hover:bg-green-700 text-white"
            disabled={!paused || resumeMut.isPending}
            onClick={() => resumeMut.mutate()}
          >
            {resumeMut.isPending ? 'מחדש...' : 'חדש פעילות'}
          </Button>
          {!paused && <p className="text-xs text-green-600 text-center">המערכת כבר פעילה ✓</p>}
        </Card>

        {/* 3. Discard Held (adminClearWhatsAppQueue) — destructive, paused only */}
        <Card className="p-4 space-y-3">
          <div className="flex items-center gap-2 text-amber-700 font-semibold">
            <Trash2 className="w-4 h-4" />
            מחק הודעות מוקפאות (Discard Held)
          </div>
          <p className="text-xs text-slate-500">
            מוחק לצמיתות את כל ההודעות הממתינות המוקפאות. פעולה בלתי הפיכה.
            מחייב מצב מושהה. לא משפיע על היסטוריית שליחות.
          </p>
          <div className="text-center">
            <span className="text-2xl font-bold text-amber-700">{heldCount}</span>
            <span className="text-xs text-slate-500 mr-1">הודעות מוקפאות יימחקו</span>
          </div>
          {!paused && (
            <p className="text-xs text-red-600 font-medium text-center">חייב להשהות קודם</p>
          )}
          {!discardConfirm ? (
            <Button
              className="w-full bg-amber-600 hover:bg-amber-700 text-white"
              disabled={!paused || discardMut.isPending || heldCount === 0}
              onClick={() => setDiscardConfirm(true)}
            >
              {heldCount === 0 ? 'אין הודעות מוקפאות' : `מחק ${heldCount} הודעות`}
            </Button>
          ) : (
            <div className="space-y-2 border-2 border-red-300 rounded-lg p-3 bg-red-50">
              <p className="text-xs text-red-800 font-bold text-center">
                ⛔ אישור נדרש — פעולה בלתי הפיכה
              </p>
              <p className="text-xs text-red-700 text-center">
                {heldCount} הודעות מוקפאות יימחקו לצמיתות.
                לא ניתן לשחזר. מסרים שהגיעו ל-Green API לא ניתן לבטל.
              </p>
              <div className="flex gap-2">
                <Button
                  className="flex-1 bg-red-600 hover:bg-red-700 text-white text-sm"
                  disabled={discardMut.isPending}
                  onClick={() => discardMut.mutate()}
                >
                  {discardMut.isPending ? 'מוחק...' : `אשר מחיקת ${heldCount}`}
                </Button>
                <Button
                  variant="outline"
                  className="flex-1 text-sm"
                  onClick={() => setDiscardConfirm(false)}
                >
                  ביטול
                </Button>
              </div>
            </div>
          )}
        </Card>

      </div>

      {/* ── Release Held (controlled batch) ──────────────────────────────────── */}
      {heldCount > 0 && (
        <Card className="p-4 border border-purple-200 bg-purple-50 space-y-3">
          <div className="flex items-center gap-2 text-purple-800 font-semibold">
            <PackageOpen className="w-4 h-4" />
            שחרור מבוקר — Release Held ({heldCount} מוקפאות)
          </div>
          <p className="text-xs text-purple-700">
            משחרר קבוצה של הודעות מוקפאות לתור. ה-Worker יעבד אותן לפי מגבלת הקצב הגלובלית.
            <strong> שחרור אינו מחייב מצב מושהה.</strong> קרא שוב לאחר כל שחרור.
          </p>
          <p className="text-xs text-indigo-700 bg-indigo-50 rounded px-2 py-1">
            💡 קצב נוכחי: {rateCount}/{rateLimit} שליחות ב-{rateWindow}s האחרונות.
            {rateRemaining > 0
              ? ` נותרו ${rateRemaining} חריצים בחלון הנוכחי.`
              : ' חלון הקצב מלא — Worker יחכה לחלון הבא.'}
          </p>

          {releaseConfirm === null ? (
            /* Batch size selection */
            <div className="flex gap-2">
              {[10, 25, 50].map(n => (
                <Button
                  key={n}
                  variant="outline"
                  size="sm"
                  className="flex-1 border-purple-300 text-purple-700"
                  disabled={releaseMut.isPending}
                  onClick={() => setReleaseConfirm(n)}
                >
                  שחרר {Math.min(n, heldCount)}
                </Button>
              ))}
            </div>
          ) : (
            /* Confirmation step */
            <div className="border-2 border-purple-400 rounded-lg p-3 bg-white space-y-2">
              <p className="text-sm font-bold text-purple-800 text-center">אשר שחרור מבוקר</p>
              <p className="text-xs text-purple-700 text-center">
                {Math.min(releaseConfirm, heldCount)} הודעות ישוחררו לתור.
                {(heldCount - releaseConfirm) > 0
                  ? ` ${Math.max(0, heldCount - releaseConfirm)} יישארו מוקפאות.`
                  : ' כל ההודעות ישוחררו.'}
              </p>
              <p className="text-xs text-indigo-600 text-center">
                Worker יעבד אותן לפי מגבלת {rateLimit} הודעות/{rateWindow}s.
              </p>
              <div className="flex gap-2">
                <Button
                  className="flex-1 bg-purple-600 hover:bg-purple-700 text-white text-sm"
                  disabled={releaseMut.isPending}
                  onClick={() => releaseMut.mutate(releaseConfirm)}
                >
                  {releaseMut.isPending
                    ? 'משחרר...'
                    : `אשר שחרור ${Math.min(releaseConfirm, heldCount)}`}
                </Button>
                <Button
                  variant="outline"
                  className="flex-1 text-sm"
                  onClick={() => setReleaseConfirm(null)}
                >
                  ביטול
                </Button>
              </div>
            </div>
          )}
        </Card>
      )}

      {/* ── Manual Test Message ───────────────────────────────────────────────── */}
      <Card className="p-4 space-y-3 border-2 border-slate-300">
        <div className="flex items-center gap-2 text-slate-700 font-semibold">
          <Send className="w-4 h-4" />
          הודעת בדיקה ידנית (Manual Admin Test)
        </div>

        {/* CRITICAL WARNING — must be visible */}
        <div className="bg-amber-50 border border-amber-300 rounded-lg px-3 py-2 text-xs font-medium text-amber-800">
          ⚠️ <strong>Manual admin test — may send even while WhatsApp automations are paused.</strong>
          <br />
          הודעה זו עוקפת את מצב ה-Pause אך צורכת חריץ מגבלת קצב גלובלי.
          שולח הודעה אחת בלבד ישירות דרך Green API. לא מפעיל תור.
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <Input
            placeholder="+972501234567 (E.164)"
            value={testPhone}
            onChange={e => setTestPhone(e.target.value)}
            className="text-sm"
            dir="ltr"
          />
          <Textarea
            placeholder="תוכן ההודעה..."
            value={testMessage}
            onChange={e => setTestMessage(e.target.value)}
            rows={2}
            className="text-sm"
          />
        </div>
        <Button
          className="bg-slate-700 hover:bg-slate-800 text-white"
          disabled={!testPhone || !testMessage || testMut.isPending}
          onClick={() => testMut.mutate()}
        >
          {testMut.isPending ? 'שולח...' : 'שלח הודעת בדיקה (ידנית)'}
        </Button>
        <p className="text-xs text-slate-400 text-center">
          פעולה זו מוגבלת לתפקיד Admin בלבד ונרשמת ביומן הביקורת.
          {rateRemaining === 0 && ' ⚠️ מגבלת קצב גלובלית מלאה — הפעולה תיחסם.'}
        </p>
      </Card>

      {/* ── Audit log ────────────────────────────────────────────────────────── */}
      <Card className="p-4">
        <h3 className="font-semibold text-slate-800 mb-3">יומן פעולות (50 אחרונות)</h3>
        {auditRows.length === 0 ? (
          <p className="text-sm text-slate-400 text-center py-4">אין פעולות רשומות</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-slate-700">
              <thead>
                <tr className="border-b text-slate-500">
                  <th className="text-right pb-2">זמן</th>
                  <th className="text-right pb-2">פעולה</th>
                  <th className="text-right pb-2">שחקן</th>
                  <th className="text-right pb-2">קודם</th>
                  <th className="text-right pb-2">חדש</th>
                  <th className="text-right pb-2">שורות</th>
                  <th className="text-right pb-2">סיבה</th>
                </tr>
              </thead>
              <tbody>
                {auditRows.map(row => (
                  <tr key={row.id} className="border-b last:border-0 hover:bg-slate-50">
                    <td className="py-1.5 pl-3 font-mono">
                      {new Date(row.created_at).toLocaleString('he-IL')}
                    </td>
                    <td className="py-1.5 pl-3">
                      <Badge variant="outline" className="text-xs">
                        {row.action === 'pause'               ? '⏸ השהיה'
                         : row.action === 'emergency_stop'    ? '🛑 חירום'
                         : row.action === 'auto_pause'        ? '🔴 אוטו'
                         : row.action === 'resume'            ? '▶ חידוש'
                         : row.action === 'queue_clear'       ? '🗑 מחיקה'
                         : row.action === 'held_messages_released' ? '📬 שחרור'
                         : row.action === 'test_message_sent' ? '📨 בדיקה'
                         : row.action}
                      </Badge>
                    </td>
                    <td className="py-1.5 pl-3">{row.actor_id}</td>
                    <td className="py-1.5 pl-3">{row.previous_state}</td>
                    <td className="py-1.5 pl-3">{row.new_state}</td>
                    <td className="py-1.5 pl-3 font-mono">{row.affected_count}</td>
                    <td className="py-1.5 text-slate-400 max-w-xs truncate">{row.reason}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

    </div>
  );
}

// Display constant for rate limit label when backend hasn't loaded yet.
// Matches WHATSAPP_SENDS_PER_MINUTE default in whatsappConfig.js.
const WHATSAPP_CONFIG_DISPLAY = { sendsPerMinute: 20 };
