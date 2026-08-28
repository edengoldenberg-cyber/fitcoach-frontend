import React, { useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Search, Users, UserPlus, Trash2, CheckSquare, Square, X,
  Utensils, Droplets, Dumbbell, Scale, MessageSquare,
  Target, TrendingUp, Sparkles, Send, Plus, Settings, ChevronLeft,
  BookOpen, Calendar, Brain, Bell, BellOff, Eye, RotateCcw, UserX, Lock, ArrowRight,
  BarChart2,
} from "lucide-react";
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import { toast } from 'sonner';
import { format, startOfWeek, endOfWeek, eachDayOfInterval } from 'date-fns';
import { he } from 'date-fns/locale/he';
import { getIsraelDateString, nutritionRecordMatchesTrainee, metricRecordMatchesTrainee, invalidateCoachTraineeSyncQueries, localDateInRange } from '@/utils/nutritionSync';
import { BarChart, Bar, Cell, XAxis, YAxis, ResponsiveContainer, LineChart, Line } from 'recharts';
import SendLoginLinkButton from '../components/coach/SendLoginLinkButton';
import ChatWithTrainee from '../components/coach/ChatWithTrainee';
import CoachAIAssistant from '../components/coach/CoachAIAssistant';
import CoachMetricsView from '../components/coach/CoachMetricsView';
import WorkoutPerformanceAnalyzer from '../components/coach/WorkoutPerformanceAnalyzer';
import ResendInviteDialog from '../components/coach/ResendInviteDialog';
import TraineeNotificationsTab from '../components/coach/TraineeNotificationsTab';
import TraineeLearningInsights from '../components/coach/TraineeLearningInsights';
import TraineeActionableSummary from '../components/coach/TraineeActionableSummary';
import QuickAlertModal from '../components/coach/QuickAlertModal';
import TraineePersonalDetailsDialog from '../components/coach/TraineePersonalDetailsDialog';
import TraineePanelVisibilityDialog from '../components/coach/TraineePanelVisibilityDialog';
import SetTraineePasswordDialog from '../components/coach/SetTraineePasswordDialog';

// ─── TraineePushStatusCard ──────────────────────────────────────────────────
// Shows a trainee's push subscription state to the coach (read-only, no secrets).
// Used in the Notifications tab of TraineeDetail.

function TraineePushStatusCard({ traineeEmail, traineeName }) {
  const { data, isLoading } = useQuery({
    queryKey: ['traineePushStatus', traineeEmail],
    queryFn:  () => base44.functions.invoke('getTraineePushStatus', { trainee_email: traineeEmail })
      .then(r => r?.result ?? r),
    enabled:   !!traineeEmail,
    staleTime: 60_000,
  });

  if (isLoading) {
    return (
      <Card className="p-3 border border-slate-100">
        <div className="flex items-center gap-2 text-sm text-slate-400 animate-pulse">
          <Bell className="w-4 h-4" />
          <span>טוען סטטוס התראות...</span>
        </div>
      </Card>
    );
  }

  const hasPush = data?.has_active_push;
  const sysOn   = data?.push_system_enabled !== false;
  const devs    = data?.devices || [];

  if (!sysOn) {
    return (
      <Card className="p-3 border border-slate-200">
        <div className="flex items-center gap-2 text-sm text-slate-500">
          <BellOff className="w-4 h-4 text-slate-400" />
          <span>Push לא מוגדר בשרת</span>
        </div>
      </Card>
    );
  }

  if (hasPush) {
    const deviceLabel = devs.length > 1
      ? `${devs.length} מכשירים`
      : devs[0]?.device_type === 'android' ? 'Android'
      : devs[0]?.device_type === 'ios'     ? 'iOS'
      : devs[0]?.device_type === 'desktop'  ? 'מחשב'
      : 'מכשיר';

    return (
      <Card className="p-3 border border-emerald-100 bg-emerald-50">
        <div className="flex items-center gap-2 text-sm text-emerald-800">
          <span className="text-base">🟢</span>
          <div>
            <span className="font-medium">Push פעיל</span>
            <span className="text-xs text-emerald-600 mr-2">{deviceLabel} רשום</span>
          </div>
        </div>
        <p className="text-xs text-emerald-600 mt-1">
          לחץ על פעמון כדי לשלוח התראת בזק ל-{traineeName}
        </p>
      </Card>
    );
  }

  return (
    <Card className="p-3 border border-amber-100 bg-amber-50">
      <div className="flex items-center gap-2 text-sm text-amber-800">
        <span className="text-base">🟠</span>
        <span className="font-medium">אין מכשיר רשום</span>
      </div>
      <p className="text-xs text-amber-600 mt-1">
        {traineeName} צריך לפתוח את האפליקציה ולהפעיל התראות Push בהגדרות ← אוטומציות
      </p>
    </Card>
  );
}

// ─── helpers ───────────────────────────────────────────────────────────────
// Accepts today_status.overall_badge strings from the backend.
function getStatusBadge(badge) {
  if (badge === 'on_track')       return { label: 'מצוין',         cls: 'bg-emerald-100 text-emerald-700' };
  if (badge === 'partial')        return { label: 'חלקי',           cls: 'bg-amber-100  text-amber-700'   };
  if (badge === 'behind')         return { label: 'בפיגור',         cls: 'bg-red-100    text-red-700'     };
  if (badge === 'no_data')        return { label: 'לא תועד',        cls: 'bg-slate-100  text-slate-500'   };
  if (badge === 'no_target')      return { label: 'אין יעד',        cls: 'bg-slate-100  text-slate-400'   };
  if (badge === 'not_applicable') return { label: 'לא רלוונטי',     cls: 'bg-slate-100  text-slate-400'   };
  // neutral or undefined (loading, early morning)
  return { label: 'מוקדם', cls: 'bg-slate-100 text-slate-400' };
}

// ─── MiniCard (in list) ─────────────────────────────────────────────────────
const DAY_LABELS_SHORT = { sunday: 'א', monday: 'ב', tuesday: 'ג', wednesday: 'ד', thursday: 'ה', friday: 'ו', saturday: 'ש' };

// ─── Recent Changes — compact inline block ────────────────────────────────────
// Derives up to 3 meaningful change signals from summary fields.
// Never fabricates: every signal is guarded by data availability checks.
function buildRecentChanges(summary, todayStats) {
  if (!summary) return [];
  const items = [];

  const dsMeal    = summary.days_since_last_meal;
  const dsWorkout = summary.days_since_last_workout;
  const thisWk    = summary.this_week;
  const prevWk    = summary.prev_week;
  const trends    = summary.trends;

  // 1. Days without nutrition logging (≥ 3 days — already an at-risk trigger)
  if (dsMeal !== null && dsMeal !== undefined && dsMeal >= 3) {
    items.push({
      key:   'no_meal',
      icon:  '🥗',
      text:  `${dsMeal} ימים ללא דיווח תזונה`,
      color: dsMeal >= 5 ? 'text-red-600' : 'text-amber-600',
    });
  }

  // 2. Days without workout (≥ 7 days — only if workout is tracked for this trainee)
  if (dsWorkout !== null && dsWorkout !== undefined && dsWorkout >= 7) {
    items.push({
      key:   'no_workout',
      icon:  '🏋️',
      text:  `${dsWorkout} ימים ללא אימון`,
      color: 'text-amber-600',
    });
  }

  // 3. Workout count vs last week (only when both weeks have data)
  if (prevWk && thisWk && thisWk.workouts_completed !== null && prevWk.workouts_completed !== null) {
    const diff = thisWk.workouts_completed - prevWk.workouts_completed;
    if (diff <= -1) {
      items.push({
        key:   'workout_down',
        icon:  '📉',
        text:  `↓ ${Math.abs(diff)} אימון${Math.abs(diff) > 1 ? 'ים' : ''} לעומת שבוע שעבר`,
        color: 'text-amber-600',
      });
    } else if (diff >= 1) {
      items.push({
        key:   'workout_up',
        icon:  '📈',
        text:  `↑ ${diff} אימון${diff > 1 ? 'ים' : ''} לעומת שבוע שעבר`,
        color: 'text-emerald-600',
      });
    }
  }

  // 4. Nutrition reporting decline (score-based, only when sufficient history)
  if (trends?.has_sufficient_history && trends?.reporting?.direction === 'down') {
    const delta = Math.abs(trends.reporting.delta ?? 0);
    if (delta >= 5 && !items.some(i => i.key === 'no_meal')) {
      items.push({
        key:   'reporting_down',
        icon:  '📉',
        text:  'ירידה בהתמדת דיווח',
        color: 'text-amber-600',
      });
    }
  }

  // 5. Nutrition reporting improvement
  if (trends?.has_sufficient_history && trends?.reporting?.direction === 'up') {
    const delta = trends.reporting.delta ?? 0;
    if (delta >= 10 && items.length < 2) {
      items.push({
        key:   'reporting_up',
        icon:  '🌟',
        text:  'שיפור בהתמדת דיווח',
        color: 'text-emerald-600',
      });
    }
  }

  // Return at most 3 signals, prioritising negative signals first (they already come first)
  return items.slice(0, 3);
}

function TraineeMiniCard({ trainee, todayStats, weekStats, summary, selected, selectMode, onSelect, onDelete, onClick, notifStatus, coachEmail, firstMealDate, meals = [], workouts = [] }) {
  const initials = trainee.full_name?.split(' ').map(n => n[0]).join('') || '?';
  // Badge comes from backend today_status — time-aware, no invented defaults
  const badge = getStatusBadge(todayStats?.overallBadge);
  const remindersOn = notifStatus?.remindersOn ?? true;
  const mutedDays = notifStatus?.mutedDays || [];
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [alertOpen, setAlertOpen] = useState(false);
  const queryClient = useQueryClient();

  const resetOnboardingMutation = useMutation({
    mutationFn: async () => {
      await base44.entities.Trainee.update(trainee.id, {
        onboarding_status: 'pending',
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['trainees'] });
    },
  });

  // Calculate days until next weigh-in
  let daysUntilWeighIn = null;
  if (firstMealDate) {
    const first = new Date(firstMealDate);
    const now = new Date();
    const daysSinceFirst = (now - first) / (1000 * 60 * 60 * 24);
    const weeksElapsed = Math.floor(daysSinceFirst / 7);
    const nextWeighInWeek = (weeksElapsed + 1) * 3; // next cycle (3, 6, 9...)
    const nextWeighInDate = new Date(first.getTime() + nextWeighInWeek * 7 * 24 * 60 * 60 * 1000);
    daysUntilWeighIn = Math.ceil((nextWeighInDate - now) / (1000 * 60 * 60 * 24));
  }

  const handleSendWelcome = async (e) => {
    e.stopPropagation();
    if (!trainee.phone) { toast.error('אין מספר טלפון למתאמן'); return; }
    setSending(true);
    try {
      await base44.functions.invoke('onTraineeCreated', {
        event: { type: 'create' },
        data: trainee,
        entity_id: trainee.id,
      });
      setSent(true);
      toast.success(`הודעת פתיחה נשלחה ל-${trainee.full_name}`);
      setTimeout(() => setSent(false), 5000);
    } catch (err) {
      toast.error('שגיאה בשליחת ההודעה');
    }
    setSending(false);
  };

  return (
    <Card className={`border transition-all cursor-pointer ${selected ? 'border-red-400 bg-red-50' : 'border-slate-200 bg-white hover:border-teal-300'}`}>
      <div className="flex items-center gap-3 p-3" onClick={selectMode ? onSelect : onClick}>
        {selectMode && (
          <button onClick={e => { e.stopPropagation(); onSelect(); }} className="flex-shrink-0 p-1 min-h-0 min-w-0">
            {selected ? <CheckSquare className="w-5 h-5 text-red-500" /> : <Square className="w-5 h-5 text-slate-300" />}
          </button>
        )}
        <Avatar className="w-11 h-11 border-2 border-slate-100 flex-shrink-0">
          <AvatarImage src={trainee.profile_image} />
          <AvatarFallback className="bg-gradient-to-br from-emerald-400 to-blue-500 text-white font-bold text-sm">{initials}</AvatarFallback>
        </Avatar>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-0.5">
            <span className="font-bold text-slate-800 truncate text-sm">{trainee.full_name}</span>
            <Badge className={`${badge.cls} text-[10px] px-1.5 py-0`}>{badge.label}</Badge>
            {daysUntilWeighIn !== null && (
              <Badge className={`text-[10px] px-1.5 py-0 ${daysUntilWeighIn <= 2 ? 'bg-red-100 text-red-700' : daysUntilWeighIn <= 7 ? 'bg-amber-100 text-amber-700' : 'bg-slate-100 text-slate-600'}`}>
                ⚖️ {daysUntilWeighIn} ימים
              </Badge>
            )}
            {/* Bell — opens Quick Alert modal for this trainee */}
            <button
              onClick={e => { e.stopPropagation(); setAlertOpen(true); }}
              title="שלח התראת בזק"
              className="min-h-0 min-w-0 p-0.5 rounded hover:bg-slate-100 transition-colors"
            >
              {!remindersOn ? (
                <span className="flex items-center gap-0.5 text-[10px] text-red-400 font-medium">
                  <BellOff className="w-3 h-3" />כבוי
                </span>
              ) : mutedDays.length > 0 ? (
                <span title={`מושתק: ${mutedDays.map(d => DAY_LABELS_SHORT[d]).join(',')}`}
                  className="flex items-center gap-0.5 text-[10px] text-amber-500 font-medium">
                  <BellOff className="w-3 h-3" />{mutedDays.map(d => DAY_LABELS_SHORT[d]).join(',')}
                </span>
              ) : (
                <Bell className="w-3 h-3 text-teal-400 hover:text-teal-600" />
              )}
            </button>
          </div>
          {/* Actionable summary — surfaces backend action_item tier (deterministic, no AI) */}
          {summary?.action_item && !selectMode && (
            <TraineeActionableSummary actionItem={summary.action_item} />
          )}
          {/* Dual activity indicators — nutrition (🥗) and workout (🏋️) shown independently */}
          <div className="flex items-center gap-3 text-[11px] mt-1.5">
            {/* Nutrition activity */}
            <span className="flex items-center gap-1">
              <Utensils className={`w-3 h-3 flex-shrink-0 ${todayStats?.nutritionLogged ? 'text-emerald-500' : 'text-slate-300'}`} />
              {todayStats?.nutritionLogged ? (
                <span className="text-emerald-600 font-medium">היום</span>
              ) : summary?.days_since_last_meal !== undefined ? (
                <span className={activityColor(summary?.days_since_last_meal, true)}>
                  {formatDaysSince(summary?.days_since_last_meal) ?? 'לא ידוע'}
                </span>
              ) : (
                <span className="text-slate-300">—</span>
              )}
            </span>
            {/* Workout activity */}
            <span className="flex items-center gap-1">
              <Dumbbell className={`w-3 h-3 flex-shrink-0 ${todayStats?.workoutDone ? 'text-orange-500' : 'text-slate-300'}`} />
              {todayStats?.workoutDone ? (
                <span className="text-orange-500 font-medium">היום</span>
              ) : summary?.days_since_last_workout !== undefined ? (
                <span className={activityColor(summary?.days_since_last_workout, false)}>
                  {formatDaysSince(summary?.days_since_last_workout) ?? 'לא ידוע'}
                </span>
              ) : (
                <span className="text-slate-300">—</span>
              )}
            </span>
            {/* Attention flag */}
            {summary?.at_risk && (
              <span className="text-amber-500 text-[10px] font-medium mr-auto">
                ⚠️ {summary.at_risk_reasons?.includes('no_report_3_days') ? 'תזונה' : summary.at_risk_reasons?.[0] || 'תשומת לב'}
              </span>
            )}
          </div>
        </div>
        {!selectMode && <ChevronLeft className="w-4 h-4 text-slate-300 flex-shrink-0" />}
      </div>
      {!selectMode && (
        <div className="px-3 pb-3 space-y-3" onClick={e => e.stopPropagation()}>
          <TraineeLearningInsights trainee={trainee} meals={meals} workouts={workouts} />

          {/* Recent Changes — up to 3 data-backed signals, hidden when nothing meaningful */}
          {(() => {
            const changes = buildRecentChanges(summary, todayStats);
            if (changes.length === 0) return null;
            return (
              <div className="bg-slate-50 border border-slate-200 rounded-xl px-3 py-2">
                <p className="text-[10px] font-semibold text-slate-500 mb-1.5 uppercase tracking-wide">שינויים אחרונים</p>
                <div className="space-y-1">
                  {changes.map(c => (
                    <div key={c.key} className={`flex items-center gap-1.5 text-[11px] font-medium ${c.color}`}>
                      <span>{c.icon}</span>
                      <span>{c.text}</span>
                    </div>
                  ))}
                </div>
              </div>
            );
          })()}

          <div className="flex gap-2 items-center">
            <div className="flex-1">
              <SendLoginLinkButton trainee={trainee} variant="outline" size="sm" showStatus={true} />
            </div>
            <button
              onClick={handleSendWelcome}
              disabled={sending}
              title="שלח הודעת פתיחה בוואטסאפ"
              className={`min-h-0 min-w-0 p-2 rounded-lg transition-colors flex items-center gap-1 text-xs font-medium border
                ${sent ? 'bg-green-50 text-green-600 border-green-200' : 'bg-green-50 text-green-700 border-green-200 hover:bg-green-100'}`}>
              {sending ? (
                <span className="w-4 h-4 border-2 border-green-400 border-t-transparent rounded-full animate-spin inline-block" />
              ) : sent ? (
                <span>✓</span>
              ) : (
                <Send className="w-3.5 h-3.5" />
              )}
              {!sending && <span>{sent ? 'נשלח' : 'פתיחה'}</span>}
            </button>
            <button
              onClick={e => { 
                e.stopPropagation(); 
                resetOnboardingMutation.mutate();
              }}
              className="min-h-0 min-w-0 p-2 rounded-lg text-slate-400 hover:text-blue-500 hover:bg-blue-50 transition-colors"
              title="התחל הדרכה מחדש"
              disabled={resetOnboardingMutation.isPending}
            >
              <BookOpen className="w-4 h-4" />
            </button>
            {onDelete && (
              <button onClick={e => { e.stopPropagation(); onDelete(trainee.id); }}
                className="min-h-0 min-w-0 p-2 rounded-lg text-slate-400 hover:text-red-500 hover:bg-red-50 transition-colors" title="מחק מתאמן">
                <Trash2 className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>
      )}
      {/* Quick Alert modal — rendered outside the Card click-zone */}
      <QuickAlertModal
        open={alertOpen}
        onClose={() => setAlertOpen(false)}
        trainee={trainee}
        summary={summary}
      />
    </Card>
  );
}

// ─── TraineeDetail (full panel) ─────────────────────────────────────────────
function TraineeDetail({ trainee, onBack, currentUser }) {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [showTargets, setShowTargets] = useState(false);
  const [showNote, setShowNote] = useState(false);
  const [showChat, setShowChat] = useState(false);
  const [showAI, setShowAI] = useState(false);
  const [showResend, setShowResend] = useState(false);
  const [showPersonalDetails, setShowPersonalDetails] = useState(false);
  const [showPanelVisibility, setShowPanelVisibility] = useState(false);
  const [showSetPassword, setShowSetPassword] = useState(false);
  const [targets, setTargets] = useState({});
  const [newNote, setNewNote] = useState('');

  const email = trainee.user_email;
  const today = getIsraelDateString();
  const weekStart = startOfWeek(new Date(), { weekStartsOn: 0 });
  const weekEnd = endOfWeek(new Date(), { weekStartsOn: 0 });
  const weekDays = eachDayOfInterval({ start: weekStart, end: weekEnd });

  const { data: meals = [] } = useQuery({
    queryKey: ['tm-meals', trainee.id],
    queryFn: () => base44.entities.MealEntry.filter({ trainee_email: email }, '-created_date', 500),
    enabled: !!email,
  });
  const { data: water = [] } = useQuery({
    queryKey: ['tm-water', trainee.id],
    queryFn: () => base44.entities.WaterEntry.filter({ trainee_email: email }, '-created_date', 500),
    enabled: !!email,
  });
  const { data: workouts = [] } = useQuery({
    queryKey: ['tm-workouts', email],
    queryFn: () => base44.entities.WorkoutSession.filter({ trainee_email: email }),
    enabled: !!email,
  });
  const { data: measurements = [] } = useQuery({
    queryKey: ['tm-measurements', trainee.id],
    queryFn: () => base44.entities.MetricsEntry.filter({ trainee_email: email }, '-date', 100),
    enabled: !!email,
  });
  const { data: notes = [] } = useQuery({
    queryKey: ['tm-notes', email],
    queryFn: () => base44.entities.CoachNote.filter({ trainee_email: email }),
    enabled: !!email,
  });
  const { data: aiConsultations = [] } = useQuery({
    queryKey: ['tm-ai', email],
    queryFn: () => base44.entities.AIConsultation.filter({ trainee_email: email }),
    enabled: !!email,
  });
  const { data: mealPlan } = useQuery({
    queryKey: ['tm-mealplan', trainee.id],
    queryFn: async () => {
      const plans = await base44.entities.PersonalMealPlan.filter({ trainee_id: trainee.id, is_active: true });
      return plans[0] || null;
    },
    enabled: !!trainee.id,
  });

  const updateMutation = useMutation({
    mutationFn: (data) => base44.entities.Trainee.update(trainee.id, data),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['trainees'] }); invalidateCoachTraineeSyncQueries(queryClient); setShowTargets(false); },
  });
  const addNoteMutation = useMutation({
    mutationFn: (data) => base44.entities.CoachNote.create(data),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['tm-notes'] }); setShowNote(false); setNewNote(''); toast.success('הערה נשמרה'); },
  });

  const todayCalories = meals.filter(m => m.date === today && m.trainee_email === email).reduce((s, m) => s + (m.calories || 0), 0);
  const todayWater = water.filter(w => w.date === today && w.trainee_email === email).reduce((s, w) => s + (w.amount_ml || 0), 0);
  const todayWorkout = workouts.some(w => w.date === today);
  const lastWeight = measurements.sort((a, b) => new Date(b.date) - new Date(a.date))[0]?.weight_kg;

  const weeklyCaloriesData = weekDays.map(day => {
    const d = getIsraelDateString(day);
    // Filter by trainee email: the coach's ownership filter may return all trainees' data
    const dayMeals = meals.filter(m => m.date === d && m.trainee_email === email);
    return {
      day: format(day, 'EEE', { locale: he }),
      calories: dayMeals.reduce((s, m) => s + (m.calories || 0), 0),
      target: trainee.target_calories || 2000,
    };
  });
  const weeklyWaterData = weekDays.map(day => {
    const d = getIsraelDateString(day);
    const dayWater = water.filter(w => w.date === d && w.trainee_email === email);
    return {
      day: format(day, 'EEE', { locale: he }),
      water: dayWater.reduce((s, w) => s + (w.amount_ml || 0), 0),
      target: trainee.water_target_ml || 3000,
    };
  });
  const weightData = [...measurements]
    .sort((a, b) => String(a.date).localeCompare(String(b.date)))
    .slice(-14)
    .map(m => ({ date: m.date?.slice(5)?.replace('-', '/'), weight: m.weight_kg }));

  const initials = trainee.full_name?.split(' ').map(n => n[0]).join('') || '?';

  return (
    <div className="min-h-screen bg-slate-50 pb-24" dir="rtl">
      {/* Header */}
      <div className="bg-white border-b sticky top-0 z-10 shadow-sm px-4 py-3">
        <div className="flex items-center gap-3">
          <button onClick={onBack} className="p-2 rounded-full hover:bg-slate-100 min-h-0 min-w-0">
            <ArrowRight className="w-5 h-5 text-slate-600" />
          </button>
          <Avatar className="w-10 h-10 border-2 border-white shadow flex-shrink-0">
            <AvatarImage src={trainee.profile_image} />
            <AvatarFallback className="bg-gradient-to-br from-emerald-400 to-blue-500 text-white font-bold text-sm">{initials}</AvatarFallback>
          </Avatar>
          <div className="flex-1 min-w-0">
            <h2 className="font-bold text-slate-800 text-base truncate">{trainee.full_name}</h2>
            <p className="text-xs text-slate-500 truncate">{trainee.user_email}</p>
          </div>
          <div className="flex gap-1.5 overflow-x-auto flex-nowrap">
            <Button size="sm" onClick={() => setShowAI(true)}
              className="gap-1 text-white text-xs h-8 px-2.5 flex-shrink-0" style={{ backgroundColor: '#79DBD6' }}>
              <Sparkles className="w-3.5 h-3.5" />AI
            </Button>
            <Button size="sm" variant="outline" onClick={() => setShowChat(true)} className="h-8 px-2.5 gap-1 text-xs flex-shrink-0">
              <MessageSquare className="w-3.5 h-3.5" />צ׳אט
            </Button>
            {trainee.phone && (
              <Button size="sm" variant="outline"
                onClick={() => window.open(`https://wa.me/${trainee.phone.replace(/\D/g,'')}?text=${encodeURIComponent(`שלום ${trainee.full_name} 💪`)}`, '_blank')}
                className="h-8 px-2.5 bg-[#25D366] text-white border-0 hover:bg-[#20BA5A] text-xs gap-1 flex-shrink-0">
                <Send className="w-3.5 h-3.5" />WA
              </Button>
            )}
            <Button size="sm" variant="outline" onClick={() => setShowPersonalDetails(true)} className="h-8 px-2.5 gap-1 text-xs flex-shrink-0">
              <Settings className="w-3.5 h-3.5" />ערוך
            </Button>
          </div>
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-4 py-4 space-y-4">
        {/* Today Stats */}
        <div className="grid grid-cols-4 gap-2">
          <Card className="p-3 bg-emerald-50 border-emerald-100 text-center">
            <Utensils className="w-4 h-4 text-emerald-500 mx-auto mb-1" />
            <p className="text-base font-bold text-emerald-700">{todayCalories}</p>
            <p className="text-[10px] text-emerald-600">/{trainee.target_calories || 2000} קל׳</p>
          </Card>
          <Card className="p-3 bg-blue-50 border-blue-100 text-center">
            <Droplets className="w-4 h-4 text-blue-500 mx-auto mb-1" />
            <p className="text-base font-bold text-blue-700">{(todayWater / 1000).toFixed(1)}L</p>
            <p className="text-[10px] text-blue-600">/{(trainee.water_target_ml || 3000) / 1000}L</p>
          </Card>
          <Card className="p-3 bg-orange-50 border-orange-100 text-center">
            <Dumbbell className="w-4 h-4 text-orange-500 mx-auto mb-1" />
            <p className="text-base font-bold text-orange-700">{todayWorkout ? '✓' : '✗'}</p>
            <p className="text-[10px] text-orange-600">אימון</p>
          </Card>
          <Card className="p-3 bg-purple-50 border-purple-100 text-center">
            <Scale className="w-4 h-4 text-purple-500 mx-auto mb-1" />
            <p className="text-base font-bold text-purple-700">{lastWeight || '—'}</p>
            <p className="text-[10px] text-purple-600">ק״ג</p>
          </Card>
        </div>

        {/* Quick actions */}
        <div className="flex flex-wrap gap-2">
          <Button size="sm" className="text-xs h-8 gap-1 text-white flex-shrink-0"
            style={{ backgroundColor: '#0d9488' }}
            onClick={() => navigate(`${createPageUrl('TraineeAnalytics')}?id=${trainee.id}&email=${encodeURIComponent(email)}`)}>
            <BarChart2 className="w-3.5 h-3.5" />פתח דשבורד ניתוח מלא
          </Button>
          <Button size="sm" variant="outline" className="text-xs h-8 gap-1"
            onClick={() => setShowPanelVisibility(true)}>
            <Eye className="w-3.5 h-3.5" />פאנלים
          </Button>
          <Button size="sm" variant="outline" className="text-xs h-8 gap-1"
            onClick={() => { setTargets({ target_calories: trainee.target_calories || 2000, target_protein: trainee.target_protein || 150, target_carbs: trainee.target_carbs || 200, target_fat: trainee.target_fat || 70, water_target_ml: trainee.water_target_ml || 3000 }); setShowTargets(true); }}>
            <Target className="w-3.5 h-3.5" />יעדים
          </Button>
          <Button size="sm" variant="outline" className="text-xs h-8 gap-1" onClick={() => setShowNote(true)}>
            <Plus className="w-3.5 h-3.5" />הערה
          </Button>
          {!trainee.first_login_at && (
            <Button size="sm" variant="outline" className="text-xs h-8 gap-1 text-blue-600" onClick={() => setShowResend(true)}>
              <Send className="w-3.5 h-3.5" />שלח הזמנה
            </Button>
          )}
          <Button size="sm" variant="outline"
            className="text-xs h-8 gap-1 text-teal-600 border-teal-200 hover:bg-teal-50"
            onClick={() => setShowSetPassword(true)}>
            <Lock className="w-3.5 h-3.5" />הגדר סיסמה / הזמן
          </Button>
          <div className="flex-shrink-0">
            <SendLoginLinkButton trainee={trainee} variant="outline" size="sm" />
          </div>
        </div>

        {/* Main Tabs */}
        <Tabs defaultValue="overview">
          <TabsList className="bg-white border w-full justify-start overflow-x-auto flex-nowrap h-9 mb-1">
            <TabsTrigger value="overview" className="flex-shrink-0 text-xs h-7">סיכום</TabsTrigger>
            <TabsTrigger value="nutrition" className="flex-shrink-0 text-xs h-7">תזונה</TabsTrigger>
            <TabsTrigger value="mealplan" className="flex-shrink-0 text-xs h-7">תפריט</TabsTrigger>
            <TabsTrigger value="workouts" className="flex-shrink-0 text-xs h-7">אימונים</TabsTrigger>
            <TabsTrigger value="metrics" className="flex-shrink-0 text-xs h-7">מדדים</TabsTrigger>
            <TabsTrigger value="ai" className="flex-shrink-0 text-xs h-7">AI</TabsTrigger>
            <TabsTrigger value="notes" className="flex-shrink-0 text-xs h-7">הערות</TabsTrigger>
            <TabsTrigger value="notifications" className="flex-shrink-0 text-xs h-7">🔔 התראות</TabsTrigger>
          </TabsList>

          {/* OVERVIEW */}
          <TabsContent value="overview" className="space-y-3 mt-3">
            <WorkoutPerformanceAnalyzer workouts={workouts} />
            <Card className="p-4 bg-white border-0 shadow-sm">
              <h3 className="font-medium text-slate-700 mb-3 text-sm">קלוריות שבועיות</h3>
              <div className="h-36">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={weeklyCaloriesData}>
                    <XAxis dataKey="day" fontSize={11} />
                    <YAxis hide />
                    <Bar dataKey="calories" radius={[4, 4, 0, 0]}>
                      {weeklyCaloriesData.map((e, i) => (
                        <Cell key={i} fill={e.calories >= e.target * 0.8 ? '#10B981' : e.calories >= e.target * 0.5 ? '#F59E0B' : '#EF4444'} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </Card>
            <Card className="p-4 bg-white border-0 shadow-sm">
              <h3 className="font-medium text-slate-700 mb-3 text-sm">שתיית מים שבועית</h3>
              <div className="h-36">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={weeklyWaterData}>
                    <XAxis dataKey="day" fontSize={11} />
                    <YAxis hide />
                    <Bar dataKey="water" radius={[4, 4, 0, 0]}>
                      {weeklyWaterData.map((e, i) => (
                        <Cell key={i} fill={e.water >= e.target ? '#3B82F6' : e.water >= e.target * 0.5 ? '#93C5FD' : '#DBEAFE'} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </Card>
          </TabsContent>

          {/* NUTRITION */}
          <TabsContent value="nutrition" className="mt-3">
            <Card className="p-4 bg-white border-0 shadow-sm">
              <h3 className="font-medium text-slate-700 mb-3 text-sm">ארוחות אחרונות</h3>
              <div className="space-y-2 max-h-[60vh] overflow-y-auto">
                {meals.length === 0 && <p className="text-center text-slate-400 py-8">אין ארוחות מתועדות</p>}
                {meals.slice(-30).reverse().map(meal => (
                  <div key={meal.id} className="flex justify-between p-3 bg-slate-50 rounded-lg">
                    <div>
                      <p className="font-medium text-slate-700 text-sm">{meal.food_name}</p>
                      <p className="text-xs text-slate-400">{meal.date} | {meal.meal_type}</p>
                      <div className="flex gap-2 text-xs text-slate-500 mt-0.5">
                        {meal.protein > 0 && <span>חל׳ {Math.round(meal.protein)}g</span>}
                        {meal.carbs > 0 && <span>פח׳ {Math.round(meal.carbs)}g</span>}
                        {meal.fat > 0 && <span>שומן {Math.round(meal.fat)}g</span>}
                      </div>
                    </div>
                    <span className="font-bold text-emerald-600 text-sm">{meal.calories} קל׳</span>
                  </div>
                ))}
              </div>
            </Card>
          </TabsContent>

          {/* MEAL PLAN */}
          <TabsContent value="mealplan" className="mt-3 space-y-3">
            {!mealPlan ? (
              <Card className="p-6 text-center border-dashed border-2 border-slate-200">
                <BookOpen className="w-10 h-10 text-slate-300 mx-auto mb-3" />
                <p className="text-slate-500 font-medium mb-1">אין תפריט אישי פעיל</p>
                <p className="text-xs text-slate-400 mb-3">המתאמן עדיין לא בנה תפריט אישי</p>
              </Card>
            ) : (
              <Card className="p-4 bg-white border-0 shadow-sm">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="font-medium text-slate-700 text-sm">תפריט: {mealPlan.plan_name || 'תפריט אישי'}</h3>
                  <Badge className="bg-teal-100 text-teal-700 text-[10px]">{mealPlan.is_weekly ? 'שבועי' : 'יומי'}</Badge>
                </div>
                <div className="grid grid-cols-4 gap-2 mb-3">
                  <div className="text-center p-2 bg-slate-50 rounded-lg">
                    <p className="text-sm font-bold text-slate-800">{Math.round(mealPlan.daily_calories || 0)}</p>
                    <p className="text-[10px] text-slate-500">קל׳</p>
                  </div>
                  <div className="text-center p-2 bg-blue-50 rounded-lg">
                    <p className="text-sm font-bold text-blue-700">{Math.round(mealPlan.daily_protein || 0)}g</p>
                    <p className="text-[10px] text-blue-500">חל׳</p>
                  </div>
                  <div className="text-center p-2 bg-amber-50 rounded-lg">
                    <p className="text-sm font-bold text-amber-700">{Math.round(mealPlan.daily_carbs || 0)}g</p>
                    <p className="text-[10px] text-amber-500">פח׳</p>
                  </div>
                  <div className="text-center p-2 bg-green-50 rounded-lg">
                    <p className="text-sm font-bold text-green-700">{Math.round(mealPlan.daily_fat || 0)}g</p>
                    <p className="text-[10px] text-green-500">שומן</p>
                  </div>
                </div>
                {mealPlan.ai_notes && (
                  <div className="bg-teal-50 rounded-xl p-3 border border-teal-100 mb-3">
                    <p className="text-xs font-bold text-teal-700 mb-1">💡 המלצות AI</p>
                    <p className="text-xs text-slate-700 leading-relaxed">{mealPlan.ai_notes}</p>
                  </div>
                )}
                <div className="space-y-2 max-h-72 overflow-y-auto">
                  {(mealPlan.is_weekly ? mealPlan.weekly_days?.[0]?.meals : mealPlan.meals)?.map((meal, idx) => (
                    <div key={idx} className="p-3 bg-slate-50 rounded-lg">
                      <div className="flex items-center justify-between mb-1">
                        <span className="font-medium text-slate-700 text-sm">{meal.meal_name}</span>
                        <span className="text-xs text-slate-500">{Math.round(meal.meal_calories)} קל׳</span>
                      </div>
                      <div className="flex gap-3 text-xs text-slate-500">
                        <span>חל׳ {Math.round(meal.meal_protein || 0)}g</span>
                        <span>פח׳ {Math.round(meal.meal_carbs || 0)}g</span>
                        <span>שומן {Math.round(meal.meal_fat || 0)}g</span>
                      </div>
                    </div>
                  ))}
                </div>
              </Card>
            )}
          </TabsContent>

          {/* WORKOUTS */}
          <TabsContent value="workouts" className="mt-3">
            <Card className="p-4 bg-white border-0 shadow-sm">
              <h3 className="font-medium text-slate-700 mb-3 text-sm">אימונים אחרונים</h3>
              <div className="space-y-3 max-h-[60vh] overflow-y-auto">
                {workouts.length === 0 && <p className="text-center text-slate-400 py-8">אין אימונים מתועדים</p>}
                {workouts.slice(0, 15).map(w => (
                  <Card key={w.id} className="p-3 bg-slate-50">
                    <div className="flex justify-between items-start mb-1">
                      <p className="font-medium text-slate-700 text-sm">{w.workout_name || 'אימון'}</p>
                      <span className="text-xs text-slate-500">{w.date}</span>
                    </div>
                    {w.exercises?.length > 0 && (
                      <div className="space-y-1.5 mt-2">
                        {w.exercises.slice(0, 3).map((ex, i) => (
                          <div key={i} className="border-r-2 border-teal-300 pr-2">
                            <p className="text-xs font-medium text-slate-600">{ex.exercise_name}</p>
                            {ex.sets?.length > 0 && (
                              <div className="flex flex-wrap gap-1 mt-0.5">
                                {ex.sets?.map((s, si) => (
                                  <span key={si} className="text-[10px] bg-white px-1.5 py-0.5 rounded border border-slate-200">{s.weight}kg×{s.reps}</span>
                                ))}
                              </div>
                            )}
                          </div>
                        ))}
                        {w.exercises.length > 3 && <p className="text-xs text-slate-400">+{w.exercises.length - 3} תרגילים נוספים</p>}
                      </div>
                    )}
                  </Card>
                ))}
              </div>
            </Card>
          </TabsContent>

          {/* METRICS */}
          <TabsContent value="metrics" className="mt-3 space-y-3">
            <CoachMetricsView traineeEmail={email} trainee={trainee} />
            {weightData.length >= 2 && (
              <Card className="p-4 bg-white border-0 shadow-sm">
                <h3 className="font-medium text-slate-700 mb-3 text-sm">גרף משקל</h3>
                <div className="h-40">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={weightData}>
                      <XAxis dataKey="date" fontSize={10} />
                      <YAxis fontSize={10} domain={['auto', 'auto']} />
                      <Line type="monotone" dataKey="weight" stroke="#8B5CF6" strokeWidth={2} dot={{ r: 3 }} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </Card>
            )}
          </TabsContent>

          {/* AI */}
          <TabsContent value="ai" className="mt-3 space-y-3">
            <Card className="p-4 bg-white border-0 shadow-sm">
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-bold text-slate-800 flex items-center gap-2 text-sm">
                  <Brain className="w-4 h-4" style={{ color: '#79DBD6' }} />ייעוצי AI
                </h3>
                <Button size="sm" onClick={() => setShowAI(true)} className="text-white h-8 px-3 text-xs gap-1" style={{ backgroundColor: '#79DBD6' }}>
                  <Sparkles className="w-3.5 h-3.5" />פתח AI
                </Button>
              </div>
              {aiConsultations.length === 0 ? (
                <p className="text-center text-slate-400 py-8 text-sm">המתאמן עדיין לא השתמש ב-AI Coach</p>
              ) : (
                <div className="space-y-3 max-h-[60vh] overflow-y-auto">
                  {aiConsultations.slice(0, 15).map(c => (
                    <Card key={c.id} className="p-3 bg-slate-50">
                      <div className="flex items-center justify-between mb-2">
                        <Badge className={c.topic === 'nutrition' ? 'bg-green-100 text-green-800 text-[10px]' : c.topic === 'training' ? 'bg-blue-100 text-blue-800 text-[10px]' : 'bg-slate-100 text-slate-800 text-[10px]'}>
                          {c.topic === 'nutrition' ? 'תזונה' : c.topic === 'training' ? 'אימון' : 'כללי'}
                        </Badge>
                        <span className="text-xs text-slate-500">{new Date(c.date).toLocaleDateString('he-IL')}</span>
                      </div>
                      <p className="text-xs text-slate-500 mb-0.5">שאלה:</p>
                      <p className="text-sm text-slate-700 mb-2">{c.user_question}</p>
                      <p className="text-xs text-slate-500 mb-0.5">המלצה:</p>
                      <p className="text-sm text-slate-700">{c.ai_recommendation}</p>
                    </Card>
                  ))}
                </div>
              )}
            </Card>
          </TabsContent>

          {/* NOTIFICATIONS */}
          <TabsContent value="notifications" className="space-y-3 mt-3">
            <TraineePushStatusCard traineeEmail={email} traineeName={trainee.full_name} />
            <TraineeNotificationsTab trainee={trainee} />
          </TabsContent>

          {/* NOTES */}
          <TabsContent value="notes" className="mt-3">
            <Card className="p-4 bg-white border-0 shadow-sm">
              <div className="flex justify-between items-center mb-3">
                <h3 className="font-medium text-slate-700 text-sm">הערות מאמן</h3>
                <Button size="sm" onClick={() => setShowNote(true)} className="h-8 text-xs gap-1">
                  <Plus className="w-3.5 h-3.5" />הערה
                </Button>
              </div>
              {notes.length === 0 ? (
                <p className="text-center py-8 text-slate-400 text-sm">אין הערות עדיין</p>
              ) : (
                <div className="space-y-3 max-h-[60vh] overflow-y-auto">
                  {notes.slice().reverse().map(n => (
                    <div key={n.id} className="p-3 bg-amber-50 border border-amber-200 rounded-lg">
                      <p className="text-slate-700 text-sm">{n.note}</p>
                      <p className="text-xs text-slate-400 mt-1">
                        {n.date ? format(new Date(n.date), 'd/M/yyyy') : format(new Date(n.created_date), 'd/M/yyyy')}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </Card>
          </TabsContent>
        </Tabs>
      </div>

      {/* Targets Dialog */}
      <Dialog open={showTargets} onOpenChange={setShowTargets}>
        <DialogContent dir="rtl">
          <DialogHeader><DialogTitle>עריכת יעדים</DialogTitle></DialogHeader>
          <div className="space-y-3">
            {[
              { key: 'target_calories', label: 'קלוריות יומי' },
              { key: 'target_protein', label: 'חלבון (גרם)' },
              { key: 'target_carbs', label: 'פחמימות (גרם)' },
              { key: 'target_fat', label: 'שומן (גרם)' },
              { key: 'water_target_ml', label: 'מים (מ״ל)' },
            ].map(({ key, label }) => (
              <div key={key}>
                <Label className="text-sm">{label}</Label>
                <Input type="number" value={targets[key] || ''} onChange={e => setTargets({ ...targets, [key]: +e.target.value })} />
              </div>
            ))}
            <Button onClick={() => updateMutation.mutate(targets)} className="w-full" style={{ backgroundColor: '#79DBD6' }}>שמור יעדים</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Note Dialog */}
      <Dialog open={showNote} onOpenChange={setShowNote}>
        <DialogContent dir="rtl">
          <DialogHeader><DialogTitle>הוסף הערה</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <Textarea value={newNote} onChange={e => setNewNote(e.target.value)} placeholder="כתוב הערה למתאמן..." rows={4} />
            <Button onClick={() => addNoteMutation.mutate({ trainee_email: email, coach_email: currentUser?.email, note: newNote, date: today })}
              disabled={!newNote.trim()} className="w-full">שמור הערה</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Chat */}
      <ChatWithTrainee open={showChat} onClose={() => setShowChat(false)} traineeEmail={email} traineeName={trainee.full_name} coachEmail={currentUser?.email} />

      {/* AI Assistant */}
      <CoachAIAssistant open={showAI} onClose={() => setShowAI(false)} trainee={trainee} />

      {/* Resend Invite */}
      <ResendInviteDialog open={showResend} onClose={() => setShowResend(false)} trainee={trainee} />

      {/* Personal Details */}
      <TraineePersonalDetailsDialog
        open={showPersonalDetails}
        onClose={() => setShowPersonalDetails(false)}
        trainee={trainee}
        onSaved={() => queryClient.invalidateQueries({ queryKey: ['trainees'] })}
      />

      {/* Panel Visibility */}
      <TraineePanelVisibilityDialog
        open={showPanelVisibility}
        onClose={() => setShowPanelVisibility(false)}
        trainee={trainee}
        onSaved={() => queryClient.invalidateQueries({ queryKey: ['trainees'] })}
      />

      <SetTraineePasswordDialog
        open={showSetPassword}
        onClose={() => setShowSetPassword(false)}
        trainee={trainee}
      />
    </div>
  );
}

// ─── Activity helpers ────────────────────────────────────────────────────────
// Format days-since into compact Hebrew label
function formatDaysSince(days) {
  if (days === null || days === undefined) return null;
  if (days === 0) return 'היום';
  if (days === 1) return 'אתמול';
  return `לפני ${days} ימים`;
}

// Color class based on days since last activity (nutrition: 3d threshold, workout: 7d threshold)
function activityColor(days, nutritionMode) {
  if (days === null || days === undefined) return 'text-slate-300';
  if (days === 0 || days === 1) return 'text-emerald-600';
  const yellowThreshold = nutritionMode ? 2 : 4;
  const redThreshold    = nutritionMode ? 3 : 7;
  if (days <= yellowThreshold) return 'text-amber-500';
  if (days >= redThreshold)    return 'text-red-500';
  return 'text-amber-500';
}

// ─── Main Coach Dashboard ────────────────────────────────────────────────────
export default function CoachDashboard() {
  const location = useLocation();
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('all');
  // activityFilter is independent of the badge filter — it filters by today's activity type
  // or by recency thresholds. null = no activity filter applied.
  const [activityFilter, setActivityFilter] = useState(null);
  const [selectedIds, setSelectedIds] = useState([]);
  const [selectMode, setSelectMode] = useState(false);
  const [selectedTrainee, setSelectedTrainee] = useState(null);
  const today = getIsraelDateString();

  // Close inline trainee panel when "בית" bottom nav is clicked.
  // Primary: custom DOM event (reliable even for same-URL navigation where location.key may not change).
  // Backup: location.state?.closePanel set by Layout via navigate().
  React.useEffect(() => {
    const handler = () => setSelectedTrainee(null);
    window.addEventListener('fitcoach:closePanels', handler);
    return () => window.removeEventListener('fitcoach:closePanels', handler);
  }, []);

  React.useEffect(() => {
    if (location.state?.closePanel) {
      setSelectedTrainee(null);
    }
  }, [location.key]);
  const recentStart = getIsraelDateString(new Date(Date.now() - 6 * 24 * 60 * 60 * 1000));
  const queryClient = useQueryClient();

  const { data: user } = useQuery({
    queryKey: ['currentUser'],
    queryFn: () => base44.auth.me(),
    retry: 3,
    retryDelay: 1000,
    staleTime: 60_000,
  });
  const { data: trainees = [], isLoading } = useQuery({
    queryKey: ['trainees', user?.email],
    queryFn: async () => {
      const records = await base44.entities.Trainee.filter({ coach_email: user?.email });
      return records.filter(t => !['deleted', 'inactive'].includes(t.status));
    },
    enabled: !!user?.email,
    // Preserve the last known trainee list on any refetch failure (network hiccup, token refresh).
    // Without this, a transient 401 or network error clears data to undefined → trainees = [] → shows 0.
    placeholderData: (previousData) => previousData,
    retry: 2,
    staleTime: 30_000,
  });
  // Load ALL trainees for this coach, including deleted/inactive — for restore tab.
  // Uses a coach_email filter instead of global list() to avoid full-table scan.
  const { data: allTraineesIncDeleted = [] } = useQuery({
    queryKey: ['allTraineesDeleted', user?.email],
    queryFn: () => base44.entities.Trainee.filter({
      coach_email: user?.email,
    }, '-updated_date', 100).then(all => all.filter(t => ['deleted', 'inactive'].includes(t.status))),
    enabled: !!user?.email,
  });

  // Derive the list of trainee emails once trainees are loaded.
  // Used as the shared filter for all activity queries below.
  const traineeEmails = trainees.map(t => t.user_email).filter(Boolean);

  // Meals for the recent date range — one parallel query per trainee, then merged.
  // Replaces a single global list(3000) that scanned all coaches' data.
  const { data: allMeals = [] } = useQuery({
    queryKey: ['allMeals', traineeEmails.join(','), recentStart, today],
    queryFn: async () => {
      const perTrainee = await Promise.all(
        traineeEmails.map(email =>
          base44.entities.MealEntry.filter({ trainee_email: email }, '-created_date', 150).catch(() => [])
        )
      );
      return perTrainee.flat().filter(r => localDateInRange(r.date, recentStart, today));
    },
    enabled: traineeEmails.length > 0,
  });

  // First-ever meal per trainee — sort ascending, limit 1 per trainee.
  // Replaces list(2000) that incorrectly sorted descending (would never find the oldest meal).
  const { data: allMealsEver = [] } = useQuery({
    queryKey: ['allMealsEver', traineeEmails.join(',')],
    queryFn: async () => {
      const perTrainee = await Promise.all(
        traineeEmails.map(email =>
          base44.entities.MealEntry.filter({ trainee_email: email }, 'created_date', 1).catch(() => [])
        )
      );
      return perTrainee.flat();
    },
    enabled: traineeEmails.length > 0,
  });

  // Water for the recent date range — one parallel query per trainee.
  // Replaces global list(3000).
  const { data: allWater = [] } = useQuery({
    queryKey: ['allWater', traineeEmails.join(','), recentStart, today],
    queryFn: async () => {
      const perTrainee = await Promise.all(
        traineeEmails.map(email =>
          base44.entities.WaterEntry.filter({ trainee_email: email }, '-created_date', 150).catch(() => [])
        )
      );
      return perTrainee.flat().filter(r => localDateInRange(r.date, recentStart, today));
    },
    enabled: traineeEmails.length > 0,
  });

  React.useEffect(() => {
    const refresh = () => invalidateCoachTraineeSyncQueries(queryClient);
    const unsubMeal = base44.entities.MealEntry.subscribe(refresh);
    const unsubWater = base44.entities.WaterEntry.subscribe(refresh);
    const unsubMetrics = base44.entities.MetricsEntry.subscribe(refresh);
    const unsubTrainee = base44.entities.Trainee.subscribe(refresh);
    return () => { unsubMeal(); unsubWater(); unsubMetrics(); unsubTrainee(); };
  }, [queryClient]);
  // Workouts for the recent date range — one parallel query per trainee.
  // Replaces global list(3000).
  const { data: allWorkouts = [] } = useQuery({
    queryKey: ['allWorkouts', traineeEmails.join(','), recentStart, today],
    queryFn: async () => {
      const perTrainee = await Promise.all(
        traineeEmails.map(email =>
          base44.entities.WorkoutSession.filter({ trainee_email: email }, '-created_date', 50).catch(() => [])
        )
      );
      return perTrainee.flat().filter(r => localDateInRange(r.date, recentStart, today));
    },
    enabled: traineeEmails.length > 0,
  });

  // Notification preferences — filtered by trainee emails rather than global list().
  const { data: allNotifPrefs = [] } = useQuery({
    queryKey: ['allNotifPrefs', traineeEmails.join(',')],
    queryFn: async () => {
      const perTrainee = await Promise.all(
        traineeEmails.map(email =>
          base44.entities.NotificationPreference.filter({ trainee_email: email }).catch(() => [])
        )
      );
      return perTrainee.flat();
    },
    enabled: traineeEmails.length > 0,
  });

  // ── Israel week start (Sunday) — matches backend getWeekBoundaries() exactly ──
  const israelWeekStartStr = useMemo(() => {
    const base = new Date(today + 'T00:00:00Z');
    const dow  = base.getUTCDay(); // 0 = Sunday
    const sun  = new Date(base);
    sun.setUTCDate(base.getUTCDate() - dow);
    return sun.toISOString().slice(0, 10);
  }, [today]);

  // ── Backend weekly summary — authoritative TODAY badge source ──────────────
  // today_status per trainee uses time-aware expected-progress windows and
  // never invents default calorie/water targets. Refetched every 60 s so
  // window transitions (e.g. breakfast → lunch) are reflected automatically.
  const { data: weeklySummary } = useQuery({
    queryKey: ['coachWeeklySummary', user?.email],
    queryFn:  () => base44.functions.invoke('coachWeeklySummary', {}),
    enabled:  !!user?.email,
    staleTime:       60_000,
    refetchInterval: 60_000,
  });

  const summaryByEmail = useMemo(() => {
    const m = {};
    (weeklySummary?.trainees || []).forEach(t => { m[t.trainee_email] = t; });
    return m;
  }, [weeklySummary]);

  // ── TODAY stats — factual display data from local queries + authoritative
  //   overallBadge from backend today_status (time-aware, no invented targets).
  //
  // Contracts:
  //   caloriesLogged = null when no meal logged today (not 0)
  //   waterMl        = null when no water logged today (not 0)
  //   calTarget      = configured target or null (never invented)
  //   overallBadge   = badge string from backend today_status

  const traineeTodayStats = useMemo(() => {
    const s = {};
    trainees.forEach(t => {
      const e = t.user_email;
      const todayMeals   = allMeals.filter(m => nutritionRecordMatchesTrainee(m, t) && m.date === today);
      const todayWater   = allWater.filter(w => nutritionRecordMatchesTrainee(w, t) && w.date === today);
      const todayWorkout = allWorkouts.some(w => w.trainee_email === e && w.date === today);

      const mealCount      = todayMeals.length;
      const caloriesLogged = todayMeals.reduce((sum, m) => sum + (m.calories || 0), 0);
      const proteinLogged  = Math.round(todayMeals.reduce((sum, m) => sum + (m.protein || 0), 0));
      const waterMl        = todayWater.reduce((sum, w) => sum + (w.amount_ml || 0), 0);

      // Respect visible_modules: don't show nutrition data if module is disabled
      const vm = (() => {
        const raw = t.visible_modules;
        if (!raw) return {};
        if (typeof raw === 'object') return raw;
        try { return JSON.parse(raw); } catch { return {}; }
      })();
      const nutritionApplicable = vm.nutrition !== false;
      const waterApplicable     = vm.water     !== false;

      const nutritionLogged = nutritionApplicable && mealCount > 0;
      const waterLogged     = waterApplicable     && todayWater.length > 0;
      // Show configured target; null if not set — no default invention for display
      const calTarget   = nutritionApplicable ? (t.target_calories || null) : null;
      const waterTarget = waterApplicable     ? (t.water_target_ml || null) : null;

      // Badge: from backend today_status (authoritative).
      // Falls back to 'neutral' while the summary is still loading.
      const overallBadge = summaryByEmail[e]?.today_status?.overall_badge ?? 'neutral';

      s[e] = {
        mealCount:       nutritionApplicable ? mealCount : 0,
        caloriesLogged:  nutritionLogged ? caloriesLogged : null,
        proteinLogged:   nutritionLogged ? proteinLogged  : null,
        waterMl:         waterLogged     ? waterMl        : null,
        calTarget,
        waterTarget,
        nutritionLogged,
        waterLogged,
        workoutDone:  todayWorkout,
        overallBadge,
      };
    });
    return s;
  }, [trainees, allMeals, allWater, allWorkouts, today, summaryByEmail]);

  // ── THIS WEEK stats — labeled separately from TODAY; never mixed ───────────
  // Denominator = logged days only (no phantom zero days).
  // Week boundary = Sunday–Saturday Israel calendar (matches backend).

  const traineeWeeklyStats = useMemo(() => {
    const s = {};
    trainees.forEach(t => {
      const e = t.user_email;
      const weekMeals    = allMeals.filter(m => nutritionRecordMatchesTrainee(m, t) && m.date >= israelWeekStartStr);
      const weekWater    = allWater.filter(w => nutritionRecordMatchesTrainee(w, t) && w.date >= israelWeekStartStr);
      const weekWorkouts = allWorkouts.filter(w => w.trainee_email === e && w.date >= israelWeekStartStr);

      const loggedDays   = new Set(weekMeals.map(m => m.date)).size;
      const totalCals    = weekMeals.reduce((sum, m) => sum + (m.calories || 0), 0);
      const totalProtein = Math.round(weekMeals.reduce((sum, m) => sum + (m.protein || 0), 0));
      const totalCarbs   = Math.round(weekMeals.reduce((sum, m) => sum + (m.carbs   || 0), 0));
      const totalFat     = Math.round(weekMeals.reduce((sum, m) => sum + (m.fat     || 0), 0));
      const totalWaterMl = weekWater.reduce((sum, w) => sum + (w.amount_ml || 0), 0);
      const workoutsCompleted = new Set(weekWorkouts.map(w => w.date)).size;

      const weekStartDate = new Date(israelWeekStartStr + 'T00:00:00Z');
      const todayDate     = new Date(today + 'T00:00:00Z');
      const elapsedDays   = Math.max(1, Math.floor((todayDate - weekStartDate) / 86400000) + 1);

      s[e] = {
        loggedDays,
        elapsedDays,
        totalCals,
        totalProtein,
        totalCarbs,
        totalFat,
        totalWaterMl,
        workoutsCompleted,
        // avg per LOGGED day — null when no days logged (not 0)
        avgCalPerLoggedDay: loggedDays > 0 ? Math.round(totalCals / loggedDays) : null,
      };
    });
    return s;
  }, [trainees, allMeals, allWater, allWorkouts, israelWeekStartStr, today]);

  const filteredTrainees = useMemo(() => trainees.filter(t => {
    if (!t.full_name?.toLowerCase().includes(search.toLowerCase())) return false;

    // Badge filter (existing)
    if (filter !== 'all') {
      const badge = traineeTodayStats[t.user_email]?.overallBadge;
      if (filter === 'good')         { if (badge !== 'on_track') return false; }
      else if (filter === 'partial') { if (badge !== 'partial')  return false; }
      else if (filter === 'behind')  { if (badge !== 'behind')   return false; }
      else if (filter === 'not_reported') { if (badge !== 'no_data') return false; }
      // neutral / no_target remain visible under 'all' only
    }

    // Activity filter (new) — operates on today's meals/workouts and recency from summary
    if (activityFilter) {
      const email      = t.user_email;
      const hasMeal    = allMeals.some(m => nutritionRecordMatchesTrainee(m, t) && m.date === today);
      const hasWorkout = allWorkouts.some(w => w.trainee_email === email && w.date === today);
      const summary    = summaryByEmail[email];
      const dsMeal     = summary?.days_since_last_meal;
      const dsWorkout  = summary?.days_since_last_workout;

      if (activityFilter === 'nutrition_today')   return hasMeal && !hasWorkout;   // רק תזונה
      if (activityFilter === 'workout_today')     return !hasMeal && hasWorkout;   // רק אימון
      if (activityFilter === 'both_today')        return hasMeal && hasWorkout;
      if (activityFilter === 'neither_today')     return !hasMeal && !hasWorkout;
      if (activityFilter === 'no_nutrition_3d')   return dsMeal    === null || dsMeal    >= 3;
      if (activityFilter === 'no_workout_7d')     return dsWorkout === null || dsWorkout >= 7;
      if (activityFilter === 'attention')         return summary?.at_risk === true;
    }

    return true;
  }), [trainees, search, filter, activityFilter, traineeTodayStats, allMeals, allWorkouts, today, summaryByEmail]);

  const stats = useMemo(() => {
    // Each counter is independent — no merging of semantically distinct states.
    // on_track + partial + behind + notReported + neutral + noTarget === total
    let onTrack = 0, partial = 0, behind = 0, notReported = 0, neutral = 0, noTarget = 0, notApplicable = 0;
    trainees.forEach(t => {
      const badge = traineeTodayStats[t.user_email]?.overallBadge;
      if      (badge === 'on_track')       onTrack++;
      else if (badge === 'partial')        partial++;
      else if (badge === 'behind')         behind++;
      else if (badge === 'no_data')        notReported++;
      else if (badge === 'neutral')        neutral++;
      else if (badge === 'no_target')      noTarget++;
      else if (badge === 'not_applicable') notApplicable++;
    });
    return { onTrack, partial, behind, notReported, neutral, noTarget, notApplicable, total: trainees.length };
  }, [trainees, traineeTodayStats]);

  // Today-specific activity counts — four MUTUALLY EXCLUSIVE buckets.
  // Every trainee belongs to exactly ONE bucket.
  // Invariant: onlyNutrition + onlyWorkout + bothToday + neitherToday === trainees.length
  const todayActivity = useMemo(() => {
    let onlyNutrition = 0, onlyWorkout = 0, bothToday = 0, neitherToday = 0;
    trainees.forEach(t => {
      const hasMeal    = allMeals.some(m => nutritionRecordMatchesTrainee(m, t) && m.date === today);
      const hasWorkout = allWorkouts.some(w => w.trainee_email === t.user_email && w.date === today);
      if      ( hasMeal && !hasWorkout) onlyNutrition++;
      else if (!hasMeal &&  hasWorkout) onlyWorkout++;
      else if ( hasMeal &&  hasWorkout) bothToday++;
      else                              neitherToday++;
    });
    return { onlyNutrition, onlyWorkout, bothToday, neitherToday };
  }, [trainees, allMeals, allWorkouts, today]);

  const deleteMutation = useMutation({
    // Soft delete: set status: 'deleted' so the Restore tab can recover them
    // and all related MealEntry/WorkoutSession/MetricsEntry records stay intact.
    // Hard entity deletion was replaced here to prevent unrecoverable data loss.
    mutationFn: async (ids) => {
      for (const id of ids) {
        await base44.entities.Trainee.update(id, {
          status: 'deleted',
        });
      }
    },
    onSuccess: (_, ids) => {
      queryClient.invalidateQueries({ queryKey: ['trainees'] });
      queryClient.invalidateQueries({ queryKey: ['allTraineesDeleted'] });
      toast.success(`✅ ${ids.length} מתאמנים נמחקו`);
      setSelectedIds([]); setSelectMode(false);
    },
    onError: () => toast.error('שגיאה במחיקה'),
  });

  const restoreMutation = useMutation({
    mutationFn: async (trainee) => {
      // Clear user binding so they must re-register fresh
      await base44.entities.Trainee.update(trainee.id, {
        status: 'active',
        user_id: null,
        user_email: null,
        invite_status: 'invited',
        first_login_at: null,
        last_login_at: null,
        onboarding_status: 'pending',
      });
    },
    onSuccess: (_, trainee) => {
      queryClient.invalidateQueries({ queryKey: ['trainees'] });
      queryClient.invalidateQueries({ queryKey: ['allTraineesDeleted'] });
      toast.success(`✅ ${trainee.full_name} שוחזר — יש לשלוח לו הזמנה חדשה להרשמה`);
    },
    onError: () => toast.error('שגיאה בשחזור מתאמן'),
  });

  const toggleSelect = id => setSelectedIds(prev => prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]);
  const toggleSelectAll = () => setSelectedIds(selectedIds.length === filteredTrainees.length ? [] : filteredTrainees.map(t => t.id));
  const handleDeleteSelected = () => {
    if (!selectedIds.length) return;
    if (!window.confirm(`למחוק ${selectedIds.length} מתאמנים?`)) return;
    deleteMutation.mutate(selectedIds);
  };
  const handleDeleteOne = id => {
    if (!window.confirm('למחוק מתאמן זה?')) return;
    deleteMutation.mutate([id]);
  };

  React.useEffect(() => {
    if (!selectedTrainee?.id) return;
    const latest = trainees.find(t => t.id === selectedTrainee.id);
    if (latest && latest.updated_date !== selectedTrainee.updated_date) {
      setSelectedTrainee(latest);
    }
  }, [trainees, selectedTrainee?.id, selectedTrainee?.updated_date]);

  // If a trainee is selected — show detail view
  if (selectedTrainee) {
    return <TraineeDetail trainee={selectedTrainee} onBack={() => setSelectedTrainee(null)} currentUser={user} />;
  }

  return (
    <div className="min-h-screen bg-slate-50 pb-24" dir="rtl">
      <div className="max-w-2xl mx-auto px-4 py-5">

        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-2xl font-bold text-slate-800">שלום{user?.full_name ? ` ${user.full_name.split(' ')[0]}` : ''} 👋</h1>
            <p className="text-sm text-slate-500">{stats.total} מתאמנים פעילים</p>
          </div>
          <Link to={createPageUrl('AddTrainee')}>
            <Button size="sm" className="bg-emerald-500 hover:bg-emerald-600 h-9 gap-1.5">
              <UserPlus className="w-4 h-4" />הוסף מתאמן
            </Button>
          </Link>
        </div>

        {/* Quick Actions */}
        <div className="grid grid-cols-4 gap-2 mb-4">
          <Link to={createPageUrl('AddTrainee')} className="block">
            <div className="bg-white border border-slate-200 rounded-xl p-3 text-center hover:border-emerald-300 hover:bg-emerald-50 transition-colors cursor-pointer">
              <UserPlus className="w-5 h-5 text-emerald-500 mx-auto mb-1" />
              <p className="text-[10px] text-slate-600 font-medium">הוסף מתאמן</p>
            </div>
          </Link>
          <Link to={createPageUrl('CoachDailyWorkout')} className="block">
            <div className="bg-white border border-slate-200 rounded-xl p-3 text-center hover:border-orange-300 hover:bg-orange-50 transition-colors cursor-pointer">
              <Dumbbell className="w-5 h-5 text-orange-500 mx-auto mb-1" />
              <p className="text-[10px] text-slate-600 font-medium">אימון יומי</p>
            </div>
          </Link>
          <Link to={createPageUrl('CoachReports')} className="block">
            <div className="bg-white border border-slate-200 rounded-xl p-3 text-center hover:border-blue-300 hover:bg-blue-50 transition-colors cursor-pointer">
              <TrendingUp className="w-5 h-5 text-blue-500 mx-auto mb-1" />
              <p className="text-[10px] text-slate-600 font-medium">דוחות</p>
            </div>
          </Link>
          <Link to="/CoachAsTrainee" className="block">
            <div className="bg-white border border-slate-200 rounded-xl p-3 text-center hover:border-amber-300 hover:bg-amber-50 transition-colors cursor-pointer">
              <Eye className="w-5 h-5 text-amber-500 mx-auto mb-1" />
              <p className="text-[10px] text-slate-600 font-medium">ממשק מתאמן</p>
            </div>
          </Link>
        </div>

        {/* Today Summary — 4 independent activity cards */}
        <Card className="p-4 mb-4 bg-gradient-to-br from-teal-50 to-emerald-50 border-teal-200">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-bold text-teal-800 flex items-center gap-2">
              <Calendar className="w-4 h-4" />
              פעילות היום
            </h2>
            {activityFilter && (
              <button
                onClick={() => setActivityFilter(null)}
                className="text-[10px] text-teal-600 hover:text-teal-800 flex items-center gap-0.5 font-medium"
              >
                <X className="w-3 h-3" /> נקה סינון
              </button>
            )}
          </div>
          <div className="grid grid-cols-4 gap-2">
            {[
              { key: 'nutrition_today', count: todayActivity.onlyNutrition, label: '🥗 רק תזונה',        activeColor: 'border-emerald-400 bg-emerald-50', numColor: 'text-emerald-600', baseColor: 'border-emerald-100 hover:bg-emerald-50' },
              { key: 'workout_today',   count: todayActivity.onlyWorkout,   label: '🏋️ רק אימון',       activeColor: 'border-orange-400  bg-orange-50',  numColor: 'text-orange-500',  baseColor: 'border-orange-100  hover:bg-orange-50'  },
              { key: 'both_today',      count: todayActivity.bothToday,     label: '✅ תזונה + אימון',   activeColor: 'border-blue-400    bg-blue-50',    numColor: 'text-blue-600',    baseColor: 'border-blue-100    hover:bg-blue-50'    },
              { key: 'neither_today',   count: todayActivity.neitherToday,  label: '🔴 ללא פעילות',     activeColor: 'border-red-400     bg-red-50',     numColor: 'text-red-500',     baseColor: 'border-red-100     hover:bg-red-50'     },
            ].map(({ key, count, label, activeColor, numColor, baseColor }) => (
              <div
                key={key}
                className={`bg-white rounded-lg p-2 text-center cursor-pointer transition-colors border-2 ${activityFilter === key ? activeColor : `border ${baseColor}`}`}
                onClick={() => setActivityFilter(activityFilter === key ? null : key)}
                title={activityFilter === key ? 'לחץ לביטול הסינון' : 'לחץ לסינון'}
              >
                <p className={`text-xl font-bold ${numColor}`}>{count}</p>
                <p className="text-[10px] text-slate-600 mt-0.5 leading-tight">{label}</p>
              </div>
            ))}
          </div>
          {/* Quick recency filters */}
          <div className="flex gap-1.5 mt-2.5 flex-wrap">
            {[
              { key: 'no_nutrition_3d', label: '🥗 3+ ימים ללא תזונה' },
              { key: 'no_workout_7d',   label: '🏋️ 7+ ימים ללא אימון' },
              { key: 'attention',       label: '⚠️ דורש תשומת לב' },
            ].map(({ key, label }) => (
              <button
                key={key}
                onClick={() => setActivityFilter(activityFilter === key ? null : key)}
                className={`text-[10px] px-2 py-1 rounded-full border transition-colors font-medium ${
                  activityFilter === key
                    ? 'bg-slate-700 text-white border-slate-700'
                    : 'bg-white text-slate-600 border-slate-200 hover:border-slate-400'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </Card>

        {/* TODAY Status Counters — 5 independent buckets, never merging behind + no_data */}
        <div className="grid grid-cols-5 gap-1.5 mb-4">
          <Card className="p-2 text-center bg-white shadow-sm border-slate-100 cursor-pointer hover:border-slate-300" onClick={() => setFilter('all')}>
            <p className="text-lg font-bold text-slate-800">{stats.total}</p>
            <p className="text-[9px] text-slate-500 mt-0.5">סה״כ</p>
          </Card>
          <Card className="p-2 text-center bg-emerald-50 border-emerald-100 cursor-pointer hover:border-emerald-300" onClick={() => setFilter('good')}>
            <p className="text-lg font-bold text-emerald-700">{stats.onTrack}</p>
            <p className="text-[9px] text-emerald-600 mt-0.5">מצוין</p>
          </Card>
          <Card className="p-2 text-center bg-amber-50 border-amber-100 cursor-pointer hover:border-amber-300" onClick={() => setFilter('partial')}>
            <p className="text-lg font-bold text-amber-700">{stats.partial}</p>
            <p className="text-[9px] text-amber-600 mt-0.5">חלקי</p>
          </Card>
          <Card className="p-2 text-center bg-red-50 border-red-100 cursor-pointer hover:border-red-300" onClick={() => setFilter('behind')}>
            <p className="text-lg font-bold text-red-700">{stats.behind}</p>
            <p className="text-[9px] text-red-600 mt-0.5">בפיגור</p>
          </Card>
          <Card className="p-2 text-center bg-slate-50 border-slate-200 cursor-pointer hover:border-slate-400" onClick={() => setFilter('not_reported')}>
            <p className="text-lg font-bold text-slate-600">{stats.notReported}</p>
            <p className="text-[9px] text-slate-500 mt-0.5">לא דיווחו</p>
          </Card>
        </div>

        {/* Search */}
        <div className="relative mb-3">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="חפש מתאמן..." className="pr-10 bg-white h-10" />
        </div>

        {/* Filters + select */}
        <div className="flex items-center justify-between mb-4 gap-2">
          <Tabs value={filter} onValueChange={setFilter} className="flex-1">
            <TabsList className="bg-white border w-full justify-start overflow-x-auto flex-nowrap h-9">
              <TabsTrigger value="all"          className="flex-shrink-0 text-xs h-7">הכל ({stats.total})</TabsTrigger>
              <TabsTrigger value="good"         className="text-emerald-600 flex-shrink-0 text-xs h-7">מצוין ({stats.onTrack})</TabsTrigger>
              <TabsTrigger value="partial"      className="text-amber-600  flex-shrink-0 text-xs h-7">חלקי ({stats.partial})</TabsTrigger>
              <TabsTrigger value="behind"       className="text-red-600    flex-shrink-0 text-xs h-7">בפיגור ({stats.behind})</TabsTrigger>
              <TabsTrigger value="not_reported" className="text-slate-500  flex-shrink-0 text-xs h-7">לא דיווחו ({stats.notReported})</TabsTrigger>
              {allTraineesIncDeleted.length > 0 && (
                <TabsTrigger value="deleted" className="text-slate-500 flex-shrink-0 text-xs h-7">
                  <UserX className="w-3 h-3 ml-1" />מחוקים ({allTraineesIncDeleted.length})
                </TabsTrigger>
              )}
            </TabsList>
          </Tabs>
          <Button variant={selectMode ? 'default' : 'outline'} size="sm"
            onClick={() => { setSelectMode(!selectMode); setSelectedIds([]); }}
            className={`h-9 gap-1.5 flex-shrink-0 text-xs ${selectMode ? 'bg-slate-700' : ''}`}>
            <CheckSquare className="w-3.5 h-3.5" />בחירה
          </Button>
        </div>

        {/* Bulk bar */}
        {selectMode && (
          <div className="flex items-center justify-between bg-slate-800 text-white rounded-xl px-4 py-2.5 mb-4 gap-3">
            <div className="flex items-center gap-3">
              <button onClick={toggleSelectAll} className="flex items-center gap-1.5 text-sm min-h-0 min-w-0">
                {selectedIds.length === filteredTrainees.length
                  ? <CheckSquare className="w-4 h-4 text-teal-300" />
                  : <Square className="w-4 h-4 text-slate-400" />}
                <span className="text-xs">{selectedIds.length === filteredTrainees.length ? 'בטל הכל' : 'בחר הכל'}</span>
              </button>
              <span className="text-xs text-slate-300">{selectedIds.length} נבחרו</span>
            </div>
            <div className="flex gap-2">
              <Button size="sm" variant="ghost" onClick={() => { setSelectMode(false); setSelectedIds([]); }}
                className="h-7 text-slate-300 hover:text-white px-2 min-h-0"><X className="w-3.5 h-3.5" /></Button>
              <Button size="sm" onClick={handleDeleteSelected} disabled={!selectedIds.length || deleteMutation.isPending}
                className="h-7 bg-red-500 hover:bg-red-600 text-white gap-1 text-xs px-3 min-h-0">
                <Trash2 className="w-3.5 h-3.5" />{deleteMutation.isPending ? 'מוחק...' : `מחק (${selectedIds.length})`}
              </Button>
            </div>
          </div>
        )}

        {/* Deleted Trainees Restore Panel */}
        {filter === 'deleted' && (
          <div className="space-y-2 mb-4">
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 mb-3 text-sm text-amber-800">
              ⚠️ מתאמנים אלו לא פעילים. שחזור יאפשר להם להתחבר מחדש. WhatsApp יהיה <strong>כבוי</strong> אחרי שחזור.
            </div>
            {allTraineesIncDeleted.map(t => (
              <Card key={t.id} className="border border-slate-200 bg-slate-50 p-3 flex items-center gap-3">
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-slate-700 text-sm truncate">{t.full_name}</p>
                  <p className="text-xs text-slate-400 truncate">{t.user_email}</p>
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-red-100 text-red-600">{t.status}</span>
                </div>
                <Button
                  size="sm"
                  onClick={() => restoreMutation.mutate(t)}
                  disabled={restoreMutation.isPending}
                  className="gap-1.5 text-xs h-8 bg-emerald-500 hover:bg-emerald-600 text-white flex-shrink-0"
                >
                  <RotateCcw className="w-3.5 h-3.5" />שחזר
                </Button>
              </Card>
            ))}
            {allTraineesIncDeleted.length === 0 && (
              <p className="text-center text-slate-400 py-8 text-sm">אין מתאמנים מחוקים/לא פעילים</p>
            )}
          </div>
        )}

        {/* Active filter indicator */}
        {activityFilter && (
          <div className="flex items-center justify-between bg-slate-800 text-white rounded-xl px-3 py-2 mb-3 text-xs">
            <span>
              {{
                nutrition_today:  '🥗 מסנן: רק תזונה היום',
                workout_today:    '🏋️ מסנן: רק אימון היום',
                both_today:       '✅ מסנן: תזונה + אימון היום',
                neither_today:    '🔴 מסנן: ללא פעילות היום',
                no_nutrition_3d:  '🥗 מסנן: ללא תזונה 3+ ימים',
                no_workout_7d:    '🏋️ מסנן: ללא אימון 7+ ימים',
                attention:        '⚠️ מסנן: דורש תשומת לב',
              }[activityFilter] || 'סינון פעיל'}
              {' '}— {filteredTrainees.length} מתאמנים
            </span>
            <button onClick={() => setActivityFilter(null)} className="text-slate-300 hover:text-white">
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {/* List */}
        {filter !== 'deleted' && <div className="space-y-2">
          {isLoading ? (
            <div className="text-center py-12 text-slate-500">טוען...</div>
          ) : filteredTrainees.length === 0 ? (
            <Card className="p-12 text-center bg-white border-0">
              <Users className="w-12 h-12 mx-auto text-slate-300 mb-3" />
              <p className="text-slate-500">{trainees.length === 0 ? 'אין מתאמנים עדיין' : 'לא נמצאו מתאמנים'}</p>
              {trainees.length === 0 && (
                <Link to={createPageUrl('AddTrainee')}>
                  <Button className="mt-4 bg-emerald-500 hover:bg-emerald-600">
                    <UserPlus className="w-4 h-4 ml-2" />הוסף מתאמן ראשון
                  </Button>
                </Link>
              )}
            </Card>
          ) : (
            filteredTrainees.map(trainee => {
              const notifPref = allNotifPrefs.find(p => p.trainee_email === trainee.user_email);
              const remindersOn = notifPref ? notifPref.whatsapp_reminders_enabled !== false : true;
              const mutedDays = notifPref?.disabled_days || [];
              const traineeFirstMeal = allMealsEver
                .filter(m => nutritionRecordMatchesTrainee(m, trainee))
                .sort((a, b) => new Date(a.created_at) - new Date(b.created_at))[0];
              return (
                <TraineeMiniCard
                   key={trainee.id}
                   trainee={trainee}
                   todayStats={traineeTodayStats[trainee.user_email]}
                   weekStats={traineeWeeklyStats[trainee.user_email]}
                   summary={summaryByEmail[trainee.user_email]}
                   selectMode={selectMode}
                   selected={selectedIds.includes(trainee.id)}
                   onSelect={() => toggleSelect(trainee.id)}
                   onDelete={handleDeleteOne}
                   onClick={() => setSelectedTrainee(trainee)}
                   notifStatus={{ remindersOn, mutedDays }}
                   firstMealDate={traineeFirstMeal?.created_at}
                   meals={allMeals}
                   workouts={allWorkouts}
                 />
              );
            })
          )}
        </div>}
      </div>
    </div>
  );
}