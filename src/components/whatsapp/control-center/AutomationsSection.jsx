import React, { useState } from 'react';
import { Clock, CheckCircle2, XCircle, Loader2, ChevronDown, ChevronUp } from 'lucide-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { toast } from 'sonner';
import { Switch } from '@/components/ui/switch';

const KNOWN_AUTOMATIONS = [
  { name: 'reminderMealLog', label: 'תזכורת ארוחות', schedule: 'יומי 09:00, 13:00, 19:00', key: 'WHATSAPP_AUTO_MEAL_REMINDER' },
  { name: 'reminderWaterLog', label: 'תזכורת מים', schedule: 'יומי 11:30, 15:30, 19:30', key: 'WHATSAPP_AUTO_WATER_REMINDER' },
  { name: 'workoutMotivationCheck', label: 'עידוד אימונים', schedule: 'יומי 05:00', key: 'WHATSAPP_AUTO_WORKOUT_MOTIVATION' },
  { name: 'nudgeScheduler', label: 'Nudge Leads', schedule: 'כל 30 דקות', key: 'WHATSAPP_AUTO_NUDGE' },
  { name: 'weighInReminderScheduler', label: 'תזכורת שקילה', schedule: 'יומי 07:00', key: 'WHATSAPP_AUTO_WEIGH_IN' },
  { name: 'feedbackRequestScheduler', label: 'בקשת משוב', schedule: 'יומי 07:00', key: 'WHATSAPP_AUTO_FEEDBACK' },
  { name: 'encouragementNotificationScheduler', label: 'עידוד שבועי', schedule: 'שבועי ראשון', key: 'WHATSAPP_AUTO_ENCOURAGEMENT' },
  { name: 'onTraineeCreated', label: 'הודעת קבלה למתאמן חדש', schedule: 'On create', key: 'WHATSAPP_AUTO_TRAINEE_CREATED' },
  { name: 'onLeadCreated', label: 'הודעת קבלה ללידים חדשים', schedule: 'On create', key: 'WHATSAPP_AUTO_LEAD_CREATED' },
];

export default function AutomationsSection({ killSwitchActive, onRefresh }) {
  const queryClient = useQueryClient();
  const [expanded, setExpanded] = useState(false);
  // Optimistic local state for global switch
  const [pendingGlobal, setPendingGlobal] = useState(null);

  // Load all per-automation SystemConfig keys
  const { data: allConfigs = [], refetch: refetchConfigs } = useQuery({
    queryKey: ['wcc', 'automationConfigs'],
    queryFn: () => base44.entities.SystemConfig.filter({}),
    refetchInterval: 15000,
  });

  // Build a map: key → record
  const configMap = {};
  for (const c of allConfigs) {
    configMap[c.key] = c;
  }

  // Global automation master switch — use optimistic value while pending
  const globalEnabledFromDB = configMap['WHATSAPP_AUTOMATIONS_ENABLED']?.value === true;
  const globalEnabled = pendingGlobal !== null ? pendingGlobal : globalEnabledFromDB;

  const toggleMutation = useMutation({
    mutationFn: async ({ key, value }) => {
      console.log('[AutomationsSection] Toggling', key, '→', value);
      const res = await base44.functions.invoke('systemConfigControl', { action: 'set', key, value });
      if (!res?.data?.ok) throw new Error(res?.data?.error || 'Failed');
      console.log('[AutomationsSection] Success', key, '=', value);
      return { key, value, ...res.data };
    },
    onSuccess: ({ key, value }) => {
      if (key === 'WHATSAPP_AUTOMATIONS_ENABLED') {
        toast.success(value ? '✅ Global Automation הופעל' : '⏸ Global Automation כובה');
        setPendingGlobal(null);
      } else {
        const auto = KNOWN_AUTOMATIONS.find(a => a.key === key);
        toast.success(value ? `✅ ${auto?.label || key} הופעל` : `⏸ ${auto?.label || key} כובה`);
      }
      refetchConfigs();
      queryClient.invalidateQueries({ queryKey: ['wcc'] });
    },
    onError: (e, { key }) => {
      console.error('[AutomationsSection] Error toggling', key, e.message);
      toast.error('שגיאה: ' + e.message);
      if (key === 'WHATSAPP_AUTOMATIONS_ENABLED') setPendingGlobal(null);
    },
  });

  const handleGlobalToggle = (v) => {
    setPendingGlobal(v); // optimistic
    toggleMutation.mutate({ key: 'WHATSAPP_AUTOMATIONS_ENABLED', value: v });
  };

  const activeCount = KNOWN_AUTOMATIONS.filter(a => {
    const cfg = configMap[a.key];
    return cfg?.value === true && globalEnabled;
  }).length;

  return (
    <div className="bg-white rounded-2xl border-2 border-slate-200 p-5 shadow-sm">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Clock className="w-5 h-5 text-slate-600" />
          <h2 className="font-bold text-slate-800 text-lg">⏰ Automation Controls</h2>
        </div>
        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
          activeCount > 0 ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-500'
        }`}>
          {activeCount} מוגדרים פעיל
        </span>
      </div>

      {/* Kill Switch warning banner — informational only, does NOT block UI */}
      {killSwitchActive && (
        <div className="mb-4 p-3 bg-amber-50 border border-amber-300 rounded-xl text-xs text-amber-800 font-medium">
          ⚠️ Kill Switch פעיל — הודעות לא יישלחו גם אם אוטומציות מופעלות. ניתן להגדיר הכל בחופשיות.
        </div>
      )}

      {/* Global Automation Master Switch */}
      <div className={`flex items-center justify-between p-4 rounded-xl border-2 mb-4 ${
        globalEnabled ? 'bg-green-50 border-green-300' : 'bg-slate-50 border-slate-200'
      }`}>
        <div>
          <p className="font-bold text-slate-800">🌐 Global Automation Switch</p>
          <p className="text-xs text-slate-500 mt-0.5">
            WHATSAPP_AUTOMATIONS_ENABLED — כיבוי שולח SKIPPED לכל האוטומציות
          </p>

        </div>
        <div className="flex items-center gap-2">
          {toggleMutation.isPending && toggleMutation.variables?.key === 'WHATSAPP_AUTOMATIONS_ENABLED' && (
            <Loader2 className="w-4 h-4 animate-spin text-slate-400" />
          )}
          <Switch
            checked={globalEnabled}
            disabled={toggleMutation.isPending && toggleMutation.variables?.key === 'WHATSAPP_AUTOMATIONS_ENABLED'}
            onCheckedChange={handleGlobalToggle}
          />
        </div>
      </div>

      {/* Per-automation list */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-2 text-sm text-slate-600 hover:text-slate-800 font-medium mb-2"
      >
        {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        {expanded ? 'הסתר' : 'הצג'} בקרה פר-אוטומציה ({KNOWN_AUTOMATIONS.length})
      </button>

      {expanded && (
        <div className="space-y-2">
          {KNOWN_AUTOMATIONS.map((auto) => {
            const cfg = configMap[auto.key];
            // Default: undefined = not set = consider disabled unless explicitly true
            const isEnabled = cfg?.value === true;
            const isThisLoading = toggleMutation.isPending && toggleMutation.variables?.key === auto.key;

            return (
              <div key={auto.name} className={`flex items-center justify-between p-3 rounded-xl border ${
                isEnabled ? 'bg-green-50 border-green-200' : 'bg-slate-50 border-slate-200'
              }`}>
                <div className="flex items-center gap-3 min-w-0">
                  {isEnabled
                    ? <CheckCircle2 className="w-4 h-4 text-green-500 flex-shrink-0" />
                    : <XCircle className="w-4 h-4 text-slate-300 flex-shrink-0" />
                  }
                  <div className="min-w-0">
                    <div className="font-medium text-slate-800 text-sm">{auto.label}</div>
                    <div className="text-xs text-slate-400 font-mono">{auto.name} · {auto.schedule}</div>
                  </div>
                </div>
                <div className="flex items-center gap-3 flex-shrink-0">
                  {isThisLoading && <Loader2 className="w-3 h-3 animate-spin text-slate-400" />}
                  <span className={`text-xs px-2 py-0.5 rounded-full font-bold ${
                    isEnabled ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-500'
                  }`}>
                    {isEnabled ? '✅ פעיל' : '⏸ כבוי'}
                  </span>
                  <Switch
                    checked={isEnabled}
                    disabled={isThisLoading}
                    onCheckedChange={(v) => toggleMutation.mutate({ key: auto.key, value: v })}
                  />
                </div>
              </div>
            );
          })}
        </div>
      )}

      <div className="mt-4 p-3 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-500">
        💡 שינויים נשמרים ב-SystemConfig DB — כל פונקציית שליחה בודקת את הערכים לפני ביצוע.
      </div>
    </div>
  );
}