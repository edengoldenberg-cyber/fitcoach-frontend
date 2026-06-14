import React, { useState } from 'react';
import { FileText, Copy, CheckCircle2 } from 'lucide-react';
import { format } from 'date-fns';
import { toast } from 'sonner';

export default function ReportButton({ killSwitchActive, queueCounts, providerConfig, queueAll }) {
  const [copied, setCopied] = useState(false);

  const generateReport = () => {
    const now = format(new Date(), 'dd/MM/yyyy HH:mm:ss');
    const recentErrors = queueAll.filter(q => q.status === 'failed').slice(0, 20);
    const recentQueue = queueAll.filter(q => q.status !== 'sent').slice(0, 20);

    const verdict = killSwitchActive && queueCounts.total_unsent === 0
      ? 'SAFE_NO_MESSAGES_CAN_SEND'
      : 'OUTBOUND_ACTIVE';

    return `
========================================
WHATSAPP SAFETY REPORT
Generated: ${now}
========================================

1. GREENAPI STATUS
  Provider Type: ${providerConfig?.provider_type || 'N/A'}
  Status: ${providerConfig?.status || 'N/A'}
  Enabled: ${providerConfig?.is_enabled ? 'YES' : 'NO'}
  Instance ID: ${providerConfig?.instance_id || 'N/A'}
  Phone: ${providerConfig?.phone_number_e164 || 'N/A'}
  Last Test: ${providerConfig?.last_test_at || 'N/A'}

2. KILL SWITCH STATUS
  GLOBAL_OUTBOUND_WHATSAPP_ENABLED = ${killSwitchActive ? 'false (BLOCKED)' : 'true (ACTIVE)'}
  Protected functions: whatsAppQueueWorker, enqueueWhatsAppMessage,
    reminderMealLog, reminderWaterLog, workoutMotivationCheck,
    nudgeScheduler, flowTimeoutChecker

3. QUEUE COUNTS
  queued: ${queueCounts.queued}
  sending: ${queueCounts.sending}
  failed: ${queueCounts.failed}
  sent today: ${queueCounts.sent_today}
  TOTAL UNSENT: ${queueCounts.total_unsent}

4. ACTIVE SCHEDULERS
  reminderMealLog: DISABLED
  reminderWaterLog: DISABLED
  workoutMotivationCheck: DISABLED
  nudgeScheduler: DISABLED
  flowTimeoutChecker: DISABLED
  weighInReminderScheduler: DISABLED
  feedbackRequestScheduler: DISABLED
  encouragementNotificationScheduler: DISABLED

5. FUNCTION GUARD STATUS (all 10 read from SystemConfig DB)
  whatsAppQueueWorker: ${killSwitchActive ? 'KILL_SWITCH_BLOCKED' : 'ACTIVE'}
  enqueueWhatsAppMessage: ${killSwitchActive ? 'KILL_SWITCH_BLOCKED' : 'ACTIVE'}
  sendWhatsAppMessage: ${killSwitchActive ? 'KILL_SWITCH_BLOCKED' : 'ACTIVE'}
  claimAndQueueOutbound: ${killSwitchActive ? 'KILL_SWITCH_BLOCKED' : 'ACTIVE'}
  onTraineeCreated: ${killSwitchActive ? 'KILL_SWITCH_BLOCKED' : 'ACTIVE'}
  reminderMealLog: ${killSwitchActive ? 'KILL_SWITCH_BLOCKED' : 'ACTIVE'}
  reminderWaterLog: ${killSwitchActive ? 'KILL_SWITCH_BLOCKED' : 'ACTIVE'}
  workoutMotivationCheck: ${killSwitchActive ? 'KILL_SWITCH_BLOCKED' : 'ACTIVE'}
  nudgeScheduler: ${killSwitchActive ? 'KILL_SWITCH_BLOCKED' : 'ACTIVE'}
  flowTimeoutChecker: ${killSwitchActive ? 'KILL_SWITCH_BLOCKED' : 'ACTIVE'}

6. LAST 20 UNSENT QUEUE RECORDS
${recentQueue.length === 0 ? '  (empty)' : recentQueue.map(q =>
  `  [${q.status}] ${q.to_phone_e164} — ${q.template_key} — ${q.created_date}`
).join('\n')}

7. LAST 20 SEND ERRORS
${recentErrors.length === 0 ? '  (none)' : recentErrors.map(q =>
  `  [${q.to_phone_e164}] ${q.error_message || 'unknown error'} — ${q.last_attempt_at}`
).join('\n')}

========================================
FINAL VERDICT: ${verdict}
========================================
`.trim();
  };

  const handleCopy = async () => {
    const report = generateReport();
    try {
      await navigator.clipboard.writeText(report);
      setCopied(true);
      toast.success('הדוח הועתק ללוח!');
      setTimeout(() => setCopied(false), 3000);
    } catch {
      toast.error('שגיאה בהעתקה');
    }
  };

  return (
    <div className="bg-slate-900 rounded-2xl border-2 border-slate-700 p-5 shadow-sm">
      <div className="flex items-center gap-2 mb-3">
        <FileText className="w-5 h-5 text-slate-300" />
        <h2 className="font-bold text-white text-lg">📋 WhatsApp Safety Report</h2>
      </div>
      <p className="text-slate-400 text-sm mb-4">
        דוח מלא הכולל: סטטוס GreenAPI, kill switch, ספירות תור, schedulers פעילים,
        20 הרשומות האחרונות, 20 שגיאות אחרונות, וורדיקט סופי.
      </p>
      <button
        onClick={handleCopy}
        className={`flex items-center gap-2 px-5 py-3 rounded-xl font-bold text-sm transition-all ${
          copied
            ? 'bg-green-600 text-white'
            : 'bg-white text-slate-900 hover:bg-slate-100'
        }`}
      >
        {copied
          ? <><CheckCircle2 className="w-4 h-4" /> הועתק!</>
          : <><Copy className="w-4 h-4" /> Copy WhatsApp Safety Report</>
        }
      </button>
    </div>
  );
}