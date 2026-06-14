import React, { useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { X, CheckCircle2, XCircle, Clock, Zap, Send, AlertTriangle } from 'lucide-react';

function fmtTime(ts) {
  if (!ts) return '—';
  try { return new Date(ts).toLocaleString('he-IL'); }
  catch { return ts; }
}

function ChainStep({ step, label, status, detail, time }) {
  const icons = {
    ok: <CheckCircle2 className="w-4 h-4 text-emerald-500" />,
    fail: <XCircle className="w-4 h-4 text-red-500" />,
    warn: <AlertTriangle className="w-4 h-4 text-orange-500" />,
    info: <Clock className="w-4 h-4 text-blue-400" />,
    skip: <XCircle className="w-4 h-4 text-slate-300" />,
  };
  const bg = { ok: 'bg-emerald-50', fail: 'bg-red-50', warn: 'bg-orange-50', info: 'bg-blue-50', skip: 'bg-slate-50' };
  const border = { ok: 'border-emerald-200', fail: 'border-red-300', warn: 'border-orange-200', info: 'border-blue-200', skip: 'border-slate-200' };

  return (
    <div className={`flex gap-3 p-3 rounded-xl border ${bg[status] || 'bg-slate-50'} ${border[status] || 'border-slate-200'}`}>
      <div className="flex-shrink-0 mt-0.5">{icons[status] || icons.info}</div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 justify-between">
          <span className="text-xs font-bold text-slate-500 uppercase tracking-wide">{step}</span>
          {time && <span className="text-xs text-slate-400 font-mono">{fmtTime(time)}</span>}
        </div>
        <p className="text-sm font-semibold text-slate-800 mt-0.5">{label}</p>
        {detail && <p className="text-xs text-slate-600 mt-0.5">{detail}</p>}
      </div>
    </div>
  );
}

export default function WACDMessageChain({ msg, data, onClose }) {
  const { queue, todayEventLogs, todayPerformance } = data;

  // Find matching records across all data sources
  const chain = useMemo(() => {
    const steps = [];

    // Step 1: Trigger
    steps.push({
      step: 'שלב 1',
      label: `Trigger: ${msg.trigger_type || '—'}`,
      status: 'info',
      detail: `אוטומציה יצרה trigger מסוג ${msg.trigger_type}`,
      time: msg.time,
    });

    // Step 2: Smart Gate
    const perfMatch = todayPerformance.find(p =>
      p.trainee_email === msg.trainee_email && p.trigger_type === msg.trigger_type
    );
    if (perfMatch) {
      const gatePassed = perfMatch.decision_log?.gate_passed;
      steps.push({
        step: 'שלב 2',
        label: gatePassed ? 'Smart Gate: אושר ✅' : 'Smart Gate: נחסם ❌',
        status: gatePassed ? 'ok' : 'fail',
        detail: perfMatch.decision_log?.gate_fail_reason
          ? `סיבת חסימה: ${perfMatch.decision_log.gate_fail_reason}`
          : gatePassed ? `Priority: ${perfMatch.priority} | Window: ${perfMatch.window_sent}` : 'Gate לא אישר',
        time: perfMatch.message_sent_at,
      });

      // Step 3: Priority selection
      if (gatePassed) {
        steps.push({
          step: 'שלב 3',
          label: `Priority: ${perfMatch.priority} | Window: ${perfMatch.window_sent}`,
          status: 'info',
          detail: `Trigger נבחר: ${perfMatch.decision_log?.reason_selected || 'gate_passed'}`,
          time: perfMatch.message_sent_at,
        });
      }
    } else {
      steps.push({
        step: 'שלב 2',
        label: 'Smart Gate: אין מידע',
        status: 'warn',
        detail: 'לא נמצא רשומת WhatsAppPerformance לניתוח זה',
      });
    }

    // Step 4: Event log
    const eventMatch = todayEventLogs.find(e =>
      e.trainee_email === msg.trainee_email && e.trigger_type === msg.trigger_type
    );
    if (eventMatch) {
      const sent = eventMatch.event_type === 'message_sent';
      steps.push({
        step: 'שלב 4',
        label: sent ? 'Event Log: message_sent' : `Event Log: ${eventMatch.event_type}`,
        status: sent ? 'ok' : 'warn',
        detail: eventMatch.blocked_reason
          ? `חסום: ${eventMatch.blocked_reason}`
          : sent ? 'נרשם ב-WhatsAppEventLog' : '—',
        time: eventMatch.timestamp,
      });
    } else {
      steps.push({
        step: 'שלב 4',
        label: 'Event Log: לא נמצא',
        status: 'skip',
        detail: 'לא נמצאה רשומה ב-WhatsAppEventLog',
      });
    }

    // Step 5: Queue
    const queueMatch = queue.find(q =>
      (q.context_id === msg.trainee_email ||
        q.context_id === (msg.raw?.trainee_id)) &&
      q.template_key === msg.trigger_type
    );
    if (queueMatch) {
      const statusOk = queueMatch.status === 'sent' || queueMatch.status === 'provider_unconfirmed';
      steps.push({
        step: 'שלב 5',
        label: `Queue: נוצרה (status: ${queueMatch.status})`,
        status: statusOk ? 'ok' : queueMatch.status === 'failed' ? 'fail' : 'info',
        detail: `session_id: ${queueMatch.session_id || '—'} | attempts: ${queueMatch.attempts ?? 0}`,
        time: queueMatch.created_date,
      });

      // Step 6: Worker processed
      steps.push({
        step: 'שלב 6',
        label: queueMatch.last_attempt_at ? 'Worker: עיבד את ההודעה' : 'Worker: טרם עיבד',
        status: queueMatch.last_attempt_at ? 'info' : 'warn',
        detail: queueMatch.last_attempt_at ? `עיבוד אחרון: ${fmtTime(queueMatch.last_attempt_at)}` : 'ה-worker טרם הגיע לרשומה זו',
        time: queueMatch.last_attempt_at,
      });

      // Step 7: GreenAPI response
      const provResp = queueMatch.provider_response;
      const hasMsgId = provResp && (provResp.includes('messageId') || provResp.includes('idMessage'));
      steps.push({
        step: 'שלב 7',
        label: hasMsgId ? 'GreenAPI: אישר ✅' : queueMatch.status === 'failed' ? 'GreenAPI: נכשל ❌' : 'GreenAPI: ממתין / לא אושר',
        status: hasMsgId ? 'ok' : queueMatch.status === 'failed' ? 'fail' : 'warn',
        detail: queueMatch.error_message || provResp?.slice(0, 100) || '—',
      });

      // Step 8: Final status
      steps.push({
        step: 'שלב 8',
        label: `סטטוס סופי: ${queueMatch.status}`,
        status: statusOk ? 'ok' : queueMatch.status === 'failed' ? 'fail' : 'warn',
        detail: statusOk ? 'ההודעה נשלחה בהצלחה' : queueMatch.status === 'failed' ? 'ההודעה נכשלה' : 'הסטטוס עדיין לא סופי',
      });
    } else {
      steps.push({
        step: 'שלב 5',
        label: 'Queue: לא נוצרה רשומה',
        status: msg.status === 'reminder_skipped' ? 'warn' : 'fail',
        detail: msg.status === 'reminder_skipped' ? 'ההודעה נחסמה לפני יצירת Queue' : 'לא נמצאה רשומה ב-WhatsAppMessageQueue',
      });
    }

    return steps;
  }, [msg, queue, todayEventLogs, todayPerformance]);

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-end sm:items-center justify-center p-4" onClick={onClose}>
      <div
        className="bg-white rounded-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto"
        onClick={e => e.stopPropagation()}
        dir="rtl"
      >
        {/* Header */}
        <div className="sticky top-0 bg-white border-b px-4 py-3 flex items-center justify-between rounded-t-2xl">
          <div>
            <h3 className="font-bold text-slate-800">שרשרת שליחה</h3>
            <p className="text-xs text-slate-500">{msg.trainee_name} · {msg.trigger_type}</p>
          </div>
          <Button variant="ghost" size="icon" onClick={onClose} className="h-8 w-8">
            <X className="w-4 h-4" />
          </Button>
        </div>

        {/* Message preview */}
        <div className="px-4 py-3 bg-slate-50 border-b">
          <p className="text-xs text-slate-500 mb-1">הודעה:</p>
          <p className="text-sm text-slate-700">{msg.message_preview || '—'}</p>
        </div>

        {/* Chain steps */}
        <div className="px-4 py-4 space-y-2">
          {chain.map((step, i) => (
            <div key={i} className="relative">
              <ChainStep {...step} />
              {i < chain.length - 1 && (
                <div className="absolute right-[23px] bottom-0 translate-y-full h-2 w-0.5 bg-slate-200 z-10" />
              )}
            </div>
          ))}
        </div>

        {/* Raw data */}
        <div className="px-4 pb-4">
          <details className="mt-2">
            <summary className="text-xs text-slate-400 cursor-pointer hover:text-slate-600">הצג נתונים גולמיים</summary>
            <pre className="mt-2 text-[10px] bg-slate-50 rounded-lg p-3 overflow-auto max-h-48 text-slate-600">
              {JSON.stringify(msg.raw, null, 2)}
            </pre>
          </details>
        </div>
      </div>
    </div>
  );
}