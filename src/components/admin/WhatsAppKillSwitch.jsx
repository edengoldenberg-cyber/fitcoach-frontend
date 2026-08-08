/**
 * WhatsAppKillSwitch.jsx — P0 admin operations panel.
 * Admin role only. Coach and trainee are blocked server-side.
 *
 * Actions:
 *  1. עצור התראות ותזכורות  (pause)
 *  2. נקה תור הודעות         (clear — requires confirmation + paused state)
 *  3. החזר התראות ותזכורות  (resume)
 *  4. שלח הודעת בדיקה        (test message — available while paused)
 */

import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Button }  from '@/components/ui/button';
import { Input }   from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge }   from '@/components/ui/badge';
import { Card }    from '@/components/ui/card';
import { AlertCircle, CheckCircle2, Pause, Play, Trash2, Send, RefreshCw, ShieldAlert, Zap, PackageOpen } from 'lucide-react';
import { toast }   from 'sonner';

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

  const [clearConfirm,     setClearConfirm]     = useState(false);
  const [testPhone,        setTestPhone]         = useState('');
  const [testMessage,      setTestMessage]       = useState('');
  const [pauseReason,      setPauseReason]       = useState('');

  // ── Status query ─────────────────────────────────────────────────────────
  const { data: statusRes, isLoading, refetch } = useQuery({
    queryKey:  ['whatsappKillSwitch'],
    queryFn:   () => invoke('getWhatsAppSystemStatus'),
    refetchInterval: 15_000,
  });

  const gate   = statusRes?.data?.gate   ?? {};
  const queue  = statusRes?.data?.queue  ?? { by_status: [], sent_last_hour: 0 };
  const paused = gate.paused ?? true;

  const byStatus = {};
  (queue.by_status || []).forEach(r => { byStatus[r.status] = r; });
  const queuedCount  = Number(byStatus['queued']?.total  ?? 0);
  const sendingCount = Number(byStatus['sending']?.total ?? 0);
  const heldCount    = Number(byStatus['queued']?.held   ?? 0) + Number(byStatus['sending']?.held ?? 0);
  const failedCount  = Number(byStatus['failed']?.total  ?? 0);
  const pickable     = Number(byStatus['queued']?.pickable ?? 0);

  // ── Audit query ───────────────────────────────────────────────────────────
  const { data: auditRes } = useQuery({
    queryKey: ['whatsappOpsAudit'],
    queryFn:  () => invoke('getWhatsAppOpsAudit'),
    refetchInterval: 30_000,
  });
  const auditRows = auditRes?.data?.audit ?? [];

  // ── Emergency stop mutation ───────────────────────────────────────────────
  const emergencyMut = useMutation({
    mutationFn: () => invoke('adminEmergencyStop', { reason: pauseReason || 'Emergency stop' }),
    onSuccess: (res) => {
      if (res?.ok) {
        toast.success(`🛑 עצירת חירום — ${res.data?.held?.held ?? 0} הודעות הוקפאו`);
        qc.invalidateQueries(['whatsappKillSwitch']);
        qc.invalidateQueries(['whatsappOpsAudit']);
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
        qc.invalidateQueries(['whatsappKillSwitch']);
        qc.invalidateQueries(['whatsappOpsAudit']);
      } else {
        toast.error('שגיאה בהשהיית המערכת: ' + (res?.error || 'unknown'));
      }
    },
    onError: (e) => toast.error('שגיאה: ' + e.message),
  });

  // ── Resume mutation ───────────────────────────────────────────────────────
  const resumeMut = useMutation({
    mutationFn: () => invoke('adminResumeWhatsApp', { reason: 'Admin manual resume' }),
    onSuccess: (res) => {
      if (res?.ok) {
        toast.success('▶ מערכת WhatsApp חזרה לפעילות');
        toast.warning('⚠️ הודעות מוקפאות (is_held) לא שוחזרו אוטומטית. השתמש בשחרור מבוקר.', { duration: 8000 });
        qc.invalidateQueries(['whatsappKillSwitch']);
        qc.invalidateQueries(['whatsappOpsAudit']);
      } else {
        toast.error('שגיאה בהחזרת המערכת: ' + (res?.error || 'unknown'));
      }
    },
    onError: (e) => toast.error('שגיאה: ' + e.message),
  });

  // ── Clear mutation ────────────────────────────────────────────────────────
  const clearMut = useMutation({
    mutationFn: () => invoke('adminClearWhatsAppQueue', { reason: 'Admin manual queue clear' }),
    onSuccess: (res) => {
      if (res?.ok) {
        const c = res.data?.cleared;
        toast.success(`🗑 תור נוקה: ${c?.total ?? 0} הודעות (${c?.pending ?? 0} ממתינות, ${c?.sending ?? 0} בשליחה)`);
        setClearConfirm(false);
        qc.invalidateQueries(['whatsappKillSwitch']);
        qc.invalidateQueries(['whatsappOpsAudit']);
      } else {
        toast.error('שגיאה בניקוי התור: ' + (res?.error || 'unknown'));
      }
    },
    onError: (e) => toast.error('שגיאה: ' + e.message),
  });

  // ── Release held mutation ─────────────────────────────────────────────────
  const releaseMut = useMutation({
    mutationFn: (batchSize) => invoke('adminReleaseHeldMessages', { batch_size: batchSize || 25, reason: 'Controlled release post-incident' }),
    onSuccess: (res) => {
      if (res?.ok) {
        toast.success(`📬 שוחררו ${res.data?.released} הודעות — נותרו ${res.data?.remaining}`);
        qc.invalidateQueries(['whatsappKillSwitch']);
        qc.invalidateQueries(['whatsappOpsAudit']);
      } else {
        toast.error('שגיאה בשחרור: ' + (res?.error || 'unknown'));
      }
    },
    onError: (e) => toast.error('שגיאה: ' + e.message),
  });

  // ── Test message mutation ─────────────────────────────────────────────────
  const testMut = useMutation({
    mutationFn: () => invoke('adminSendTestMessage', { toPhoneE164: testPhone, message: testMessage }),
    onSuccess: (res) => {
      if (res?.ok && res.data?.sent) {
        toast.success(`✅ הודעת בדיקה נשלחה ל-${testPhone} (${res.data.idMessage})`);
        setTestPhone('');
        setTestMessage('');
        qc.invalidateQueries(['whatsappOpsAudit']);
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

      {/* Status + operational metrics */}
      <Card className="p-4 border-2" style={{ borderColor: paused ? '#fca5a5' : '#86efac' }}>
        <div className="flex items-center justify-between mb-2">
          <StatusBadge paused={paused} />
          <div className="text-xs text-slate-400 text-left">
            {gate.updated_by && <span>שונה: {gate.updated_by} · {gate.updated_at ? new Date(gate.updated_at).toLocaleString('he-IL') : '—'}</span>}
          </div>
        </div>
        {gate.reason && <p className="text-xs text-slate-600 mb-2">סיבה: {gate.reason}</p>}
        {gate.env_override && (
          <p className="text-xs text-amber-700 font-medium mb-2">⚠ WHATSAPP_AUTOMATIONS_PAUSED=true בסביבה (דריסת קוד קשה)</p>
        )}

        {/* Primary metrics row */}
        <div className="grid grid-cols-3 md:grid-cols-6 gap-2 mt-2">
          {[
            { label: 'גודל תור',     val: queuedCount,                      color: 'text-slate-800' },
            { label: 'ניתן לאיסוף', val: pickable,                          color: pickable > 0 ? 'text-red-700 font-bold' : 'text-green-700' },
            { label: 'בשליחה',       val: sendingCount,                     color: 'text-blue-700' },
            { label: 'מוקפאות',      val: queue.total_held ?? heldCount,    color: 'text-purple-700' },
            { label: 'נכשלו היום',   val: queue.failed_today ?? 0,          color: 'text-red-600' },
            { label: 'נשלחו/שעה',   val: queue.sent_last_hour ?? 0,        color: 'text-slate-600' },
          ].map(({ label, val, color }) => (
            <div key={label} className="bg-slate-50 rounded p-2 text-center">
              <div className={`text-lg font-bold ${color}`}>{val}</div>
              <div className="text-xs text-slate-500">{label}</div>
            </div>
          ))}
        </div>

        {/* Secondary metrics row */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mt-2">
          <div className="bg-slate-50 rounded p-2">
            <div className="text-xs text-slate-500">הודעות/דקה</div>
            <div className={`text-base font-semibold ${(queue.messages_per_minute ?? 0) > 20 ? 'text-red-600' : 'text-slate-700'}`}>
              {queue.messages_per_minute ?? 0}
              {(queue.messages_per_minute ?? 0) > 20 && <span className="text-xs mr-1">⚠</span>}
            </div>
          </div>
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
            <div className="text-xs text-slate-500">מצב פעיל</div>
            <div className="text-sm font-bold text-slate-800">
              {paused ? '⏸ מושהה' : '▶ פעיל'}
              {gate.source === 'default_absent' && <span className="text-xs text-amber-600 mr-1"> (ברירת מחדל)</span>}
            </div>
          </div>
        </div>
      </Card>

      {/* Emergency Stop — full-width red banner */}
      <Card className="p-4 border-2 border-red-400 bg-red-50">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-2">
            <Zap className="w-5 h-5 text-red-600" />
            <div>
              <div className="font-bold text-red-800">עצירת חירום (Emergency Stop)</div>
              <div className="text-xs text-red-600">עוצר הכל בפעולה אחת: מפסיק שיקול, מקפיא תור, כותב אירוע ביקורת.</div>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <Input placeholder="סיבה" value={pauseReason} onChange={e => setPauseReason(e.target.value)} className="text-sm w-48" />
            <Button
              className="bg-red-700 hover:bg-red-800 text-white font-bold px-6"
              disabled={paused || emergencyMut.isPending}
              onClick={() => emergencyMut.mutate()}
            >
              {emergencyMut.isPending ? 'עוצר...' : '🛑 עצור הכל'}
            </Button>
          </div>
        </div>
        {paused && <p className="text-xs text-green-700 mt-2 text-center font-medium">המערכת כבר מושהית ✓</p>}
      </Card>

      {/* Action buttons */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">

        {/* 1. Pause (manual, granular) */}
        <Card className="p-4 space-y-3">
          <div className="flex items-center gap-2 text-red-700 font-semibold">
            <Pause className="w-4 h-4" />
            עצור התראות ותזכורות
          </div>
          <p className="text-xs text-slate-500">מקפיא ומשהה. פחות מאשר עצירת חירום — לשימוש מניעתי.</p>
          <Button
            className="w-full bg-red-600 hover:bg-red-700 text-white"
            disabled={paused || pauseMut.isPending}
            onClick={() => pauseMut.mutate()}
          >
            {pauseMut.isPending ? 'מושהה...' : 'עצור עכשיו'}
          </Button>
          {paused && <p className="text-xs text-green-600 text-center">המערכת כבר מושהית ✓</p>}
        </Card>

        {/* 2. Clear */}
        <Card className="p-4 space-y-3">
          <div className="flex items-center gap-2 text-amber-700 font-semibold">
            <Trash2 className="w-4 h-4" />
            נקה תור הודעות
          </div>
          <p className="text-xs text-slate-500">
            מוחק הודעות ממתינות ובשליחה בלבד. שמירת היסטוריית שליחות, הסכמות, והגדרות.
          </p>
          <div className="text-center text-slate-700">
            <span className="text-2xl font-bold">{queuedCount + sendingCount}</span>
            <span className="text-xs text-slate-500 mr-1">הודעות יימחקו</span>
          </div>
          {!paused && (
            <p className="text-xs text-red-600 font-medium text-center">חייב להשהות קודם</p>
          )}
          {!clearConfirm ? (
            <Button
              className="w-full bg-amber-600 hover:bg-amber-700 text-white"
              disabled={!paused || clearMut.isPending}
              onClick={() => setClearConfirm(true)}
            >
              בחר לנקות
            </Button>
          ) : (
            <div className="space-y-2">
              <p className="text-xs text-red-700 font-bold text-center">⚠ פעולה בלתי הפיכה — אשר ניקוי</p>
              <div className="flex gap-2">
                <Button className="flex-1 bg-red-600 hover:bg-red-700 text-white text-sm"
                  disabled={clearMut.isPending} onClick={() => clearMut.mutate()}>
                  אשר מחיקה
                </Button>
                <Button variant="outline" className="flex-1 text-sm" onClick={() => setClearConfirm(false)}>
                  ביטול
                </Button>
              </div>
            </div>
          )}
        </Card>

        {/* 3. Resume */}
        <Card className="p-4 space-y-3">
          <div className="flex items-center gap-2 text-green-700 font-semibold">
            <Play className="w-4 h-4" />
            החזר התראות ותזכורות
          </div>
          <p className="text-xs text-slate-500">
            מחדש שליחה. הודעות מוקפאות (is_held) נשארות מוקפאות — שחרר אותן ידנית לאחר מכן.
          </p>
          {heldCount > 0 && (
            <p className="text-xs text-amber-600 font-medium">
              ⚠ {heldCount} הודעות עדיין מוקפאות. שחרר אותן בנפרד בכרטיס שחרור מבוקר.
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

      </div>

      {/* 4. Controlled Release — post-resume, rate-limited */}
      {heldCount > 0 && (
        <Card className="p-4 border border-purple-200 bg-purple-50 space-y-3">
          <div className="flex items-center gap-2 text-purple-800 font-semibold">
            <PackageOpen className="w-4 h-4" />
            שחרור מבוקר של הודעות מוקפאות
          </div>
          <p className="text-xs text-purple-700">
            משחרר קבוצה של הודעות מוקפאות (is_held) לתור — הworker יעבד אותן לפי מגבלות ה-burst guard.
            קרא כרטיס זה שוב לאחר כל שחרור לראות כמה נותרו.
          </p>
          <div className="flex items-center gap-2 text-sm font-medium text-purple-800">
            <span>מוקפאות: {heldCount}</span>
          </div>
          <div className="flex gap-2">
            {[10, 25, 50].map(n => (
              <Button key={n} variant="outline" size="sm" className="flex-1 border-purple-300 text-purple-700"
                disabled={releaseMut.isPending} onClick={() => releaseMut.mutate(n)}>
                {releaseMut.isPending ? '...' : `שחרר ${n}`}
              </Button>
            ))}
          </div>
        </Card>
      )}

      {/* Test message (available while paused) */}
      <Card className="p-4 space-y-3">
        <div className="flex items-center gap-2 text-slate-700 font-semibold">
          <Send className="w-4 h-4" />
          שלח הודעת בדיקה (זמין בזמן השהיה)
        </div>
        <p className="text-xs text-slate-500">
          שולח הודעה אחת ישירות לנמען שנבחר. אינו מפעיל את התור.
        </p>
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
          {testMut.isPending ? 'שולח...' : 'שלח הודעת בדיקה'}
        </Button>
      </Card>

      {/* Audit log */}
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
                    <td className="py-1.5 pl-3 font-mono">{new Date(row.created_at).toLocaleString('he-IL')}</td>
                    <td className="py-1.5 pl-3">
                      <Badge variant="outline" className="text-xs">
                        {row.action === 'pause'            ? '⏸ השהיה' :
                         row.action === 'auto_pause'       ? '🔴 השהיה אוטו' :
                         row.action === 'resume'           ? '▶ חידוש' :
                         row.action === 'queue_clear'      ? '🗑 ניקוי' :
                         row.action === 'test_message_sent'? '📨 בדיקה' :
                         row.action}
                      </Badge>
                    </td>
                    <td className="py-1.5 pl-3">{row.actor_id}</td>
                    <td className="py-1.5 pl-3">{row.previous_state}</td>
                    <td className="py-1.5 pl-3">{row.new_state}</td>
                    <td className="py-1.5 pl-3">{row.affected_count}</td>
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
