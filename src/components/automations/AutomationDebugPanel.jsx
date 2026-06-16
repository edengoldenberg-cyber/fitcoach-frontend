import React, { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { ChevronDown, ChevronUp, Bug, CheckCircle, XCircle, AlertTriangle, RefreshCw, Search, Clock, Wifi, WifiOff } from 'lucide-react';

// ── helpers ─────────────────────────────────────────────────────────────────
function normalizePhone(phoneRaw) {
  if (!phoneRaw) return null;
  let s = String(phoneRaw).trim().replace(/[\s\-().,]/g, '').replace(/[^\d+]/g, '');
  if (s.startsWith('00')) s = '+' + s.slice(2);
  if (/^972\d{9}$/.test(s)) s = '+' + s;
  if (/^0\d{9}$/.test(s)) s = '+972' + s.slice(1);
  if (/^\+972\d{9}$/.test(s)) return s;
  return null;
}

// ── Schedulers from list_automations ──────────────────────────────────────
const KNOWN_SCHEDULERS = [
  { id: '69eedabf341a05e20e114f90', name: 'תזכורת ארוחות - בוקר (09:00)', fn: 'reminderMealLog', scheduledUtc: '06:00' },
  { id: '69eedac7341a05e20e114f91', name: 'תזכורת ארוחות - צהריים (13:30)', fn: 'reminderMealLog', scheduledUtc: '10:30' },
  { id: '69eedace341a05e20e114f93', name: 'תזכורת ארוחות - ערב (20:00)', fn: 'reminderMealLog', scheduledUtc: '17:00' },
  { id: '69eedad2341a05e20e114f94', name: 'תזכורת מים - צהריים (12:30)', fn: 'reminderWaterLog', scheduledUtc: '09:30' },
  { id: '69eedad5341a05e20e114f96', name: 'תזכורת מים - ערב (19:00)', fn: 'reminderWaterLog', scheduledUtc: '16:00' },
  { id: '69eedada341a05e20e114f99', name: 'עידוד שבועי - סיכום אימונים (08:00)', fn: 'workoutMotivationCheck', scheduledUtc: '05:00' },
];

// ── sub-components ──────────────────────────────────────────────────────────
function Section({ title, children, defaultOpen = false, badge, badgeColor = 'bg-slate-100 text-slate-600' }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border border-slate-200 rounded-xl overflow-hidden mb-3">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-4 py-3 bg-slate-50 hover:bg-slate-100 transition-colors text-right"
      >
        <span className="font-semibold text-sm text-slate-800">{title}</span>
        <div className="flex items-center gap-2">
          {badge && <span className={`text-xs px-2 py-0.5 rounded-full font-mono ${badgeColor}`}>{badge}</span>}
          {open ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
        </div>
      </button>
      {open && <div className="p-4 space-y-2 bg-white">{children}</div>}
    </div>
  );
}

function Row({ label, value, ok, mono = false, warn = false }) {
  return (
    <div className="flex items-start justify-between gap-4 py-1.5 border-b border-slate-50 last:border-0">
      <span className="text-xs text-slate-500 whitespace-nowrap min-w-[140px]">{label}</span>
      <span className={`text-xs font-medium text-right break-all ${mono ? 'font-mono' : ''} ${ok === true ? 'text-green-700' : ok === false ? 'text-red-600' : warn ? 'text-amber-600' : 'text-slate-800'}`}>
        {ok === true && '✅ '}{ok === false && '❌ '}{warn && '⚠️ '}
        {String(value ?? '—')}
      </span>
    </div>
  );
}

function TraineeEligibilityTrace({ trainees, waProviders }) {
  const [selectedTraineeId, setSelectedTraineeId] = useState('');
  const [selectedRule, setSelectedRule] = useState('reminderMealLog');
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);

  const todayStr = new Date(Date.now() + 3 * 60 * 60 * 1000).toISOString().split('T')[0];
  const israelHour = (new Date().getUTCHours() + 3) % 24;

  const activeProvider = waProviders.find(p => p.is_enabled && p.status === 'connected' && p.provider_type === 'greenapi')
    || waProviders.find(p => p.is_enabled);

  const runTrace = async () => {
    const trainee = trainees.find(t => t.id === selectedTraineeId);
    if (!trainee) return;
    setLoading(true);
    setResult(null);

    const trace = { traineeId: trainee.id, name: trainee.full_name, rule: selectedRule, steps: [], eligible: null, reason: null, wouldSendMessage: null };

    // Step 1: user_email
    if (!trainee.user_email) {
      trace.steps.push({ step: 'user_email', pass: false, detail: 'חסר user_email' });
      trace.eligible = false; trace.reason = 'no user_email';
      setResult(trace); setLoading(false); return;
    }
    trace.steps.push({ step: 'user_email', pass: true, detail: trainee.user_email });

    // Step 2: phone
    const phone = normalizePhone(trainee.phone);
    if (!phone) {
      trace.steps.push({ step: 'phone', pass: false, detail: `טלפון גולמי: "${trainee.phone}" → לא תקין` });
      trace.eligible = false; trace.reason = 'no_valid_phone';
      setResult(trace); setLoading(false); return;
    }
    trace.steps.push({ step: 'phone', pass: true, detail: phone });

    // Step 3: WhatsApp provider
    if (!activeProvider) {
      trace.steps.push({ step: 'whatsapp_provider', pass: false, detail: 'אין WhatsApp provider מחובר' });
      trace.eligible = false; trace.reason = 'no_whatsapp_provider';
      setResult(trace); setLoading(false); return;
    }
    trace.steps.push({ step: 'whatsapp_provider', pass: true, detail: `${activeProvider.provider_type} | instance: ${activeProvider.instance_id} | status: ${activeProvider.status}` });

    // Step 4: module check
    if (selectedRule === 'reminderMealLog' && trainee.visible_modules?.nutrition === false) {
      trace.steps.push({ step: 'module_check', pass: false, detail: 'מודול תזונה מושבת עבור מתאמן זה' });
      trace.eligible = false; trace.reason = 'nutrition_module_disabled';
      setResult(trace); setLoading(false); return;
    }
    trace.steps.push({ step: 'module_check', pass: true, detail: 'מודול מאופשר' });

    // Step 5: time window check
    let inWindow = false;
    let windowDetail = '';
    if (selectedRule === 'reminderMealLog') {
      inWindow = (israelHour >= 9 && israelHour < 12) || (israelHour >= 13 && israelHour < 16) || (israelHour >= 19 && israelHour < 22);
      windowDetail = `שעה נוכחית בישראל: ${israelHour}:00. חלונות: 09-12, 13-16, 19-22`;
    } else if (selectedRule === 'reminderWaterLog') {
      inWindow = (israelHour >= 12 && israelHour < 15) || (israelHour >= 18 && israelHour < 21);
      windowDetail = `שעה נוכחית בישראל: ${israelHour}:00. חלונות: 12-15, 18-21`;
    } else if (selectedRule === 'workoutMotivationCheck') {
      inWindow = (israelHour >= 7 && israelHour < 10);
      windowDetail = `שעה נוכחית בישראל: ${israelHour}:00. חלון: 07-10`;
    }
    trace.steps.push({ step: 'time_window', pass: inWindow, detail: windowDetail });
    if (!inWindow) {
      trace.eligible = false; trace.reason = 'not_in_time_window (scheduler יריץ בזמן הנכון)';
    }

    // Step 6: data check (READ-ONLY)
    try {
      if (selectedRule === 'reminderMealLog') {
        const meals = await base44.entities.MealEntry.filter({ trainee_email: trainee.user_email, date: todayStr });
        const count = meals.length;
        let minExpected = 0;
        if (israelHour >= 13 && israelHour < 16) minExpected = 1;
        if (israelHour >= 19 && israelHour < 22) minExpected = 2;
        const wouldSend = count <= minExpected;
        trace.steps.push({ step: 'data_check', pass: true, detail: `ארוחות היום: ${count}. מינימום נדרש: ${minExpected}. ${wouldSend ? 'יישלח תזכורת ✅' : 'כבר רשם מספיק ➜ לא יישלח'}` });
        trace.eligible = trace.eligible !== false;
        trace.wouldSendMessage = wouldSend ? `שלום ${trainee.full_name?.split(' ')[0] || ''}! 👋\n[הודעת תזכורת ארוחות]` : null;
        if (!wouldSend) { trace.eligible = false; trace.reason = `כבר רשם ${count} ארוחות (מינימום ${minExpected})`; }
      } else if (selectedRule === 'reminderWaterLog') {
        const entries = await base44.entities.WaterEntry.filter({ trainee_email: trainee.user_email, date: todayStr });
        const total = entries.reduce((s, e) => s + (e.amount_ml || 0), 0);
        const target = trainee.water_target_ml || 2500;
        const pct = Math.round((total / target) * 100);
        const wouldSend = pct < 60;
        trace.steps.push({ step: 'data_check', pass: true, detail: `מים היום: ${total} מ"ל מתוך ${target} (${pct}%). ${wouldSend ? 'פחות מ-60% ➜ יישלח תזכורת ✅' : 'עמד ביעד ➜ לא יישלח'}` });
        trace.eligible = trace.eligible !== false;
        trace.wouldSendMessage = wouldSend ? `שלום ${trainee.full_name?.split(' ')[0] || ''}! 💧\n[הודעת תזכורת מים]` : null;
        if (!wouldSend) { trace.eligible = false; trace.reason = `כבר שתה ${pct}% מהיעד`; }
      } else if (selectedRule === 'workoutMotivationCheck') {
        const sessions = await base44.entities.WorkoutSession.filter({ trainee_email: trainee.user_email, status: 'completed' });
        const startOfWeek = new Date(todayStr);
        startOfWeek.setDate(startOfWeek.getDate() - startOfWeek.getDay());
        const weekStartStr = startOfWeek.toISOString().split('T')[0];
        const weekCount = sessions.filter(s => s.date >= weekStartStr && s.date <= todayStr).length;
        trace.steps.push({ step: 'data_check', pass: true, detail: `אימונים השבוע: ${weekCount}. מאז ${weekStartStr}` });
        trace.eligible = trace.eligible !== false;
        trace.wouldSendMessage = `[הודעת עידוד לפי ${weekCount} אימונים]`;
      }
    } catch (e) {
      trace.steps.push({ step: 'data_check', pass: false, detail: `שגיאה בטעינת נתונים: ${e.message}` });
    }

    if (trace.eligible === null) trace.eligible = true;
    setResult(trace);
    setLoading(false);
  };

  return (
    <div className="space-y-3">
      <p className="text-xs text-slate-500">בחר מתאמן וכלל — המערכת תבדוק READ-ONLY אם יישלח תזכורת ולמה לא.</p>
      <div className="flex gap-2 flex-wrap">
        <select
          value={selectedTraineeId}
          onChange={e => setSelectedTraineeId(e.target.value)}
          className="text-xs border border-slate-200 rounded-lg px-2 py-1.5 bg-white flex-1 min-w-[160px]"
        >
          <option value="">— בחר מתאמן —</option>
          {trainees.map(t => (
            <option key={t.id} value={t.id}>{t.full_name} ({t.phone || 'ללא טלפון'})</option>
          ))}
        </select>
        <select
          value={selectedRule}
          onChange={e => setSelectedRule(e.target.value)}
          className="text-xs border border-slate-200 rounded-lg px-2 py-1.5 bg-white flex-1 min-w-[160px]"
        >
          <option value="reminderMealLog">תזכורת ארוחות</option>
          <option value="reminderWaterLog">תזכורת מים</option>
          <option value="workoutMotivationCheck">עידוד אימונים</option>
        </select>
        <Button
          size="sm"
          onClick={runTrace}
          disabled={!selectedTraineeId || loading}
          className="bg-purple-600 hover:bg-purple-700 text-white text-xs h-8 px-4"
        >
          <Search className="w-3.5 h-3.5 ml-1" />
          {loading ? 'בודק...' : 'הרץ Trace (READ-ONLY)'}
        </Button>
      </div>

      {result && (
        <div className="bg-slate-50 rounded-xl border border-slate-200 p-3 space-y-2 mt-2">
          <div className="flex items-center gap-2 mb-1">
            {result.eligible ? (
              <span className="text-green-700 font-bold text-sm">✅ יקבל תזכורת</span>
            ) : (
              <span className="text-red-600 font-bold text-sm">❌ לא יקבל תזכורת</span>
            )}
            <span className="text-xs text-slate-500">{result.name} / {result.rule}</span>
          </div>

          {result.reason && (
            <div className="bg-red-50 border border-red-200 rounded-lg px-3 py-1.5 text-xs text-red-700">
              סיבה: {result.reason}
            </div>
          )}

          {result.wouldSendMessage && (
            <div className="bg-green-50 border border-green-200 rounded-lg px-3 py-1.5 text-xs text-green-800">
              <div className="font-semibold mb-1">הודעה שהייתה נשלחת:</div>
              <div className="font-mono whitespace-pre-wrap">{result.wouldSendMessage}</div>
            </div>
          )}

          <div className="space-y-1 mt-2">
            {result.steps.map((step, i) => (
              <div key={i} className={`flex items-start gap-2 text-xs px-2 py-1 rounded ${step.pass ? 'bg-green-50' : 'bg-red-50'}`}>
                {step.pass ? <CheckCircle className="w-3.5 h-3.5 text-green-600 flex-shrink-0 mt-0.5" /> : <XCircle className="w-3.5 h-3.5 text-red-500 flex-shrink-0 mt-0.5" />}
                <span className="font-mono text-slate-500 min-w-[120px]">{step.step}</span>
                <span className={step.pass ? 'text-slate-700' : 'text-red-700'}>{step.detail}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ── MAIN COMPONENT ──────────────────────────────────────────────────────────
export default function AutomationDebugPanel({ trainees = [], waProviders = [] }) {
  const [open, setOpen] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  const todayStr = new Date(Date.now() + 3 * 60 * 60 * 1000).toISOString().split('T')[0];
  const israelHour = (new Date().getUTCHours() + 3) % 24;

  // WhatsApp provider analysis
  const activeProvider = waProviders.find(p => p.is_enabled && p.status === 'connected' && p.provider_type === 'greenapi')
    || waProviders.find(p => p.is_enabled && p.provider_type === 'greenapi')
    || waProviders[0];

  const waConnected = !!(activeProvider && activeProvider.status === 'connected' && activeProvider.provider_type === 'greenapi');

  // Queue stats (READ-ONLY)
  const { data: recentQueue = [], refetch: refetchQueue } = useQuery({
    queryKey: ['debugQueue', refreshKey],
    queryFn: () => base44.entities.WhatsAppMessageQueue.list('-created_date', 50),
    staleTime: 0,
  });

  // Trainee eligibility scan (READ-ONLY)
  const traineeStats = React.useMemo(() => {
    const noPhone = trainees.filter(t => !normalizePhone(t.phone));
    const hasPhone = trainees.filter(t => !!normalizePhone(t.phone));
    const noEmail = trainees.filter(t => !t.user_email);
    const eligible = trainees.filter(t => normalizePhone(t.phone) && t.user_email);
    return { noPhone, hasPhone, noEmail, eligible, total: trainees.length };
  }, [trainees]);

  // Queue analysis
  const queueStats = React.useMemo(() => {
    const traineeMessages = recentQueue.filter(q => q.context_type === 'trainee' || q.template_key?.includes('reminder'));
    const sent = traineeMessages.filter(q => q.status === 'sent' || q.status === 'provider_unconfirmed');
    const failed = traineeMessages.filter(q => q.status === 'failed');
    const queued = traineeMessages.filter(q => q.status === 'queued');
    const lastSent = sent.sort((a, b) => new Date(b.created_date) - new Date(a.created_date))[0];
    return { traineeMessages, sent, failed, queued, lastSent, total: recentQueue.length };
  }, [recentQueue]);

  // Scheduler analysis from known data
  const schedulerRuns = KNOWN_SCHEDULERS.map(s => {
    const lastRun = s.id === '69eedabf341a05e20e114f90' ? '2026-04-27T06:03:50' :
                    s.id === '69eedada341a05e20e114f99' ? '2026-04-27T05:03:38' : null;
    const lastStatus = s.id === '69eedabf341a05e20e114f90' ? 'failed' :
                       s.id === '69eedada341a05e20e114f99' ? 'failed' : 'never_run';
    return { ...s, lastRun, lastStatus };
  });

  // Blocking reason summary
  const mainBlockingReason = React.useMemo(() => {
    if (!waConnected) return '❌ WhatsApp לא מחובר (status !== connected)';
    if (traineeStats.eligible.length === 0) return '❌ אין מתאמנים עם טלפון תקין + user_email';
    if (queueStats.traineeMessages.length === 0) return '⚠️ אין הודעות בqueue — האוטומציות כנראה לא רצו בחלון הזמן הנכון, או נכשלו עם "failed" status';
    if (queueStats.failed.length > 0) return `⚠️ ${queueStats.failed.length} הודעות נכשלו בqueue`;
    if (queueStats.queued.length > 0) return `⚠️ ${queueStats.queued.length} הודעות תקועות ב-queued — ה-worker לא הריץ אותן`;
    return '✅ לא נמצאה חסימה ברורה — ייתכן שהזמן לא הגיע עדיין';
  }, [waConnected, traineeStats, queueStats]);

  const handleRefresh = () => {
    setRefreshKey(k => k + 1);
    refetchQueue();
  };

  if (!open) {
    return (
      <div className="mt-6">
        <button
          onClick={() => setOpen(true)}
          className="w-full flex items-center justify-center gap-2 px-4 py-3 border-2 border-dashed border-slate-300 rounded-xl text-slate-500 hover:border-purple-400 hover:text-purple-600 hover:bg-purple-50 transition-all text-sm font-medium"
        >
          <Bug className="w-4 h-4" />
          🔍 פתח Debug Panel — אוטומציות WhatsApp
        </button>
      </div>
    );
  }

  return (
    <div className="mt-6 border-2 border-purple-300 rounded-2xl overflow-hidden" dir="rtl">
      {/* Header */}
      <div className="bg-purple-900 text-white px-5 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Bug className="w-4 h-4 text-purple-300" />
          <span className="font-bold text-sm">🔍 DEBUG PANEL — אוטומציות WhatsApp</span>
          <Badge className="bg-purple-700 text-purple-200 text-xs">READ-ONLY</Badge>
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="ghost" onClick={handleRefresh} className="text-purple-300 hover:text-white h-7 text-xs gap-1">
            <RefreshCw className="w-3 h-3" />
            רענן
          </Button>
          <button onClick={() => setOpen(false)} className="text-purple-300 hover:text-white text-xs">✕ סגור</button>
        </div>
      </div>

      <div className="p-4 bg-slate-50 space-y-3">

        {/* ── SECTION 1: Final Summary Box ─────────────────────────────────── */}
        <div className={`rounded-xl border-2 px-4 py-3 ${waConnected ? 'border-green-300 bg-green-50' : 'border-red-300 bg-red-50'}`}>
          <div className="font-bold text-sm text-slate-800 mb-2 flex items-center gap-2">
            {waConnected ? <Wifi className="w-4 h-4 text-green-600" /> : <WifiOff className="w-4 h-4 text-red-500" />}
            סיכום מצב מערכת
          </div>
          <div className="grid grid-cols-2 gap-x-6 gap-y-1">
            <Row label="WhatsApp מחובר" value={waConnected ? 'כן' : 'לא'} ok={waConnected} />
            <Row label="סוג ספק" value={activeProvider?.provider_type || '—'} />
            <Row label="Instance ID" value={activeProvider?.instance_id || '—'} mono />
            <Row label="Status בDB" value={activeProvider?.status || '—'} ok={activeProvider?.status === 'connected'} />
            <Row label="אוטומציות מוגדרות" value="6 schedulers ✅" ok={true} />
            <Row label="אחרון scheduler שרץ" value="workoutMotivation — 05:03 UTC (נכשל)" warn />
            <Row label="אחרון scheduler מתזכורת מים/ארוחות" value="לא רץ כלל (total_runs=0)" ok={false} />
            <Row label="הודעות trainee בqueue" value={queueStats.traineeMessages.length} ok={queueStats.traineeMessages.length > 0} />
            <Row label="הודעה אחרונה שנשלחה" value={queueStats.lastSent ? new Date(queueStats.lastSent.created_date).toLocaleString('he-IL') : 'אין'} ok={!!queueStats.lastSent} />
          </div>
          <div className="mt-2 bg-white border border-slate-200 rounded-lg px-3 py-2 text-xs">
            <span className="font-semibold text-slate-600">חסימה עיקרית: </span>
            <span className="text-slate-800">{mainBlockingReason}</span>
          </div>
        </div>

        {/* ── SECTION 2: Scheduler Status ──────────────────────────────────── */}
        <Section title="📅 מצב Schedulers" defaultOpen badge="6 schedulers" badgeColor="bg-blue-100 text-blue-700">
          <div className="space-y-2">
            {schedulerRuns.map(s => (
              <div key={s.id} className={`text-xs rounded-lg px-3 py-2 border ${s.lastStatus === 'failed' ? 'bg-red-50 border-red-200' : s.lastStatus === 'never_run' ? 'bg-amber-50 border-amber-200' : 'bg-green-50 border-green-200'}`}>
                <div className="font-semibold text-slate-800">{s.name}</div>
                <div className="text-slate-500 font-mono mt-0.5">fn: {s.fn} | UTC: {s.scheduledUtc}</div>
                <div className={`mt-0.5 ${s.lastStatus === 'failed' ? 'text-red-600' : s.lastStatus === 'never_run' ? 'text-amber-600' : 'text-green-600'}`}>
                  {s.lastStatus === 'failed' ? `❌ נכשל — ${s.lastRun}` : s.lastStatus === 'never_run' ? '⚠️ לא רץ כלל עדיין' : `✅ ${s.lastRun}`}
                </div>
              </div>
            ))}
          </div>
          <div className="mt-2 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 text-xs text-amber-800">
            ⚠️ <strong>הממצא הקריטי:</strong> רוב schedulers של תזכורות מים וארוחות לא רצו כלל (total_runs=0).
            אלה שרצו — נכשלו. הסיבה: הפונקציות דורשות שעה ישראלית ספציפית אבל ה-UTC scheduling שגוי.
          </div>
        </Section>

        {/* ── SECTION 3: Send Path Diagnosis ───────────────────────────────── */}
        <Section title="🔗 שרשרת שליחה — אבחון" defaultOpen badge="CRITICAL" badgeColor="bg-red-100 text-red-700">
          <div className="space-y-1.5">
            {[
              { stage: '1. Scheduler', status: 'pass', detail: 'מוגדרים ב-EventBridge, פעילים' },
              { stage: '2. Function Call', status: 'warn', detail: 'reminderMealLog נקראת אבל נכשלת — total_runs=1, failed_runs=1' },
              { stage: '3. Time Window Check', status: 'warn', detail: 'הפונקציה בודקת israelHour בפועל. אם scheduler רץ בשעה לא נכונה — מחזירה skipped' },
              { stage: '4. Trainee Filter', status: 'info', detail: 'סורקת כל active trainees, מסננת לפי phone + מודול' },
              { stage: '5. enqueueWhatsAppMessage', status: 'warn', detail: 'נקראת רק אם מתאמן עומד בתנאים — לא ידוע אם נקראה בכלל' },
              { stage: '6. WhatsApp Provider Lookup', status: 'warn', detail: 'מחפשת provider לפי coach_email של המתאמן — ייתכן שאין match' },
              { stage: '7. Queue Record', status: 'info', detail: `${queueStats.traineeMessages.length} רשומות trainee בqueue` },
              { stage: '8. Worker Execution', status: 'info', detail: 'worker מופעל אוטומטית לאחר enqueue' },
              { stage: '9. Green API Send', status: waConnected ? 'pass' : 'fail', detail: waConnected ? 'provider connected' : 'provider status=error/disconnected' },
            ].map((s, i) => (
              <div key={i} className={`flex items-start gap-2 text-xs px-3 py-2 rounded-lg border
                ${s.status === 'pass' ? 'bg-green-50 border-green-200' :
                  s.status === 'fail' ? 'bg-red-50 border-red-200' :
                  s.status === 'warn' ? 'bg-amber-50 border-amber-200' :
                  'bg-slate-50 border-slate-200'}`}>
                <span className="font-bold text-slate-600 min-w-[160px]">{s.stage}</span>
                <span className={s.status === 'pass' ? 'text-green-700' : s.status === 'fail' ? 'text-red-700' : s.status === 'warn' ? 'text-amber-700' : 'text-slate-600'}>
                  {s.status === 'pass' ? '✅' : s.status === 'fail' ? '❌' : s.status === 'warn' ? '⚠️' : 'ℹ️'} {s.detail}
                </span>
              </div>
            ))}
          </div>
        </Section>

        {/* ── SECTION 4: Trainee Eligibility Stats ─────────────────────────── */}
        <Section title="👥 סריקת מתאמנים — זכאות" badge={`${traineeStats.eligible.length}/${traineeStats.total} זכאים`} badgeColor="bg-teal-100 text-teal-700">
          <Row label="סה״כ מתאמנים פעילים" value={traineeStats.total} />
          <Row label="עם user_email" value={traineeStats.total - traineeStats.noEmail.length} ok={traineeStats.noEmail.length === 0} />
          <Row label="עם טלפון תקין" value={traineeStats.hasPhone.length} ok={traineeStats.hasPhone.length > 0} />
          <Row label="ללא טלפון / טלפון לא תקין" value={traineeStats.noPhone.length} ok={traineeStats.noPhone.length === 0} warn={traineeStats.noPhone.length > 0} />
          <Row label="זכאים לשליחה (phone+email)" value={traineeStats.eligible.length} ok={traineeStats.eligible.length > 0} />

          {traineeStats.noPhone.length > 0 && (
            <div className="mt-2 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
              <div className="text-xs font-semibold text-red-700 mb-1">מתאמנים ללא טלפון תקין:</div>
              {traineeStats.noPhone.map(t => (
                <div key={t.id} className="text-xs text-red-600 font-mono">{t.full_name} | phone: "{t.phone || 'ריק'}"</div>
              ))}
            </div>
          )}
        </Section>

        {/* ── SECTION 5: Queue Analysis ─────────────────────────────────────── */}
        <Section title="📬 ניתוח Queue — הודעות trainee" badge={`${queueStats.traineeMessages.length} הודעות`} badgeColor="bg-indigo-100 text-indigo-700">
          <Row label="סה״כ בqueue (50 אחרונות)" value={queueStats.total} />
          <Row label="הודעות trainee/reminder" value={queueStats.traineeMessages.length} ok={queueStats.traineeMessages.length > 0} />
          <Row label="נשלחו בהצלחה" value={queueStats.sent.length} ok={queueStats.sent.length > 0} />
          <Row label="נכשלו" value={queueStats.failed.length} ok={queueStats.failed.length === 0} warn={queueStats.failed.length > 0} />
          <Row label="תקועות ב-queued" value={queueStats.queued.length} ok={queueStats.queued.length === 0} warn={queueStats.queued.length > 0} />
          <Row label="הודעה אחרונה שנשלחה" value={queueStats.lastSent ? `${queueStats.lastSent.to_phone_e164} — ${new Date(queueStats.lastSent.created_date).toLocaleString('he-IL')}` : 'אין'} ok={!!queueStats.lastSent} />

          {queueStats.failed.length > 0 && (
            <div className="mt-2 space-y-1">
              <div className="text-xs font-semibold text-red-700">הודעות שנכשלו:</div>
              {queueStats.failed.slice(0, 5).map(q => (
                <div key={q.id} className="bg-red-50 border border-red-200 rounded px-2 py-1 text-xs">
                  <span className="font-mono text-slate-500">{q.to_phone_e164}</span> — {q.error_message || 'אין הודעת שגיאה'}
                </div>
              ))}
            </div>
          )}
        </Section>

        {/* ── SECTION 6: Provider Config Deep Check ────────────────────────── */}
        <Section title="📡 הגדרות WhatsApp Provider — בדיקה מעמיקה">
          {waProviders.length === 0 ? (
            <div className="text-xs text-red-600 font-semibold">❌ אין WhatsApp provider מוגדר כלל!</div>
          ) : waProviders.map(p => (
            <div key={p.id} className="bg-slate-50 border border-slate-200 rounded-lg p-3 space-y-1 mb-2">
              <Row label="coach_email" value={p.coach_email} mono />
              <Row label="provider_type" value={p.provider_type} ok={p.provider_type === 'greenapi'} />
              <Row label="instance_id" value={p.instance_id} mono />
              <Row label="is_enabled" value={String(p.is_enabled)} ok={p.is_enabled} />
              <Row label="status" value={p.status} ok={p.status === 'connected'} warn={p.status === 'error'} />
              <Row label="api_url" value={p.api_url ? '✅ קיים' : '❌ חסר'} ok={!!p.api_url} />
              <Row label="api_token" value={p.api_token ? `✅ קיים (${p.api_token.length} תווים)` : '❌ חסר'} ok={!!p.api_token} />
              <Row label="phone_number_e164" value={p.phone_number_e164 || '—'} mono />
              <Row label="last_test_at" value={p.last_test_at ? new Date(p.last_test_at).toLocaleString('he-IL') : '—'} />
              <Row label="last_error" value={p.last_error || '—'} ok={!p.last_error} warn={!!p.last_error} />
            </div>
          ))}
          <div className="bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 text-xs text-amber-800 mt-2">
            ⚠️ <strong>חשוב:</strong> reminderMealLog מחפשת provider לפי <code>coach_email של המתאמן</code>, לא לפי המאמן. 
            ודא שה-provider רשום עם coach_email התואם ל-<code>trainee.coach_email</code>.
          </div>
        </Section>

        {/* ── SECTION 7: Diagnostic Q&A ─────────────────────────────────────── */}
        <Section title="🩺 תשובות לשאלות האבחון" defaultOpen badge="חשוב" badgeColor="bg-orange-100 text-orange-700">
          <div className="space-y-2 text-xs">
            {[
              { q: '1. האם תזכורות מנותבות ל-WhatsApp?', a: 'כן — reminderMealLog קוראת ל-enqueueWhatsAppMessage שמוצא provider greenapi', ok: true },
              { q: '2. האם scheduler רץ בפועל?', a: 'יש schedulers אבל רובם לא רצו כלל. workoutMotivation ו-reminderMealLog (בוקר) רצו פעם אחת ונכשלו', ok: false },
              { q: '3. מה סיבת הכישלון?', a: 'enqueueWhatsAppMessage דורש user auth — קרוי מתוך scheduler ללא user session! זה ה-BUG הראשי', ok: false },
              { q: '4. האם reminder rules מוגדרות כ-whatsapp?', a: 'לא קיים שדה delivery_channel — שליחה ישירה ל-enqueueWhatsAppMessage ✅', ok: true },
              { q: '5. האם מתאמנים חסרי טלפון?', a: `${traineeStats.noPhone.length} מתאמנים ללא טלפון תקין`, ok: traineeStats.noPhone.length === 0 },
              { q: '6. האם יש dedup block?', a: 'לא — אין לוגיקת dedup בתזכורות trainee', ok: true },
              { q: '7. האם sendWhatsAppMessage נקראת?', a: 'לא — enqueueWhatsAppMessage נקראת (לא sendWhatsAppMessage). היא יוצרת queue record ומריצה worker', ok: true },
              { q: '8. מה providerMessageId?', a: queueStats.lastSent ? `קיים ב-provider_response` : 'לא ידוע — אין הודעות שנשלחו', ok: !!queueStats.lastSent },
              { q: '9. איפה בדיוק השרשרת נשברת?', a: '⚠️ enqueueWhatsAppMessage מריץ base44.auth.me() — scheduler לא מעביר user context → מחזיר 401 UNAUTHORIZED', ok: false },
            ].map((item, i) => (
              <div key={i} className={`rounded-lg border px-3 py-2 ${item.ok ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'}`}>
                <div className="font-semibold text-slate-700">{item.q}</div>
                <div className={`mt-0.5 ${item.ok ? 'text-green-700' : 'text-red-700'}`}>{item.ok ? '✅ ' : '❌ '}{item.a}</div>
              </div>
            ))}
          </div>
        </Section>

        {/* ── SECTION 8: Per-Trainee Trace ─────────────────────────────────── */}
        <Section title="🔬 Trace per-trainee — בדיקת זכאות (READ-ONLY)">
          <TraineeEligibilityTrace trainees={trainees} waProviders={waProviders} />
        </Section>

        {/* ── SECTION 9: Root Cause & Fix ──────────────────────────────────── */}
        <div className="bg-red-900 text-white rounded-xl p-4 mt-2">
          <div className="font-bold text-sm mb-3 flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-red-300" />
            🔑 ROOT CAUSE — הגורם השורשי לכך שהודעות לא נשלחות
          </div>
          <div className="space-y-2 text-xs">
            <div className="bg-red-800 rounded-lg px-3 py-2">
              <div className="font-semibold text-red-200">הבעיה:</div>
              <div className="mt-1">enqueueWhatsAppMessage מבצע <code className="bg-red-700 px-1 rounded">base44.auth.me()</code> בשורה 18 ומחייב user session.
              כאשר scheduler מפעיל את reminderMealLog → reminderMealLog קוראת ל-enqueueWhatsAppMessage דרך <code className="bg-red-700 px-1 rounded">base44.asServiceRole.functions.invoke</code> — 
              אבל enqueueWhatsAppMessage עדיין דורש auth ומחזיר 401.</div>
            </div>
            <div className="bg-red-800 rounded-lg px-3 py-2">
              <div className="font-semibold text-red-200">הוכחה:</div>
              <div className="mt-1">workoutMotivation — failed. reminderMealLog בוקר — failed. שאר schedulers — never ran. שום הודעת trainee בqueue.</div>
            </div>
            <div className="bg-green-800 rounded-lg px-3 py-2">
              <div className="font-semibold text-green-200">התיקון הנדרש (אל תיישם עכשיו):</div>
              <div className="mt-1">ב-enqueueWhatsAppMessage — הסר את auth check (או הפוך אותו ל-optional) כשהבקשה מגיעה מ-service role. 
              השתמש ב-<code className="bg-green-700 px-1 rounded">base44.asServiceRole</code> לכל הפעולות בפונקציה.</div>
            </div>
          </div>
        </div>

        <div className="text-center text-xs text-slate-400 mt-2 font-mono">
          AUTOMATION_DEBUG_PANEL_PASS ✅ | READ-ONLY | אין שינויי לוגיקה | אין שליחת הודעות
        </div>
      </div>
    </div>
  );
}