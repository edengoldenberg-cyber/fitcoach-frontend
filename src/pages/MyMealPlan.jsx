import React, { useState, useEffect, useRef } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import MacroWheels from '@/components/mealplan/MacroWheels';
import MealItemRow from '@/components/mealplan/MealItemRow';
import MealFeedbackChat from '@/components/mealplan/MealFeedbackChat';
import { Button } from '@/components/ui/button';
import {
  ChevronRight, ChevronDown, ChevronUp, RefreshCw,
  Sparkles, Loader2, Calendar, Sun, MapPin, CheckCircle2, X,
  ArrowLeft, Plus, Minus,
} from 'lucide-react';

const DAY_NAMES_FALLBACK = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת'];

// ── EditSuccessBanner ──────────────────────────────────────────────────────────

function ItemLine({ item, removed }) {
  const name = typeof item === 'string' ? item : (item?.food_item || '');
  const cal  = typeof item === 'object' ? item?.calories : null;
  const qty  = typeof item === 'object' ? (item?.quantity_description || (item?.quantity_grams ? `${item.quantity_grams}ג` : null)) : null;
  return (
    <div className={`flex justify-between items-baseline text-xs gap-1 ${removed ? 'text-slate-400 line-through' : 'text-green-700'}`}>
      <span>{name}{qty ? ` — ${qty}` : ''}</span>
      {cal != null && <span className="shrink-0">{Math.round(cal)} קק"ל</span>}
    </div>
  );
}

function MacroDelta({ label, before, after, unit = 'ג', colorClass = 'text-slate-600' }) {
  if (before == null && after == null) return null;
  const same = Math.abs((after || 0) - (before || 0)) <= 2;
  return (
    <span className="text-[11px] text-slate-500">
      {label}:{' '}
      {same
        ? <span className={colorClass}>{after}{unit}</span>
        : <><span className="line-through text-slate-400">{before}{unit}</span>{' → '}<span className={`font-medium ${colorClass}`}>{after}{unit}</span></>}
    </span>
  );
}

function ChangedMealCard({ mealDiff }) {
  const calSame = Math.abs((mealDiff.after_calories || 0) - (mealDiff.before_calories || 0)) <= (mealDiff.before_calories || 0) * 0.05 && mealDiff.before_calories > 0;

  return (
    <div className="bg-white rounded-xl border border-green-100 p-3 space-y-2 text-right">
      <p className="font-semibold text-slate-700 text-sm">{mealDiff.after_name || mealDiff.before_name}</p>

      {mealDiff.removed_items?.length > 0 && (
        <div className="space-y-0.5">
          {mealDiff.removed_items.map((it, i) => <ItemLine key={i} item={it} removed />)}
        </div>
      )}
      {mealDiff.removed_items?.length > 0 && mealDiff.added_items?.length > 0 && (
        <div className="flex justify-center text-green-400 text-sm">↓</div>
      )}
      {mealDiff.added_items?.length > 0 && (
        <div className="space-y-0.5">
          {mealDiff.added_items.map((it, i) => <ItemLine key={i} item={it} removed={false} />)}
        </div>
      )}

      <div className="border-t border-green-100 pt-2 flex flex-wrap gap-x-3 gap-y-1">
        {calSame ? (
          <span className="text-[11px] text-slate-500">
            קלוריות: <span className="text-slate-700">{mealDiff.after_calories}</span>{' '}
            <span className="text-slate-400 italic">(נשמר)</span>
          </span>
        ) : (
          <MacroDelta label="קלוריות" before={mealDiff.before_calories} after={mealDiff.after_calories} unit=" קק&quot;ל" colorClass="text-teal-700" />
        )}
        <MacroDelta label="חלבון"   before={mealDiff.before_protein} after={mealDiff.after_protein} colorClass="text-blue-600" />
        <MacroDelta label="פחמימות" before={mealDiff.before_carbs}   after={mealDiff.after_carbs}   colorClass="text-amber-600" />
        <MacroDelta label="שומן"    before={mealDiff.before_fat}     after={mealDiff.after_fat}     colorClass="text-green-600" />
      </div>
    </div>
  );
}

function EditSuccessBanner({ banner, onDismiss }) {
  if (!banner) return null;
  const { change_summary } = banner;
  const hasSummary = change_summary?.length > 0;

  return (
    <div className="mx-4 mb-2 bg-green-50 border border-green-200 rounded-2xl p-4 space-y-3" dir="rtl">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <CheckCircle2 className="w-5 h-5 text-green-600 shrink-0" />
          <p className="text-green-800 font-semibold text-sm">התפריט עודכן בהצלחה</p>
        </div>
        <button onClick={onDismiss} className="text-green-400 hover:text-green-600 p-1 rounded-full hover:bg-green-100 transition-colors">
          <X className="w-4 h-4" />
        </button>
      </div>

      {hasSummary ? (
        change_summary.map((day, di) => (
          <div key={di} className="space-y-2">
            <p className="text-xs font-bold text-green-800">יום {day.day_name}</p>
            {day.changed_meals?.length > 0
              ? day.changed_meals.map((mealDiff, mi) => (
                  <ChangedMealCard key={mi} mealDiff={mealDiff} />
                ))
              : (
                <div className="text-xs text-slate-500 flex flex-wrap gap-3">
                  {Math.abs((day.after.calories || 0) - (day.before.calories || 0)) > 10 && (
                    <MacroDelta label="קלוריות" before={day.before.calories} after={day.after.calories} unit=" קק&quot;ל" colorClass="text-teal-700" />
                  )}
                  <MacroDelta label="חלבון" before={day.before.protein} after={day.after.protein} colorClass="text-blue-600" />
                </div>
              )}
          </div>
        ))
      ) : (
        <p className="text-xs text-slate-500 text-right">{banner.ai_response}</p>
      )}
    </div>
  );
}

// ── MealCard ───────────────────────────────────────────────────────────────────

function MealCard({ meal, mealIndex, planId, onMealUpdated, dayIndex, isRecentlyChanged }) {
  const [expanded, setExpanded] = useState(true);
  const [highlight, setHighlight] = useState(isRecentlyChanged);

  useEffect(() => {
    if (!isRecentlyChanged) return;
    setHighlight(true);
    const t = setTimeout(() => setHighlight(false), 3000);
    return () => clearTimeout(t);
  }, [isRecentlyChanged]);

  const mealName = meal.meal_name || '';
  const emoji = mealName.includes('בוקר') ? '🌅' :
    mealName.includes('צהר') ? '☀️' :
    mealName.includes('ערב') ? '🌙' :
    mealName.includes('אמצע') ? '🍎' : '🍽️';

  return (
    <div
      data-meal-key={`${dayIndex}-${mealIndex}`}
      className="rounded-2xl border border-slate-100 shadow-sm overflow-hidden"
      style={{
        backgroundColor: highlight ? '#d1fae5' : 'white',
        transition: 'background-color 1s ease-out',
        outline: highlight ? '2px solid #6ee7b7' : 'none',
        outlineOffset: '0px',
      }}
    >
      <button onClick={() => setExpanded(e => !e)} className="w-full flex items-center justify-between p-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center text-xl" style={{ backgroundColor: '#f0fdfb' }}>
            {meal.is_restaurant ? '🍴' : emoji}
          </div>
          <div className="text-right">
            <div className="font-bold text-slate-800 text-base">{meal.meal_name}</div>
            <div className="text-xs text-slate-500">{meal.meal_time && `${meal.meal_time} • `}{Math.round(meal.meal_calories)} קק"ל</div>
            {meal.is_restaurant && (
              <div className="flex items-center gap-1 mt-0.5">
                <MapPin className="w-3 h-3 text-orange-400" />
                <span className="text-xs text-orange-500">ארוחה במסעדה</span>
              </div>
            )}
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex gap-2 text-xs">
            <span className="text-blue-600 font-medium">{Math.round(meal.meal_protein)}ח</span>
            <span className="text-amber-600 font-medium">{Math.round(meal.meal_carbs)}פ</span>
            <span className="text-green-600 font-medium">{Math.round(meal.meal_fat)}ש</span>
          </div>
          {expanded ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
        </div>
      </button>

      {expanded && (
        <div className="px-4 pb-4 space-y-3 border-t border-slate-50 pt-3">
          {meal.is_restaurant && meal.restaurant_notes && (
            <div className="bg-orange-50 rounded-xl p-3 border border-orange-100">
              <p className="text-xs text-orange-700 text-right">💡 {meal.restaurant_notes}</p>
            </div>
          )}
          {meal.items?.map((item, idx) => (
            <MealItemRow
              key={idx}
              item={item}
              itemIndex={idx}
              mealIndex={mealIndex}
              dayIndex={dayIndex}
              planId={planId}
              onMealUpdated={onMealUpdated}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ── DayView ────────────────────────────────────────────────────────────────────

function DayView({ day, dayIndex, planId, onRefresh, onDayChanged, onEditSuccess, highlightedMeals }) {
  const dayName = day.day_name && day.day_name !== 'null' ? day.day_name : DAY_NAMES_FALLBACK[dayIndex] || `יום ${dayIndex + 1}`;

  const meals   = Array.isArray(day.meals) ? day.meals : [];
  const dayCals  = day.daily_calories || meals.reduce((s, m) => s + (m.meal_calories || 0), 0);
  const dayPro   = day.daily_protein  || meals.reduce((s, m) => s + (m.meal_protein  || 0), 0);
  const dayCarbs = day.daily_carbs    || meals.reduce((s, m) => s + (m.meal_carbs    || 0), 0);
  const dayFat   = day.daily_fat      || meals.reduce((s, m) => s + (m.meal_fat      || 0), 0);

  return (
    <div className="space-y-3">
      <MacroWheels
        calories={dayCals}
        protein={dayPro}
        carbs={dayCarbs}
        fat={dayFat}
        title={`יום ${dayName} — ערכים תזונתיים`}
      />
      {day.is_eating_out_day && (
        <div className="flex items-center gap-2 bg-orange-50 rounded-xl px-4 py-3 border border-orange-100">
          <MapPin className="w-4 h-4 text-orange-400 flex-shrink-0" />
          <p className="text-sm text-orange-700 text-right">יום אכילה בחוץ — כולל המלצות למסעדה</p>
        </div>
      )}
      {meals.map((meal, idx) => (
        <MealCard
          key={idx}
          meal={meal}
          mealIndex={idx}
          dayIndex={dayIndex}
          planId={planId}
          onMealUpdated={onRefresh}
          isRecentlyChanged={
            highlightedMeals?.dayIndex === dayIndex &&
            (highlightedMeals?.mealIndexes?.includes(idx) ?? false)
          }
        />
      ))}
      <MealFeedbackChat
        planId={planId}
        dayIndex={dayIndex}
        onPlanUpdated={onRefresh}
        onDayChanged={onDayChanged}
        onEditSuccess={onEditSuccess}
      />
    </div>
  );
}

// ── MyMealPlan (page) ─────────────────────────────────────────────────────────

export default function MyMealPlan() {
  const navigate     = useNavigate();
  const queryClient  = useQueryClient();
  const [selectedDay, setSelectedDay]     = useState(0);
  const [generatingWeekly, setGeneratingWeekly] = useState(false);
  const [weeklyJobId,      setWeeklyJobId]      = useState(null);
  const [weeklyProgress,   setWeeklyProgress]   = useState(0);
  const [weeklyStage,      setWeeklyStage]       = useState('');
  const [weeklyStep,       setWeeklyStep]        = useState(null);
  const [weeklyError,      setWeeklyError]       = useState(null);
  const [weeklyStartTime,  setWeeklyStartTime]   = useState(null);
  const weeklyPollRef     = useRef(null);
  const [editBanner, setEditBanner]       = useState(null);
  const [highlightedMeals, setHighlightedMeals] = useState(null);
  const bannerDismissTimer = useRef(null);

  const { data: user } = useQuery({ queryKey: ['currentUser'], queryFn: () => base44.auth.me() });
  const { data: traineeList } = useQuery({
    queryKey: ['wizard_trainee', user?.id, user?.email],
    queryFn: async () => {
      if (!user) return [];
      try {
        const byId = await base44.entities.Trainee.filter({ user_id: user.id });
        if (byId?.length) return byId;
      } catch { /* ignore */ }
      try {
        const byEmail = await base44.entities.Trainee.filter({ user_email: user.email });
        if (byEmail?.length) return byEmail;
      } catch { /* ignore */ }
      return [];
    },
    enabled: !!user?.id,
    staleTime: 0,
  });
  const trainee = traineeList?.[0];

  const { data: plan, isLoading, refetch } = useQuery({
    queryKey: ['activeMealPlan', trainee?.id],
    queryFn: async () => {
      if (!trainee?.id) return null;
      const plans = await base44.entities.PersonalMealPlan.filter({ trainee_id: trainee.id, is_active: true });
      const raw = plans[0];
      if (!raw) return null;
      return {
        ...raw,
        meals:       typeof raw.meals       === 'string' ? JSON.parse(raw.meals)       : (raw.meals       || []),
        weekly_days: typeof raw.weekly_days === 'string' ? JSON.parse(raw.weekly_days) : (raw.weekly_days || []),
      };
    },
    enabled: !!trainee?.id,
  });

  const handleRefresh = async () => {
    await queryClient.invalidateQueries({ queryKey: ['activeMealPlan', trainee?.id] });
    await refetch();
  };

  // ── Weekly generation — real backend progress ──────────────────────────────
  const WEEKLY_JOB_KEY = trainee?.id ? `weeklyMealGenJob_${trainee.id}` : null;

  const WEEKLY_STAGE_LABELS = {
    REQUEST_ACCEPTED:       'בקשה התקבלה',
    INPUTS_LOADED:          'נתונים נטענו',
    AI_GENERATION_STARTED:  'ה-AI מייצר תפריט שבועי',
    AI_RESPONSE_RECEIVED:   'תגובת AI התקבלה',
    WEEKLY_DAYS_PARSED:     'מעבד 7 ימים',
    NORMALIZATION_COMPLETED:'נרמול ערכים',
    REPAIR_STARTED:         'בודק דיוק תזונתי',
    REPAIR_COMPLETED:       'תיקון הושלם',
    VALIDATION_COMPLETED:   'ולידציה עברה',
    TRANSACTION_STARTED:    'שומר תפריט',
    PLAN_SAVED:             'תפריט נשמר',
    ACTIVE_PLAN_CONFIRMED:  'הושלם!',
    FAILED:                 'נכשל',
  };
  const WEEKLY_STAGE_STEPS = {
    REQUEST_ACCEPTED:        1,
    INPUTS_LOADED:           2,
    AI_GENERATION_STARTED:   3,
    AI_RESPONSE_RECEIVED:    4,
    WEEKLY_DAYS_PARSED:      5,
    NORMALIZATION_COMPLETED: 6,
    REPAIR_STARTED:          7,
    REPAIR_COMPLETED:        8,
    VALIDATION_COMPLETED:    9,
    TRANSACTION_STARTED:     9,
    PLAN_SAVED:              10,
    ACTIVE_PLAN_CONFIRMED:   10,
  };
  const WEEKLY_STAGE_TOTAL = 10;
  const getWeeklyStageLabel = (stage) => WEEKLY_STAGE_LABELS[stage] || stage || 'מעבד...';

  const stopWeeklyPoll = () => {
    if (weeklyPollRef.current) { clearInterval(weeklyPollRef.current); weeklyPollRef.current = null; }
  };

  // Cleanup on unmount
  useEffect(() => () => stopWeeklyPoll(), []);

  // On mount: reconnect to any in-progress weekly job saved in localStorage
  useEffect(() => {
    if (!WEEKLY_JOB_KEY || generatingWeekly) return;
    const savedId = localStorage.getItem(WEEKLY_JOB_KEY);
    if (!savedId) return;
    base44.functions.invoke('getMealJobStatus', { job_id: savedId })
      .then(res => {
        const job = res?.data;
        if (!job) { localStorage.removeItem(WEEKLY_JOB_KEY); return; }
        if (job.status === 'queued' || job.status === 'running') {
          setWeeklyJobId(savedId);
          setGeneratingWeekly(true);
          setWeeklyProgress(job.progress || 5);
          setWeeklyStage(getWeeklyStageLabel(job.stage));
          setWeeklyStartTime(Date.now() - 60000);
        } else {
          localStorage.removeItem(WEEKLY_JOB_KEY);
        }
      })
      .catch(() => localStorage.removeItem(WEEKLY_JOB_KEY));
  }, [WEEKLY_JOB_KEY]);

  // Polling interval — fires every 5 s while a job is active
  useEffect(() => {
    if (!generatingWeekly || !weeklyJobId) return;
    stopWeeklyPoll();
    weeklyPollRef.current = setInterval(async () => {
      try {
        const res = await base44.functions.invoke('getMealJobStatus', { job_id: weeklyJobId });
        const job = res?.data;
        if (!job) return;
        // Never fake 100% — only set it on ACTIVE_PLAN_CONFIRMED
        if (job.stage !== 'ACTIVE_PLAN_CONFIRMED') {
          setWeeklyProgress(Math.min(job.progress || 0, 99));
        }
        setWeeklyStage(getWeeklyStageLabel(job.stage));
        setWeeklyStep(WEEKLY_STAGE_STEPS[job.stage] || null);

        if (job.status === 'completed' && job.active_plan_id) {
          stopWeeklyPoll();
          setWeeklyProgress(100);
          setWeeklyStage('הושלם!');
          if (WEEKLY_JOB_KEY) localStorage.removeItem(WEEKLY_JOB_KEY);
          await queryClient.invalidateQueries({ queryKey: ['activeMealPlan', trainee?.id] });
          await refetch();
          setSelectedDay(0);
          setTimeout(() => {
            setGeneratingWeekly(false);
            setWeeklyJobId(null);
            setWeeklyProgress(0);
            setWeeklyStage('');
            setWeeklyStep(null);
          }, 1200);
        } else if (job.status === 'failed') {
          stopWeeklyPoll();
          if (WEEKLY_JOB_KEY) localStorage.removeItem(WEEKLY_JOB_KEY);
          setWeeklyError({
            job_id:           job.id,
            trace_id:         job.trace_id,
            traineeId:        job.trainee_id,
            stage:            job.stage,
            safe_error:       job.safe_error,
            validation_codes: job.validation_codes,
            started_at:       job.started_at,
            failed_at:        job.completed_at,
            ts:               new Date().toISOString(),
          });
          setGeneratingWeekly(false);
          setWeeklyProgress(0);
          setWeeklyStage('');
          setWeeklyStep(null);
          setWeeklyJobId(null);
        }
      } catch { /* ignore transient poll errors */ }
    }, 5000);
    return stopWeeklyPoll;
  }, [generatingWeekly, weeklyJobId]);

  // Legacy reconciliation: syncs plan.total_* → trainee.target_* to recover from:
  //   (a) revision-0 plans created before backend target sync was added
  //   (b) past non-transactional sync failures (.catch(() => {}) paths, now fixed)
  // Do NOT run while generation is active — the wizard pre-writes the approved target
  // before the job starts, and firing here would overwrite it with the stale plan total.
  useEffect(() => {
    if (!plan || !trainee?.id) return;
    if (generatingWeekly) return;
    const planCal  = plan.total_calories || 0;
    const planPro  = plan.total_protein  || 0;
    const planCarb = plan.total_carbs    || 0;
    const planFat  = plan.total_fat      || 0;
    if (!planCal && !planPro) return;
    if (
      trainee.target_calories !== planCal ||
      trainee.target_protein  !== planPro ||
      trainee.target_carbs    !== planCarb ||
      trainee.target_fat      !== planFat
    ) {
      base44.entities.Trainee.update(trainee.id, {
        target_calories: planCal, target_protein: planPro,
        target_carbs: planCarb,  target_fat:     planFat,
      }).then(() => {
        queryClient.invalidateQueries({ queryKey: ['trainee'] });
        queryClient.invalidateQueries({ queryKey: ['wizard_trainee'] });
      }).catch(() => {});
    }
  }, [plan?.id, trainee?.id]);

  // Scroll to first changed meal after selectedDay navigation settles.
  useEffect(() => {
    if (!highlightedMeals || highlightedMeals.dayIndex !== selectedDay) return;
    const firstMealIdx = highlightedMeals.mealIndexes?.[0];
    if (firstMealIdx == null) return;
    const t = setTimeout(() => {
      const el = document.querySelector(`[data-meal-key="${selectedDay}-${firstMealIdx}"]`);
      el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 250);
    return () => clearTimeout(t);
  }, [selectedDay, highlightedMeals]);

  // Auto-dismiss banner after 20 s.
  useEffect(() => {
    if (!editBanner) return;
    clearTimeout(bannerDismissTimer.current);
    bannerDismissTimer.current = setTimeout(() => setEditBanner(null), 20000);
    return () => clearTimeout(bannerDismissTimer.current);
  }, [editBanner]);

  const handleEditSuccess = (data) => {
    setEditBanner(data);
    // Mark which meals to highlight
    const firstChangedDay = data.changed_indexes?.[0];
    const summary = data.change_summary?.find(d => d.day_index === firstChangedDay);
    const mealIndexes = summary?.changed_meals?.map(m => m.meal_index) ?? [];
    setHighlightedMeals({ dayIndex: firstChangedDay ?? 0, mealIndexes });
    // Clear highlight after animation completes
    setTimeout(() => setHighlightedMeals(null), 4000);
  };

  const generateWeekly = async () => {
    if (!trainee) return;
    setWeeklyError(null);
    setGeneratingWeekly(true);
    setWeeklyProgress(5);
    setWeeklyStage('מתחיל יצירה');
    setWeeklyStep(null);
    setWeeklyStartTime(Date.now());
    try {
      const startRes = await base44.functions.invoke('startMealGenerationJob', {
        trainee_id: trainee.id,
        mode:       'weekly',
      });
      const jobId = startRes?.data?.job_id;
      if (!jobId) throw new Error('לא הצלחנו להתחיל יצירת תפריט שבועי');
      if (WEEKLY_JOB_KEY) localStorage.setItem(WEEKLY_JOB_KEY, jobId);
      setWeeklyJobId(jobId);
      setWeeklyProgress(startRes?.data?.existing ? 20 : 8);
      setWeeklyStage(startRes?.data?.existing ? 'ממשיך יצירה קיימת' : 'בקשה התקבלה');
      // Polling effect takes over — see useEffect above
    } catch (err) {
      setGeneratingWeekly(false);
      setWeeklyProgress(0);
      setWeeklyStage('');
      toast.error(err.message || 'שגיאה ביצירת תפריט שבועי. נסה שוב.');
    }
  };

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4" dir="rtl">
        <div className="w-12 h-12 border-4 border-teal-200 border-t-teal-500 rounded-full animate-spin" />
        <p className="text-slate-500 text-sm">טוען תפריט...</p>
      </div>
    );
  }

  if (!plan) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-5 px-6" dir="rtl">
        <div className="text-6xl">🍽️</div>
        <h2 className="text-xl font-bold text-slate-800 text-center">עוד אין לך תפריט אישי</h2>
        <p className="text-slate-500 text-center text-sm">בנה תפריט אישי מותאם לך עם עזרת AI</p>
        <Button
          onClick={() => navigate('/MealPlanWizard')}
          className="gap-2 text-white font-bold px-8"
          style={{ backgroundColor: '#79DBD6' }}
        >
          <Sparkles className="w-5 h-5" />
          בנה תפריט אישי
        </Button>
      </div>
    );
  }

  const isWeekly    = plan.is_weekly && plan.weekly_days?.length > 0;
  const currentDay  = isWeekly ? plan.weekly_days[selectedDay] : null;
  const todayDayOfWeek = new Date().getDay();

  return (
    <div className="min-h-screen bg-slate-50 pb-24" dir="rtl">
      {/* Header */}
      <div className="bg-white border-b px-4 py-4 sticky top-0 z-10 shadow-sm">
        <div className="max-w-lg mx-auto flex items-center justify-between">
          <button onClick={() => navigate(-1)} className="p-2 rounded-full hover:bg-slate-100">
            <ChevronRight className="w-5 h-5 text-slate-600" />
          </button>
          <div className="text-center">
            <h1 className="text-lg font-bold text-slate-800">התפריט שלי</h1>
            <p className="text-xs text-slate-500">{plan.plan_name || 'תפריט אישי'}</p>
          </div>
          <button onClick={() => navigate('/MealPlanWizard')} className="p-2 rounded-full hover:bg-slate-100" title="הגדרות תפריט">
            <RefreshCw className="w-4 h-4 text-slate-500" />
          </button>
        </div>
      </div>

      <div className="max-w-lg mx-auto py-4 space-y-4">

        {/* Success banner — rendered at page level, survives day navigation */}
        <EditSuccessBanner banner={editBanner} onDismiss={() => setEditBanner(null)} />

        <div className="px-4 space-y-4">
          {/* Weekly / Daily toggle */}
          <div className="flex items-center gap-2">
            <button
              onClick={() => navigate('/MealPlanWizard')}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl border text-xs font-medium bg-white border-slate-200 text-slate-600 hover:bg-slate-50"
            >
              <Sun className="w-3.5 h-3.5" />
              תפריט יומי
            </button>
            <button
              onClick={generateWeekly}
              disabled={generatingWeekly}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl border text-xs font-medium transition-all disabled:opacity-60"
              style={{
                backgroundColor: isWeekly ? '#79DBD6' : 'white',
                color: isWeekly ? 'white' : '#79DBD6',
                borderColor: '#79DBD6',
              }}
            >
              {generatingWeekly ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Calendar className="w-3.5 h-3.5" />}
              {generatingWeekly
                ? `${weeklyProgress}% — ${weeklyStage || 'מכין...'}`
                : isWeekly ? 'תפריט שבועי ✓' : 'צור תפריט שבועי'}
            </button>
          </div>

          {/* Real backend progress panel — shown only during generation */}
          {generatingWeekly && (() => {
            const elapsedMs   = weeklyStartTime ? Date.now() - weeklyStartTime : 0;
            const rateMs      = weeklyProgress > 5 ? elapsedMs / weeklyProgress : null;
            const remainingMs = rateMs ? Math.max(0, rateMs * (100 - weeklyProgress)) : null;
            const remainingMin = remainingMs != null ? Math.ceil(remainingMs / 60000) : null;
            const estLabel = remainingMin == null
              ? null
              : remainingMin <= 1
                ? 'פחות מדקה (הערכה)'
                : `~${remainingMin} דקות (הערכה)`;
            return (
              <div className="bg-white rounded-2xl border border-teal-100 p-4 space-y-3">
                <div className="flex items-center justify-between text-sm">
                  <span className="font-medium text-slate-700">{weeklyStage || 'מתחיל...'}</span>
                  <div className="flex items-center gap-2">
                    {weeklyStep != null && (
                      <span className="text-xs text-slate-400">שלב {weeklyStep} מתוך {WEEKLY_STAGE_TOTAL}</span>
                    )}
                    <span className="text-slate-500 font-mono font-medium">{weeklyProgress}%</span>
                  </div>
                </div>
                <div className="w-full bg-slate-100 rounded-full h-2.5 overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all duration-500"
                    style={{ width: `${weeklyProgress}%`, background: 'linear-gradient(90deg, #79DBD6, #3b82f6)' }}
                  />
                </div>
                {estLabel && weeklyProgress > 5 && weeklyProgress < 99 && (
                  <p className="text-xs text-slate-400 text-center">{estLabel}</p>
                )}
                {weeklyStartTime && (Date.now() - weeklyStartTime) > 180000 && weeklyProgress < 90 && (
                  <p className="text-xs text-amber-600 text-center">
                    ממשיך לעבוד ברקע — אפשר לסגור ולחזור
                  </p>
                )}
              </div>
            );
          })()}

          {/* Failure panel — copyable error report, old plan preserved */}
          {weeklyError && !generatingWeekly && (
            <div className="bg-red-50 border border-red-200 rounded-2xl p-4 space-y-3">
              <p className="text-sm font-bold text-red-800">לא הצלחנו ליצור תפריט שבועי.</p>
              <p className="text-xs text-red-700">התפריט הקודם שלך נשמר ולא בוצע שום שינוי.</p>
              <button
                className="w-full py-2 rounded-xl border border-red-300 text-red-700 text-xs font-medium hover:bg-red-100 transition-colors"
                onClick={() => {
                  const report = [
                    '=== FitCoach Weekly Meal Plan Error Report ===',
                    `job_id: ${weeklyError.job_id || 'N/A'}`,
                    `trace_id: ${weeklyError.trace_id || 'N/A'}`,
                    `trainee_id: ${weeklyError.traineeId || 'N/A'}`,
                    `stage: ${weeklyError.stage || 'N/A'}`,
                    `safe_error: ${weeklyError.safe_error || 'N/A'}`,
                    `validation_codes: ${JSON.stringify(weeklyError.validation_codes || [])}`,
                    `started_at: ${weeklyError.started_at || 'N/A'}`,
                    `failed_at: ${weeklyError.failed_at || 'N/A'}`,
                    `frontend_ts: ${weeklyError.ts || 'N/A'}`,
                    `old_plan_preserved: true`,
                    `new_plan_created: false`,
                  ].join('\n');
                  navigator.clipboard.writeText(report).catch(() => {});
                  alert('דוח שגיאה הועתק ללוח!');
                }}
              >
                העתק דוח תקלה
              </button>
              <button
                className="w-full py-2 rounded-xl text-slate-500 text-xs hover:bg-slate-50 transition-colors"
                onClick={() => setWeeklyError(null)}
              >
                סגור
              </button>
            </div>
          )}

          {/* Weekly day tabs */}
          {isWeekly && (
            <div className="flex gap-1 overflow-x-auto pb-1 -mx-1 px-1">
              {plan.weekly_days.map((day, idx) => {
                const isToday    = idx === todayDayOfWeek;
                const isSelected = idx === selectedDay;
                const tabDayName = day.day_name && day.day_name !== 'null' ? day.day_name : DAY_NAMES_FALLBACK[idx] || `יום ${idx + 1}`;
                return (
                  <button
                    key={idx}
                    onClick={() => setSelectedDay(idx)}
                    className="flex-shrink-0 flex flex-col items-center px-3 py-2 rounded-xl text-xs font-medium transition-all"
                    style={{
                      backgroundColor: isSelected ? '#79DBD6' : isToday ? '#f0fdfb' : 'white',
                      color: isSelected ? 'white' : isToday ? '#079688' : '#64748b',
                      border: `1.5px solid ${isSelected ? '#79DBD6' : isToday ? '#b2f5ea' : '#e2e8f0'}`,
                    }}
                  >
                    <span>{tabDayName}</span>
                    {day.is_eating_out_day && <span className="mt-0.5">🍴</span>}
                    {isToday && !isSelected && <span className="mt-0.5 text-[9px] text-teal-500">היום</span>}
                  </button>
                );
              })}
            </div>
          )}

          {/* Content */}
          {isWeekly && currentDay ? (
            <DayView
              day={currentDay}
              dayIndex={selectedDay}
              planId={plan.id}
              onRefresh={handleRefresh}
              onDayChanged={(idx) => {
                const maxIdx = (plan.weekly_days?.length || 1) - 1;
                setSelectedDay(Math.min(Math.max(0, idx), maxIdx));
              }}
              onEditSuccess={handleEditSuccess}
              highlightedMeals={highlightedMeals}
            />
          ) : (
            <>
              <MacroWheels
                calories={plan.total_calories || 0}
                protein={plan.total_protein || 0}
                carbs={plan.total_carbs || 0}
                fat={plan.total_fat || 0}
                title="ערכים תזונתיים יומיים"
              />

              {plan.ai_notes && (
                <div className="bg-gradient-to-r from-teal-50 to-blue-50 rounded-2xl p-4 border border-teal-100">
                  <div className="flex items-start gap-2">
                    <span className="text-xl">🤖</span>
                    <div>
                      <p className="text-xs font-bold text-teal-700 mb-1">המלצות מה-AI</p>
                      <p className="text-sm text-slate-700 leading-relaxed">{plan.ai_notes}</p>
                    </div>
                  </div>
                </div>
              )}

              <div className="space-y-3">
                {plan.meals?.map((meal, idx) => (
                  <MealCard
                    key={idx}
                    meal={meal}
                    mealIndex={idx}
                    planId={plan.id}
                    onMealUpdated={handleRefresh}
                    isRecentlyChanged={
                      highlightedMeals?.dayIndex === 0 &&
                      (highlightedMeals?.mealIndexes?.includes(idx) ?? false)
                    }
                  />
                ))}
              </div>

              <MealFeedbackChat
                planId={plan.id}
                dayIndex={0}
                onPlanUpdated={handleRefresh}
                onDayChanged={null}
                onEditSuccess={handleEditSuccess}
              />
            </>
          )}

          {/* Rebuild button */}
          <button
            onClick={() => navigate('/MealPlanWizard')}
            className="w-full py-3.5 rounded-2xl border-2 border-teal-300 text-teal-600 font-semibold text-sm flex items-center justify-center gap-2 hover:bg-teal-50 transition-all"
          >
            <RefreshCw className="w-4 h-4" />
            בנה תפריט חדש
          </button>
        </div>
      </div>
    </div>
  );
}
