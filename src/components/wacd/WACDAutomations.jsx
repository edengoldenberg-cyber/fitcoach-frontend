import React, { useMemo } from 'react';
import { CheckCircle2, XCircle, Clock } from 'lucide-react';

const AUTOMATIONS = [
  { key: 'mealReminderScheduler', label: 'Meal Reminder Scheduler', triggers: ['breakfast_check', 'lunch_check', 'dinner_check'] },
  { key: 'smartMealWaterReminder', label: 'Smart Meal+Water Reminder', triggers: ['breakfast_check', 'lunch_check', 'dinner_check', 'water_check'] },
  { key: 'smartReminderEngineV2', label: 'Smart Reminder Engine V2', triggers: ['breakfast_check', 'lunch_check', 'dinner_check', 'water_check'] },
  { key: 'mealWaterReinforcementHandler', label: 'Meal/Water Reinforcement', triggers: ['reinforcement_meal', 'reinforcement_water'] },
  { key: 'workoutMotivationCheck', label: 'Workout Motivation', triggers: ['workout_motivation'] },
  { key: 'reminderMealLog', label: 'Reminder Meal Log', triggers: ['breakfast_check', 'lunch_check', 'dinner_check'] },
  { key: 'reminderWaterLog', label: 'Reminder Water Log', triggers: ['water_check'] },
  { key: 'nudgeScheduler', label: 'Nudge Scheduler', triggers: ['onboarding_msg1', 'onboarding_msg2', 'onboarding_msg3', 'activation_no_login'] },
  { key: 'weighInReminderScheduler', label: 'Weigh-In Reminder', triggers: [] },
  { key: 'encouragementNotificationScheduler', label: 'Encouragement Notifications', triggers: ['engagement_3day_streak', 'engagement_protein_goal'] },
];

function fmtTime(ts) {
  if (!ts) return 'אף פעם';
  try { return new Date(ts).toLocaleString('he-IL', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }); }
  catch { return ts; }
}

const TODAY = new Date().toISOString().split('T')[0];

export default function WACDAutomations({ data }) {
  const { todayEventLogs, todayPerformance, sysConfigs } = data;

  // Get kill switch
  const killSwitch = sysConfigs.find(c => c.key === 'WHATSAPP_REMINDERS_ENABLED');
  const killSwitchOn = killSwitch ? killSwitch.value !== false && killSwitch.value !== 'false' : true;

  const stats = useMemo(() => {
    return AUTOMATIONS.map(auto => {
      // Messages generated (in performance) matching any trigger
      const perfMatches = todayPerformance.filter(p => auto.triggers.includes(p.trigger_type));
      const sentPerf = perfMatches.filter(p => p.decision_log?.gate_passed);
      const blockedPerf = perfMatches.filter(p => !p.decision_log?.gate_passed);

      // Events matching
      const eventMatches = todayEventLogs.filter(e => auto.triggers.includes(e.trigger_type));
      const sentEvents = eventMatches.filter(e => e.event_type === 'message_sent');
      const blockedEvents = eventMatches.filter(e => e.event_type === 'reminder_skipped');
      const dupEvents = eventMatches.filter(e => e.blocked_reason === 'duplicate_blocked');

      // Last activity
      const allTimes = [...perfMatches.map(p => p.message_sent_at), ...eventMatches.map(e => e.timestamp)]
        .filter(Boolean).sort().reverse();
      const lastRun = allTimes[0] || null;

      return {
        ...auto,
        generated: perfMatches.length,
        sent: sentPerf.length || sentEvents.length,
        blocked: blockedPerf.length || blockedEvents.length,
        duplicates: dupEvents.length,
        failures: 0, // would need queue data per function
        lastRun,
        hasActivity: allTimes.length > 0,
      };
    });
  }, [todayEventLogs, todayPerformance]);

  return (
    <div className="space-y-3">
      {/* Kill switch status */}
      <div className={`flex items-center gap-3 p-3 rounded-xl border-2 ${killSwitchOn ? 'bg-emerald-50 border-emerald-300' : 'bg-red-50 border-red-400'}`}>
        {killSwitchOn
          ? <CheckCircle2 className="w-5 h-5 text-emerald-600" />
          : <XCircle className="w-5 h-5 text-red-600" />
        }
        <div>
          <p className={`font-bold text-sm ${killSwitchOn ? 'text-emerald-800' : 'text-red-800'}`}>
            Kill Switch: {killSwitchOn ? 'הודעות מופעלות ✅' : '🔴 Kill Switch פעיל — הכל חסום'}
          </p>
          <p className="text-xs text-slate-500">SystemConfig: WHATSAPP_REMINDERS_ENABLED = {String(killSwitch?.value ?? 'לא מוגדר')}</p>
        </div>
      </div>

      {/* Automation cards */}
      <div className="space-y-2">
        {stats.map(auto => (
          <div
            key={auto.key}
            className={`bg-white border rounded-xl p-3 ${auto.hasActivity ? 'border-slate-200' : 'border-slate-100 opacity-70'}`}
          >
            <div className="flex items-center gap-2 mb-2">
              <div className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${auto.hasActivity ? 'bg-emerald-500' : 'bg-slate-300'}`} />
              <span className="font-semibold text-sm text-slate-800">{auto.label}</span>
              <span className="text-xs font-mono text-slate-400 mr-auto">{auto.key}</span>
            </div>

            {/* Trigger types */}
            <div className="flex flex-wrap gap-1 mb-2">
              {auto.triggers.map(t => (
                <span key={t} className="text-[10px] bg-slate-100 text-slate-500 rounded-full px-1.5 py-0.5">{t}</span>
              ))}
              {auto.triggers.length === 0 && (
                <span className="text-[10px] text-slate-400">אין triggers מוגדרים</span>
              )}
            </div>

            {/* Stats row */}
            <div className="grid grid-cols-4 gap-1.5 text-center">
              <div className="bg-emerald-50 rounded-lg py-1.5">
                <div className="text-sm font-bold text-emerald-700">{auto.sent}</div>
                <div className="text-[10px] text-slate-500">נשלחו</div>
              </div>
              <div className="bg-orange-50 rounded-lg py-1.5">
                <div className="text-sm font-bold text-orange-600">{auto.blocked}</div>
                <div className="text-[10px] text-slate-500">נחסמו</div>
              </div>
              <div className={`rounded-lg py-1.5 ${auto.duplicates > 0 ? 'bg-red-50' : 'bg-slate-50'}`}>
                <div className={`text-sm font-bold ${auto.duplicates > 0 ? 'text-red-600' : 'text-slate-400'}`}>{auto.duplicates}</div>
                <div className="text-[10px] text-slate-500">כפילויות</div>
              </div>
              <div className="bg-slate-50 rounded-lg py-1.5">
                <div className="text-sm font-bold text-slate-600">{auto.generated}</div>
                <div className="text-[10px] text-slate-500">סה״כ</div>
              </div>
            </div>

            <div className="flex items-center gap-1.5 mt-2 text-xs text-slate-400">
              <Clock className="w-3 h-3" />
              <span>הפעלה אחרונה: {fmtTime(auto.lastRun)}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}