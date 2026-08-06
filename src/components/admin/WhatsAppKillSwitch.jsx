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
import { AlertCircle, CheckCircle2, Pause, Play, Trash2, Send, RefreshCw, ShieldAlert } from 'lucide-react';
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
        toast.warning('⚠️ הודעות שהוקפאו (2099) לא שוחזרו אוטומטית. עליך לנקות אותן ידנית.', { duration: 8000 });
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

      {/* Status card */}
      <Card className="p-4 border-2" style={{ borderColor: paused ? '#fca5a5' : '#86efac' }}>
        <div className="flex items-center justify-between mb-3">
          <StatusBadge paused={paused} />
          {gate.updated_by && (
            <span className="text-xs text-slate-400">
              שונה על-ידי: {gate.updated_by} · {gate.updated_at ? new Date(gate.updated_at).toLocaleString('he-IL') : '—'}
            </span>
          )}
        </div>
        {gate.reason && <p className="text-sm text-slate-600 mb-3">סיבה: {gate.reason}</p>}
        {gate.env_override && (
          <p className="text-xs text-amber-600 font-medium">⚠ סביבה: WHATSAPP_AUTOMATIONS_PAUSED=true (דריסת קוד קשה — מחייבת restart להסרה)</p>
        )}

        {/* Queue counts */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mt-3">
          {[
            { label: 'ממתינות',   val: queuedCount,  color: pickable > 0 ? 'text-orange-600' : 'text-slate-700' },
            { label: 'ניתן לאיסוף', val: pickable,   color: pickable > 0 ? 'text-red-600 font-bold' : 'text-green-600' },
            { label: 'בשליחה',    val: sendingCount, color: 'text-blue-600' },
            { label: 'מוקפאות',   val: heldCount,    color: 'text-purple-600' },
            { label: 'נשלחו (שעה)', val: queue.sent_last_hour ?? 0, color: 'text-slate-600' },
          ].map(({ label, val, color }) => (
            <div key={label} className="bg-slate-50 rounded p-2 text-center">
              <div className={`text-xl font-bold ${color}`}>{val}</div>
              <div className="text-xs text-slate-500">{label}</div>
            </div>
          ))}
        </div>
      </Card>

      {/* Action buttons */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">

        {/* 1. Pause */}
        <Card className="p-4 space-y-3">
          <div className="flex items-center gap-2 text-red-700 font-semibold">
            <Pause className="w-4 h-4" />
            עצור התראות ותזכורות
          </div>
          <p className="text-xs text-slate-500">מקפיא את כל ההודעות הממתינות. אינו מוחק כלום.</p>
          <Input
            placeholder="סיבה (אופציונלי)"
            value={pauseReason}
            onChange={e => setPauseReason(e.target.value)}
            className="text-sm"
          />
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
            מחדש שליחה. הודעות מוקפאות (2099) לא ישוחזרו אוטומטית — ניקה אותן קודם.
          </p>
          {heldCount > 0 && (
            <p className="text-xs text-amber-600 font-medium">
              ⚠ {heldCount} הודעות עדיין מוקפאות. שקול לנקות לפני חידוש.
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
