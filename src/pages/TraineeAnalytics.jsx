import React, { useState, useCallback, useMemo, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { createPageUrl } from '@/utils';
import { getIsraelDateString } from '@/utils/nutritionSync';
import { format, subDays, parseISO, differenceInDays } from 'date-fns';
import { he } from 'date-fns/locale/he';
import {
  BarChart, Bar, LineChart, Line, XAxis, YAxis, ResponsiveContainer,
  Tooltip, Cell, ReferenceLine,
} from 'recharts';
import {
  ArrowRight, RefreshCw, Utensils, Droplets, Dumbbell, Scale,
  ChevronDown, ChevronUp, AlertCircle, TrendingUp, TrendingDown,
  Calendar, Target, Activity, Info, Eye, Minus, BarChart2,
} from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';

// ─── Date helpers ─────────────────────────────────────────────────────────────

function todayIL() { return getIsraelDateString(); }
function nDaysAgoIL(n) { return getIsraelDateString(subDays(new Date(), n)); }

function fmtDate(str) {
  if (!str) return '';
  try { return format(parseISO(str), 'd/M/yyyy', { locale: he }); } catch { return str; }
}
function fmtDateShort(str) {
  if (!str) return '';
  try { return format(parseISO(str), 'd/M', { locale: he }); } catch { return str; }
}
function fmtTime(iso) {
  if (!iso) return '';
  try { return format(new Date(iso), 'HH:mm'); } catch { return ''; }
}
function fmtNum(v, digits = 0) {
  if (v == null) return null;
  return Number(v).toLocaleString('he-IL', { maximumFractionDigits: digits });
}

// ─── Null-safe display ────────────────────────────────────────────────────────

const NO_DATA = 'לא תועד';
const NO_PLAN = 'לא קיים תוכנית';

function numOrNone(v, suffix = '', digits = 0) {
  if (v == null) return <span className="text-slate-400 text-sm">{NO_DATA}</span>;
  return <>{fmtNum(v, digits)}{suffix && <span className="text-xs text-slate-500 mr-0.5">{suffix}</span>}</>;
}

// ─── Severity colors ──────────────────────────────────────────────────────────

const SEVERITY = {
  positive: 'bg-emerald-50 border-emerald-200 text-emerald-800',
  warn:     'bg-amber-50  border-amber-200  text-amber-800',
  info:     'bg-blue-50   border-blue-200   text-blue-800',
};
const SEVERITY_DOT = {
  positive: 'bg-emerald-500',
  warn:     'bg-amber-500',
  info:     'bg-blue-500',
};
const CONFIDENCE_LABEL = { high: null, medium: 'בינוני', low: 'נמוך — נתונים חלקיים' };

// ─── KPI Card ─────────────────────────────────────────────────────────────────

function KPICard({ label, value, target, unit = '', sub, trend, trendPos, noData, warn }) {
  const pct = (value != null && target) ? Math.round((value / target) * 100) : null;
  const good = pct != null && pct >= 80 && pct <= 120;
  return (
    <Card className={`p-4 border ${warn ? 'border-amber-200 bg-amber-50' : 'border-slate-100 bg-white'}`}>
      <p className="text-xs text-slate-500 mb-1 font-medium">{label}</p>
      {noData ? (
        <p className="text-slate-400 text-sm font-medium mt-2">{NO_DATA}</p>
      ) : (
        <>
          <div className="flex items-end gap-1">
            <span className="text-2xl font-bold text-slate-800">
              {value != null ? fmtNum(value) : '—'}
            </span>
            {unit && <span className="text-sm text-slate-500 mb-0.5">{unit}</span>}
          </div>
          {target && (
            <p className="text-xs text-slate-500 mt-0.5">
              יעד: {fmtNum(target)} {unit}
              {pct != null && (
                <span className={`mr-1 font-medium ${good ? 'text-emerald-600' : 'text-amber-600'}`}>
                  ({pct}%)
                </span>
              )}
            </p>
          )}
          {sub && <p className="text-xs text-slate-400 mt-1">{sub}</p>}
          {trend != null && (
            <p className={`text-xs mt-1 font-medium ${trendPos ? 'text-emerald-600' : 'text-amber-600'}`}>
              {trendPos ? '↑' : '↓'} {trend}
            </p>
          )}
        </>
      )}
    </Card>
  );
}

// ─── Disclosure banner ────────────────────────────────────────────────────────

function DisclosureBanner({ text, prominent = false }) {
  return (
    <div className={`flex gap-2 rounded-lg border p-3 text-sm ${prominent ? 'bg-amber-50 border-amber-200 text-amber-800' : 'bg-slate-50 border-slate-200 text-slate-600'}`}>
      <Info className="w-4 h-4 flex-shrink-0 mt-0.5" />
      <span>{text}</span>
    </div>
  );
}

// ─── Workout Detail Modal ─────────────────────────────────────────────────────

function WorkoutDetailModal({ sessionId, traineeId, open, onClose }) {
  const { data, isLoading, isError } = useQuery({
    queryKey: ['workoutDetail', sessionId],
    queryFn:  () => base44.functions.invoke('getWorkoutDetail', { session_id: sessionId, trainee_id: traineeId }),
    enabled:  open && !!sessionId,
    staleTime: 5 * 60 * 1000,
  });

  const d = data?.data;
  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto" dir="rtl">
        <DialogHeader>
          <DialogTitle>{d?.session?.title || 'פרטי אימון'} — {fmtDate(d?.session?.date)}</DialogTitle>
        </DialogHeader>
        {isLoading && <div className="text-center py-8 text-slate-500">טוען...</div>}
        {isError  && <div className="text-center py-8 text-red-500">שגיאה בטעינת פרטי האימון</div>}
        {d && (
          <div className="space-y-4">
            <div className="flex flex-wrap gap-3 text-sm text-slate-600 bg-slate-50 rounded-lg p-3">
              <span>סטים: <strong>{d.session && (d.exercises?.reduce((s,e)=>s+e.total_sets,0)||0)}</strong></span>
              <span>חזרות: <strong>{d.exercises?.reduce((s,e)=>s+e.total_reps,0)||0}</strong></span>
              {d.exercises?.reduce((s,e)=>s+(e.weighted_volume_kg||0),0) > 0 && (
                <span>נפח משוקלל: <strong>{fmtNum(d.exercises.reduce((s,e)=>s+(e.weighted_volume_kg||0),0))} ק"ג</strong></span>
              )}
              {d.session?.duration_min && <span>משך: <strong>{d.session.duration_min} דקות</strong></span>}
              {d.session?.effort_score  && <span>מאמץ: <strong>{d.session.effort_score}/10</strong></span>}
            </div>

            {d.exercises?.map((ex, ei) => (
              <ExerciseBlock key={ei} ex={ex} traineeId={traineeId} />
            ))}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function ExerciseBlock({ ex, traineeId }) {
  const [showHistory, setShowHistory] = useState(false);
  const mcLabel = ex.match_confidence === 'transliteration' ? '(משוייך)' : ex.match_confidence === 'none' ? null : null;

  return (
    <Card className="border border-slate-100">
      <CardContent className="p-4">
        <div className="flex items-start justify-between mb-3">
          <div>
            <p className="font-semibold text-slate-800">{ex.exercise_name}</p>
            {ex.muscle_group && (
              <Badge variant="outline" className="text-xs mt-1">
                {ex.muscle_group} {mcLabel && <span className="text-slate-400 mr-1">{mcLabel}</span>}
              </Badge>
            )}
          </div>
          <Button size="sm" variant="ghost" className="text-xs text-teal-600" onClick={() => setShowHistory(true)}>
            היסטוריה
          </Button>
        </div>

        <div className="space-y-1">
          {ex.sets?.map((set, si) => (
            <div key={si} className="flex gap-3 text-sm py-1 border-b border-slate-50 last:border-0">
              <span className="text-slate-400 w-8">#{set.set_number}</span>
              <span className="text-slate-700 flex-1">
                {set.type === 'weighted' && set.weight != null ? (
                  <>{fmtNum(set.weight, 1)} ק"ג × {set.reps} חזרות</>
                ) : set.type === 'bodyweight' ? (
                  <>משקל גוף × {set.reps} חזרות</>
                ) : set.type === 'timed' && set.duration_sec ? (
                  <>{set.duration_sec} שניות</>
                ) : (
                  <span className="text-slate-400">
                    {set.reps ? `${set.reps} חזרות` : ''} — {set.weight === null ? 'לא נרשם משקל' : ''}
                  </span>
                )}
              </span>
              {set.volume_kg != null && (
                <span className="text-slate-400 text-xs">{fmtNum(set.volume_kg)} ק"ג</span>
              )}
              {set.notes && <span className="text-amber-600 text-xs">💬 {set.notes}</span>}
            </div>
          ))}
        </div>

        <div className="flex flex-wrap gap-3 mt-2 pt-2 border-t text-xs text-slate-500">
          <span>סטים: {ex.total_sets}</span>
          <span>חזרות: {ex.total_reps}</span>
          {ex.weighted_volume_kg != null && <span>נפח: {fmtNum(ex.weighted_volume_kg)} ק"ג</span>}
          {ex.bodyweight_sets > 0 && <span>משקל גוף: {ex.bodyweight_reps} חזרות</span>}
          {ex.best_set && <span>סט הטוב: {fmtNum(ex.best_weight, 1)} ק"ג × {ex.reps_at_best_weight}</span>}
        </div>

        {showHistory && (
          <ExerciseHistoryInline exerciseName={ex.exercise_name} traineeId={traineeId} onClose={() => setShowHistory(false)} />
        )}
      </CardContent>
    </Card>
  );
}

// ─── Exercise History Inline / Modal ─────────────────────────────────────────

function ExerciseHistoryInline({ exerciseName, traineeId, onClose }) {
  const { data, isLoading } = useQuery({
    queryKey: ['exerciseHistory', traineeId, exerciseName],
    queryFn:  () => base44.functions.invoke('getExerciseHistory', { trainee_id: traineeId, exercise_name: exerciseName }),
    staleTime: 5 * 60 * 1000,
  });
  const d = data?.data;

  const TREND_LABEL = {
    improving:                    { text: 'מגמת עלייה', cls: 'text-emerald-600' },
    declining:                    { text: 'מגמת ירידה', cls: 'text-red-600' },
    stable:                       { text: 'יציב', cls: 'text-slate-600' },
    insufficient_comparable_data: { text: 'אין עדיין מספיק נתונים להשוואה אמינה', cls: 'text-slate-400 italic' },
  };

  const chartData = d?.history?.filter(h => h.best_weight != null).map(h => ({
    date: fmtDateShort(h.date),
    weight: h.best_weight,
    vol: h.weighted_volume_kg,
  })) || [];

  return (
    <div className="mt-4 border-t pt-4">
      <div className="flex justify-between items-center mb-3">
        <p className="font-medium text-slate-700">היסטוריית {exerciseName}</p>
        <Button size="sm" variant="ghost" onClick={onClose}>סגור</Button>
      </div>
      {isLoading && <p className="text-slate-400 text-sm">טוען...</p>}
      {d && (
        <>
          {d.trend && (
            <p className={`text-sm mb-3 ${TREND_LABEL[d.trend]?.cls || 'text-slate-500'}`}>
              {TREND_LABEL[d.trend]?.text || d.trend}
            </p>
          )}
          {chartData.length >= 2 && (
            <div className="h-32 mb-3">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartData}>
                  <XAxis dataKey="date" fontSize={10} tickLine={false} axisLine={false} />
                  <YAxis hide domain={['auto','auto']} />
                  <Tooltip formatter={v => [`${v} ק"ג`]} contentStyle={{ fontSize: 11, direction: 'rtl' }} />
                  <Line type="monotone" dataKey="weight" stroke="#0d9488" strokeWidth={2} dot={{ r: 3 }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}
          <div className="space-y-2 max-h-48 overflow-y-auto">
            {d.history?.slice().reverse().map((h, i) => (
              <div key={i} className="text-sm border-b border-slate-50 pb-1 flex justify-between">
                <span className="text-slate-500">{fmtDate(h.date)}</span>
                <span>
                  {h.best_weight != null ? `${fmtNum(h.best_weight, 1)} ק"ג × ${h.reps_at_best_weight}` : ''}
                  {h.bodyweight_sets > 0 && ` (גוף: ${h.bodyweight_reps})`}
                </span>
                {h.weighted_volume_kg != null && (
                  <span className="text-slate-400 text-xs">{fmtNum(h.weighted_volume_kg)} ק"ג</span>
                )}
              </div>
            ))}
            {d.history?.length === 0 && <p className="text-slate-400 text-sm">אין היסטוריה</p>}
          </div>
        </>
      )}
    </div>
  );
}

// ─── Nutrition Day Modal ──────────────────────────────────────────────────────

function NutritionDayModal({ traineeId, date, open, onClose }) {
  const { data, isLoading, isError } = useQuery({
    queryKey: ['nutritionDay', traineeId, date],
    queryFn:  () => base44.functions.invoke('getNutritionDayDetail', { trainee_id: traineeId, date }),
    enabled:  open && !!date,
    staleTime: 5 * 60 * 1000,
  });
  const d = data?.data;

  const MEAL_NAMES = { breakfast: 'ארוחת בוקר', lunch: 'צהריים', dinner: 'ערב', snack: 'חטיף', other: 'אחר' };

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto" dir="rtl">
        <DialogHeader>
          <DialogTitle>תזונה — {fmtDate(date)}</DialogTitle>
        </DialogHeader>
        {isLoading && <p className="text-center text-slate-400 py-8">טוען...</p>}
        {isError   && <p className="text-center text-red-500 py-8">שגיאה בטעינה</p>}
        {d?.no_data && <p className="text-center text-slate-400 py-8">{NO_DATA}</p>}
        {d && !d.no_data && (
          <div className="space-y-4">
            <div className="grid grid-cols-4 gap-2 bg-slate-50 rounded-lg p-3 text-center text-sm">
              <div><p className="text-slate-500 text-xs">קלוריות</p><p className="font-bold">{fmtNum(d.day_totals.calories)}</p></div>
              <div><p className="text-slate-500 text-xs">חלבון</p><p className="font-bold">{fmtNum(d.day_totals.protein)}ג</p></div>
              <div><p className="text-slate-500 text-xs">פחמימות</p><p className="font-bold">{fmtNum(d.day_totals.carbs)}ג</p></div>
              <div><p className="text-slate-500 text-xs">שומן</p><p className="font-bold">{fmtNum(d.day_totals.fat)}ג</p></div>
            </div>
            {d.meals.map((m, i) => (
              <MealEntryCard key={i} meal={m} mealNames={MEAL_NAMES} />
            ))}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function MealEntryCard({ meal, mealNames }) {
  const [expanded, setExpanded] = useState(false);
  return (
    <div className="border rounded-lg overflow-hidden">
      <div className="flex justify-between items-center p-3 bg-slate-50">
        <div>
          <Badge variant="outline" className="text-xs mr-2">
            {mealNames[meal.meal_type] || meal.meal_type}
          </Badge>
          <span className="text-sm font-medium text-slate-700">{meal.food_name || 'ללא שם'}</span>
          {meal.created_at && <span className="text-xs text-slate-400 mr-2">{fmtTime(meal.created_at)}</span>}
        </div>
        <span className="font-bold text-slate-700">{meal.calories != null ? `${fmtNum(meal.calories)} קק"ל` : ''}</span>
      </div>
      <div className="px-3 py-2 text-sm text-slate-600 flex flex-wrap gap-3">
        {meal.protein != null && <span>חלבון: {fmtNum(meal.protein, 1)}ג</span>}
        {meal.carbs   != null && <span>פחמימות: {fmtNum(meal.carbs, 1)}ג</span>}
        {meal.fat     != null && <span>שומן: {fmtNum(meal.fat, 1)}ג</span>}
      </div>
      {meal.items_available && (
        <button
          className="w-full text-xs text-teal-600 py-1 border-t border-slate-100 hover:bg-slate-50"
          onClick={() => setExpanded(e => !e)}
        >
          {expanded ? 'הסתר פירוט' : 'הצג פירוט רכיבים'}
          {expanded ? <ChevronUp className="inline w-3 h-3 mr-1" /> : <ChevronDown className="inline w-3 h-3 mr-1" />}
        </button>
      )}
      {!meal.items_available && (
        <p className="text-xs text-slate-400 px-3 pb-2">לא נשמר פירוט רכיבים לרשומה זו</p>
      )}
      {expanded && meal.items.length > 0 && (
        <div className="border-t p-3 space-y-1 bg-white">
          {meal.items.map((it, i) => (
            <div key={i} className="flex justify-between text-xs text-slate-600">
              <span>{it.food_name} {it.amount != null ? `(${fmtNum(it.amount, 0)}${it.unit === 'gram' ? 'ג' : it.unit})` : ''}</span>
              <span>{it.calories != null ? `${fmtNum(it.calories)} קק"ל` : ''}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Water Day Modal ──────────────────────────────────────────────────────────

function WaterDayModal({ traineeId, date, open, onClose }) {
  const { data, isLoading } = useQuery({
    queryKey: ['waterDay', traineeId, date],
    queryFn:  () => base44.functions.invoke('getWaterDayDetail', { trainee_id: traineeId, date }),
    enabled:  open && !!date,
    staleTime: 5 * 60 * 1000,
  });
  const d = data?.data;

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="max-w-sm max-h-[80vh] overflow-y-auto" dir="rtl">
        <DialogHeader>
          <DialogTitle>מים — {fmtDate(date)}</DialogTitle>
        </DialogHeader>
        {isLoading && <p className="text-center text-slate-400 py-6">טוען...</p>}
        {d?.no_data && <p className="text-center text-slate-400 py-6">{NO_DATA}</p>}
        {d && !d.no_data && (
          <div className="space-y-3">
            <div className="bg-blue-50 rounded-lg p-3 text-center">
              <p className="text-2xl font-bold text-blue-700">{(d.total_ml / 1000).toFixed(2)} ליטר</p>
              <p className="text-xs text-blue-500">{d.entry_count} רישומים</p>
            </div>
            <div className="space-y-2">
              {d.entries.map((e, i) => (
                <div key={i} className="flex justify-between text-sm border-b pb-1 last:border-0">
                  <span className="text-slate-500">{fmtTime(e.created_at)}</span>
                  <span className="font-medium">{e.amount_ml} מ"ל</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ─── Daily Detail Panel ───────────────────────────────────────────────────────

function DailyDetailPanel({ day, targets, traineeId, onViewWorkout }) {
  const [showNutritionModal, setShowNutritionModal] = useState(false);
  const [showWaterModal,     setShowWaterModal]     = useState(false);

  if (!day) return null;

  const cal   = day.nutrition.calories;
  const pro   = day.nutrition.protein;
  const water = day.water.total_ml;

  return (
    <div className="mt-2 bg-slate-50 rounded-xl p-4 space-y-4 border border-slate-200" dir="rtl">
      <p className="font-semibold text-slate-700">{fmtDate(day.date)}</p>

      {/* Nutrition */}
      <div>
        <div className="flex justify-between items-center mb-2">
          <p className="text-sm font-medium text-slate-700 flex items-center gap-1"><Utensils className="w-4 h-4 text-emerald-500" /> תזונה</p>
          {day.nutrition.logged && (
            <Button size="sm" variant="ghost" className="text-xs text-teal-600 h-6" onClick={() => setShowNutritionModal(true)}>
              <Eye className="w-3 h-3 ml-1" /> פירוט
            </Button>
          )}
        </div>
        {!day.nutrition.logged ? (
          <p className="text-slate-400 text-sm">{NO_DATA}</p>
        ) : (
          <div className="grid grid-cols-2 gap-2 text-sm">
            <div className="bg-white rounded p-2">
              <p className="text-xs text-slate-500">קלוריות</p>
              <p className="font-bold text-slate-800">{fmtNum(cal)}{targets.calories && <span className="text-xs text-slate-400 mr-1">/ {fmtNum(targets.calories)}</span>}</p>
            </div>
            <div className="bg-white rounded p-2">
              <p className="text-xs text-slate-500">חלבון</p>
              <p className="font-bold text-slate-800">{fmtNum(pro, 1)}ג{targets.protein && <span className="text-xs text-slate-400 mr-1">/ {fmtNum(targets.protein)}ג</span>}</p>
            </div>
            <div className="bg-white rounded p-2">
              <p className="text-xs text-slate-500">פחמימות</p>
              <p className="font-bold text-slate-800">{fmtNum(day.nutrition.carbs, 1)}ג</p>
            </div>
            <div className="bg-white rounded p-2">
              <p className="text-xs text-slate-500">שומן</p>
              <p className="font-bold text-slate-800">{fmtNum(day.nutrition.fat, 1)}ג</p>
            </div>
          </div>
        )}
        <p className="text-xs text-slate-400 mt-1">רשומות: {day.nutrition.meal_entry_count || 0}</p>
      </div>

      {/* Water */}
      <div>
        <div className="flex justify-between items-center mb-2">
          <p className="text-sm font-medium text-slate-700 flex items-center gap-1"><Droplets className="w-4 h-4 text-blue-500" /> מים</p>
          {day.water.logged && (
            <Button size="sm" variant="ghost" className="text-xs text-teal-600 h-6" onClick={() => setShowWaterModal(true)}>
              <Eye className="w-3 h-3 ml-1" /> פירוט
            </Button>
          )}
        </div>
        {!day.water.logged ? (
          <p className="text-slate-400 text-sm">{NO_DATA}</p>
        ) : (
          <div className="flex gap-3 text-sm">
            <div className="bg-white rounded p-2 flex-1">
              <p className="text-xs text-slate-500">סה"כ</p>
              <p className="font-bold text-blue-700">{(water / 1000).toFixed(2)} ל</p>
            </div>
            {targets.water_ml && (
              <div className="bg-white rounded p-2 flex-1">
                <p className="text-xs text-slate-500">יעד</p>
                <p className="font-bold text-slate-600">{(targets.water_ml / 1000).toFixed(1)} ל</p>
              </div>
            )}
            <div className="bg-white rounded p-2 flex-1">
              <p className="text-xs text-slate-500">רישומים</p>
              <p className="font-bold text-slate-600">{day.water.entry_count}</p>
            </div>
          </div>
        )}
      </div>

      {/* Training */}
      <div>
        <p className="text-sm font-medium text-slate-700 flex items-center gap-1 mb-2"><Dumbbell className="w-4 h-4 text-orange-500" /> אימון</p>
        {!day.training.logged ? (
          <p className="text-slate-400 text-sm">{NO_DATA}</p>
        ) : (
          <div className="space-y-2">
            {day.training.session_ids?.map((sid, i) => (
              <div key={sid} className="bg-white rounded p-2 flex justify-between items-center">
                <div>
                  <p className="text-sm font-medium text-slate-700">{day.training.session_titles?.[i] || 'אימון'}</p>
                  <p className="text-xs text-slate-400">סטים: {day.training.set_count} | חזרות: {day.training.total_reps}</p>
                  {day.training.weighted_volume_kg != null && (
                    <p className="text-xs text-slate-400">נפח משוקלל: {fmtNum(day.training.weighted_volume_kg)} ק"ג</p>
                  )}
                </div>
                <Button size="sm" variant="ghost" className="text-xs text-teal-600" onClick={() => onViewWorkout(sid)}>
                  פרטים
                </Button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Progress */}
      {day.progress.logged && (
        <div>
          <p className="text-sm font-medium text-slate-700 flex items-center gap-1 mb-2"><Scale className="w-4 h-4 text-purple-500" /> מדדים</p>
          <div className="flex flex-wrap gap-2 text-sm">
            {day.progress.weight_kg     != null && <span className="bg-white rounded px-2 py-1">משקל: {day.progress.weight_kg} ק"ג</span>}
            {day.progress.body_fat_pct  != null && <span className="bg-white rounded px-2 py-1">שומן: {day.progress.body_fat_pct}%</span>}
            {day.progress.muscle_mass_kg!= null && <span className="bg-white rounded px-2 py-1">שריר: {day.progress.muscle_mass_kg} ק"ג</span>}
          </div>
        </div>
      )}

      {showNutritionModal && (
        <NutritionDayModal traineeId={traineeId} date={day.date} open onClose={() => setShowNutritionModal(false)} />
      )}
      {showWaterModal && (
        <WaterDayModal traineeId={traineeId} date={day.date} open onClose={() => setShowWaterModal(false)} />
      )}
    </div>
  );
}

// ─── Day Strip ────────────────────────────────────────────────────────────────

function DayStrip({ daily, selectedDate, onSelect }) {
  const days = daily || [];
  const show = days.length <= 14 ? days : days;  // always show all, scrollable

  return (
    <div className="flex gap-1 overflow-x-auto pb-1 scrollbar-thin">
      {show.map(day => {
        const isSelected = day.date === selectedDate;
        const n = day.nutrition.logged;
        const w = day.water.logged;
        const t = day.training.logged;
        const p = day.progress.logged;
        const logCount = [n, w, t, p].filter(Boolean).length;

        return (
          <button
            key={day.date}
            onClick={() => onSelect(isSelected ? null : day.date)}
            className={`flex-shrink-0 rounded-lg p-2 text-center min-w-[52px] border transition-all ${
              isSelected ? 'bg-teal-500 text-white border-teal-600' : 'bg-white border-slate-200 hover:border-teal-300'
            }`}
          >
            <p className={`text-xs font-medium ${isSelected ? 'text-white' : 'text-slate-500'}`}>
              {fmtDateShort(day.date).split('/')[0]}
            </p>
            <p className={`text-[10px] ${isSelected ? 'text-teal-100' : 'text-slate-400'}`}>
              {format(parseISO(day.date), 'EEE', { locale: he })}
            </p>
            <div className="flex flex-wrap gap-0.5 justify-center mt-1">
              {n && <span title="תזונה">🍽</span>}
              {w && <span title="מים">💧</span>}
              {t && <span title="אימון">🏋</span>}
              {p && <span title="מדדים">⚖️</span>}
              {!n && !w && !t && !p && <span className="text-slate-300 text-xs">—</span>}
            </div>
          </button>
        );
      })}
    </div>
  );
}

// ─── Summary Tab ──────────────────────────────────────────────────────────────

function SummaryTab({ data, comparison, traineeId, onViewWorkout }) {
  const [selectedDay, setSelectedDay] = useState(null);

  const { nutrition, water, training, progress, daily, period, trainee } = data;
  const targets = trainee?.targets || {};

  const selectedDayData = daily?.find(d => d.date === selectedDay);

  const prevPct = (cur, prev) =>
    cur != null && prev != null && prev !== 0
      ? Math.round(((cur - prev) / Math.abs(prev)) * 10) / 10 : null;

  const volChange = comparison?.volume_change_pct;
  const calChange = comparison?.calories_change_pct;

  return (
    <div className="space-y-4">
      {/* KPI grid */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
        <KPICard
          label="ממוצע קלוריות"
          value={nutrition?.avg_calories}
          target={targets.calories}
          unit='קק"ל'
          sub={nutrition?.no_data ? null : `${nutrition.total_logged_days} מתוך ${period?.days_in_range} ימי רישום`}
          trend={calChange != null ? `${Math.abs(calChange)}% ${calChange > 0 ? 'עלייה' : 'ירידה'}` : null}
          trendPos={calChange > 0}
          noData={nutrition?.no_data}
        />
        <KPICard
          label="ממוצע חלבון"
          value={nutrition?.avg_protein}
          target={targets.protein}
          unit="ג"
          noData={nutrition?.no_data}
        />
        <KPICard
          label="ממוצע מים"
          value={water?.avg_ml != null ? Math.round(water.avg_ml / 100) / 10 : null}
          target={targets.water_ml ? targets.water_ml / 1000 : null}
          unit="ל"
          sub={water?.no_data ? null : `${water.total_logged_days} ימי רישום`}
          noData={water?.no_data}
        />
        <KPICard
          label="אימונים"
          value={training?.sessions_completed}
          target={training?.planned_sessions ?? undefined}
          unit={training?.planned_sessions != null ? `מתוך ${training.planned_sessions}` : 'סשנים'}
          sub={training?.planned_sessions == null ? NO_PLAN : null}
          noData={training?.no_data}
        />
        {training && !training.no_data && (
          <Card className="p-4 border border-slate-100 bg-white col-span-2">
            <p className="text-xs text-slate-500 mb-2 font-medium">עומס אימון</p>
            <div className="grid grid-cols-2 gap-2 text-sm">
              {training.weighted_volume_kg != null && (
                <div>
                  <p className="text-xs text-slate-400">נפח משוקלל</p>
                  <p className="font-bold text-slate-800">{fmtNum(training.weighted_volume_kg)} ק"ג</p>
                  {volChange != null && (
                    <p className={`text-xs ${volChange > 0 ? 'text-emerald-600' : 'text-amber-600'}`}>
                      {volChange > 0 ? '↑' : '↓'} {Math.abs(volChange)}% מהתקופה הקודמת
                    </p>
                  )}
                </div>
              )}
              <div>
                <p className="text-xs text-slate-400">סטים / חזרות</p>
                <p className="font-bold text-slate-800">{training.total_sets} / {training.total_reps}</p>
              </div>
              {training.bodyweight_sets > 0 && (
                <div>
                  <p className="text-xs text-slate-400">חזרות משקל גוף</p>
                  <p className="font-bold text-slate-800">{training.bodyweight_reps}</p>
                </div>
              )}
            </div>
            {training.weighted_volume_kg != null && training.has_mixed_types && (
              <p className="text-xs text-slate-400 mt-2">* נפח משוקלל כולל רק סטים עם משקל שנרשם</p>
            )}
          </Card>
        )}
        {progress && !progress.no_data && (
          <KPICard
            label="משקל"
            value={progress.weight_end}
            unit={'ק"ג'}
            sub={progress.weight_change_kg != null ? `שינוי: ${progress.weight_change_kg > 0 ? '+' : ''}${progress.weight_change_kg} ק"ג` : null}
            trend={progress.weight_change_kg != null ? `${Math.abs(progress.weight_change_kg)} ק"ג ${progress.weight_change_kg < 0 ? 'ירידה' : 'עלייה'}` : null}
            trendPos={progress.weight_change_kg < 0}
            noData={false}
          />
        )}
      </div>

      {/* Disclosures */}
      {targets?.target_history_available === false && (
        <DisclosureBanner
          text='יעדי הקלוריות והמאקרו מחושבים לפי היעד הנוכחי. אם היעד השתנה במהלך התקופה, נתוני ההיענות ההיסטוריים עשויים להיות פחות מדויקים.'
          prominent={period?.days_in_range > 14}
        />
      )}
      {training?.adherence_basis === 'approximate_date_only' && training.planned_sessions != null && (
        <DisclosureBanner text="היענות לאימונים מבוססת על התאמת ימי אימון, ולא על התאמה מלאה בין האימון המתוכנן לאימון שבוצע." />
      )}

      {/* Logging Activity */}
      {(() => {
        const daysWithNutrition = nutrition?.total_logged_days ?? 0;
        const daysWithWater     = water?.total_logged_days ?? 0;
        const daysWithProgress  = (daily || []).filter(d => d.progress.logged).length;
        const totalMealEntries  = (daily || []).reduce((s, d) => s + (d.nutrition.meal_entry_count || 0), 0);
        const totalWaterEntries = (daily || []).reduce((s, d) => s + (d.water.entry_count || 0), 0);
        const daysWithAnyLog    = (daily || []).filter(
          d => d.nutrition.logged || d.water.logged || d.training.logged || d.progress.logged
        ).length;
        const totalDays = period?.days_in_range || 0;

        return (
          <div>
            <p className="text-sm font-medium text-slate-700 mb-2">פעילות תיעוד בתקופה</p>
            <div className="grid grid-cols-3 md:grid-cols-6 gap-2">
              <div className="bg-white border border-slate-100 rounded-lg p-3 text-center">
                <p className="text-xs text-slate-500 mb-1">ימים עם תיעוד</p>
                <p className="font-bold text-slate-800">{daysWithAnyLog}<span className="text-xs text-slate-400 font-normal">/{totalDays}</span></p>
              </div>
              <div className="bg-emerald-50 border border-emerald-100 rounded-lg p-3 text-center">
                <p className="text-xs text-slate-500 mb-1">ימי תזונה</p>
                <p className="font-bold text-emerald-700">{daysWithNutrition}<span className="text-xs text-slate-400 font-normal">/{totalDays}</span></p>
                {totalMealEntries > 0 && <p className="text-[10px] text-slate-400">{totalMealEntries} רשומות</p>}
              </div>
              <div className="bg-blue-50 border border-blue-100 rounded-lg p-3 text-center">
                <p className="text-xs text-slate-500 mb-1">ימי מים</p>
                <p className="font-bold text-blue-700">{daysWithWater}<span className="text-xs text-slate-400 font-normal">/{totalDays}</span></p>
                {totalWaterEntries > 0 && <p className="text-[10px] text-slate-400">{totalWaterEntries} רשומות</p>}
              </div>
              <div className="bg-orange-50 border border-orange-100 rounded-lg p-3 text-center">
                <p className="text-xs text-slate-500 mb-1">אימונים</p>
                <p className="font-bold text-orange-700">{training?.sessions_completed ?? 0}</p>
              </div>
              <div className="bg-orange-50 border border-orange-100 rounded-lg p-3 text-center">
                <p className="text-xs text-slate-500 mb-1">סטים</p>
                <p className="font-bold text-orange-700">{training?.total_sets ?? 0}</p>
              </div>
              <div className="bg-purple-50 border border-purple-100 rounded-lg p-3 text-center">
                <p className="text-xs text-slate-500 mb-1">מדדים</p>
                <p className="font-bold text-purple-700">{daysWithProgress}</p>
                <p className="text-[10px] text-slate-400">ימי שקילה</p>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Day strip */}
      <div>
        <p className="text-sm font-medium text-slate-700 mb-2">פעילות יומית</p>
        <DayStrip daily={daily} selectedDate={selectedDay} onSelect={setSelectedDay} />
        {selectedDay && selectedDayData && (
          <DailyDetailPanel
            day={selectedDayData}
            targets={targets}
            traineeId={traineeId}
            onViewWorkout={onViewWorkout}
          />
        )}
      </div>
    </div>
  );
}

// ─── Nutrition Tab ────────────────────────────────────────────────────────────

function NutritionTab({ data, traineeId }) {
  const { nutrition, water, daily, period, trainee } = data;
  const targets = trainee?.targets || {};
  const [clickedDate, setClickedDate] = useState(null);

  const calData = (daily || []).map(d => ({
    date: fmtDateShort(d.date),
    cal:  d.nutrition.logged ? (d.nutrition.calories || 0) : null,
    target: targets.calories,
    logged: d.nutrition.logged,
  }));

  const proData = (daily || []).map(d => ({
    date: fmtDateShort(d.date),
    pro:  d.nutrition.logged ? (d.nutrition.protein || 0) : null,
    target: targets.protein,
    logged: d.nutrition.logged,
  }));

  const waterData = (daily || []).map(d => ({
    date: fmtDateShort(d.date),
    water: d.water.logged ? Math.round((d.water.total_ml || 0) / 100) / 10 : null,
    target: targets.water_ml ? targets.water_ml / 1000 : null,
    logged: d.water.logged,
  }));

  return (
    <div className="space-y-6">
      {/* Period summary */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KPICard label="ממוצע קלוריות"  value={nutrition?.avg_calories} target={targets.calories}  unit='קק"ל' noData={nutrition?.no_data} />
        <KPICard label="ממוצע חלבון"    value={nutrition?.avg_protein}  target={targets.protein}   unit="ג"   noData={nutrition?.no_data} />
        <KPICard label="ממוצע פחמימות"  value={nutrition?.avg_carbs}    unit="ג"  noData={nutrition?.no_data} />
        <KPICard label="ממוצע שומן"      value={nutrition?.avg_fat}      unit="ג"  noData={nutrition?.no_data} />
      </div>

      {!nutrition?.no_data && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
          <div className="bg-slate-50 rounded-lg p-3">
            <p className="text-xs text-slate-500">ימי רישום</p>
            <p className="font-bold">{nutrition.total_logged_days} / {period?.days_in_range}</p>
          </div>
          <div className="bg-slate-50 rounded-lg p-3">
            <p className="text-xs text-slate-500">ימי קלוריות בטווח</p>
            <p className="font-bold">{nutrition.days_met_calorie_target ?? NO_DATA}</p>
          </div>
          <div className="bg-slate-50 rounded-lg p-3">
            <p className="text-xs text-slate-500">היענות קלוריות</p>
            <p className="font-bold">{nutrition.calorie_adherence_pct != null ? `${nutrition.calorie_adherence_pct}%` : NO_DATA}</p>
          </div>
          <div className="bg-slate-50 rounded-lg p-3">
            <p className="text-xs text-slate-500">היענות חלבון</p>
            <p className="font-bold">{nutrition.protein_adherence_pct != null ? `${nutrition.protein_adherence_pct}%` : NO_DATA}</p>
          </div>
        </div>
      )}

      <DisclosureBanner text='יעדים מחושבים לפי היעד הנוכחי. ראה הסבר בכרטיסיית סיכום.' />

      {/* Calories chart */}
      <Card className="p-4">
        <p className="font-medium text-slate-700 mb-3">קלוריות יומיות</p>
        {nutrition?.no_data ? (
          <p className="text-slate-400 text-center py-6">אין נתוני תזונה בתקופה זו</p>
        ) : (
          <div className="h-44">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={calData} margin={{ top: 15, right: 4, left: 0, bottom: 0 }}>
                <XAxis dataKey="date" fontSize={10} tickLine={false} axisLine={false} />
                <YAxis hide />
                {targets.calories && <ReferenceLine y={targets.calories} stroke="#94a3b8" strokeDasharray="4 2" />}
                <Tooltip
                  formatter={(v, n, p) => p.payload.logged ? [`${fmtNum(v)} קק"ל`, ''] : ['לא תועד', '']}
                  labelFormatter={l => `${l}`}
                  contentStyle={{ direction: 'rtl', fontSize: 11 }}
                />
                <Bar dataKey="cal" radius={[3,3,0,0]}>
                  {calData.map((entry, i) => (
                    <Cell
                      key={i}
                      fill={!entry.logged ? 'transparent' : entry.cal >= (targets.calories || Infinity) * 0.8 ? '#10b981' : '#f59e0b'}
                      onClick={() => entry.logged && setClickedDate(entry.date === clickedDate ? null : (daily||[])[i]?.date)}
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </Card>

      {/* Water chart */}
      <Card className="p-4">
        <p className="font-medium text-slate-700 mb-3">מים יומיים</p>
        {water?.no_data ? (
          <p className="text-slate-400 text-center py-6">אין נתוני מים בתקופה זו</p>
        ) : (
          <>
            <div className="flex gap-4 text-xs text-slate-500 mb-2">
              <span>ממוצע: <strong>{water.avg_ml != null ? `${(water.avg_ml/1000).toFixed(2)} ל` : NO_DATA}</strong></span>
              <span>יעד: <strong>{targets.water_ml ? `${(targets.water_ml/1000).toFixed(1)} ל` : '—'}</strong></span>
              <span className="text-slate-400">* סף היענות 85% — כלל מוצר, לא כלל רפואי</span>
            </div>
            <div className="h-44">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={waterData} margin={{ top: 15, right: 4, left: 0, bottom: 0 }}>
                  <XAxis dataKey="date" fontSize={10} tickLine={false} axisLine={false} />
                  <YAxis hide />
                  {targets.water_ml && <ReferenceLine y={targets.water_ml / 1000} stroke="#94a3b8" strokeDasharray="4 2" />}
                  <Tooltip
                    formatter={(v, n, p) => p.payload.logged ? [`${v} ל`, ''] : ['לא תועד', '']}
                    contentStyle={{ direction: 'rtl', fontSize: 11 }}
                  />
                  <Bar dataKey="water" radius={[3,3,0,0]}>
                    {waterData.map((entry, i) => (
                      <Cell key={i} fill={!entry.logged ? 'transparent' : entry.water >= (entry.target || Infinity) * 0.85 ? '#3b82f6' : '#93c5fd'} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </>
        )}
      </Card>

      {/* Protein chart */}
      {!nutrition?.no_data && (
        <Card className="p-4">
          <p className="font-medium text-slate-700 mb-3">חלבון יומי</p>
          <div className="h-40">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={proData} margin={{ top: 15, right: 4, left: 0, bottom: 0 }}>
                <XAxis dataKey="date" fontSize={10} tickLine={false} axisLine={false} />
                <YAxis hide />
                {targets.protein && <ReferenceLine y={targets.protein} stroke="#94a3b8" strokeDasharray="4 2" />}
                <Tooltip
                  formatter={(v, n, p) => p.payload.logged ? [`${v}ג`, ''] : ['לא תועד', '']}
                  contentStyle={{ direction: 'rtl', fontSize: 11 }}
                />
                <Bar dataKey="pro" radius={[3,3,0,0]}>
                  {proData.map((entry, i) => (
                    <Cell key={i} fill={!entry.logged ? 'transparent' : entry.pro >= (targets.protein || Infinity) * 0.9 ? '#8b5cf6' : '#c4b5fd'} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>
      )}

      {clickedDate && (
        <NutritionDayModal
          traineeId={traineeId}
          date={clickedDate}
          open
          onClose={() => setClickedDate(null)}
        />
      )}
    </div>
  );
}

// ─── Training Tab ─────────────────────────────────────────────────────────────

function TrainingTab({ data, traineeId, onViewWorkout }) {
  const { training, period, comparison } = data;

  if (training?.no_data) {
    return (
      <div className="text-center py-12 text-slate-400">
        <Dumbbell className="w-10 h-10 mx-auto mb-3 opacity-30" />
        <p>אין אימונים בתקופה זו</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Period metrics */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KPICard label="אימונים" value={training?.sessions_completed} noData={!training} />
        <KPICard label="סטים" value={training?.total_sets} noData={!training} />
        <KPICard label="חזרות" value={training?.total_reps} noData={!training} />
        <KPICard
          label="נפח משוקלל"
          value={training?.weighted_volume_kg}
          unit='ק"ג'
          noData={training?.weighted_volume_kg == null}
          trend={comparison?.volume_change_pct != null ? `${Math.abs(comparison.volume_change_pct)}%` : null}
          trendPos={comparison?.volume_change_pct > 0}
        />
      </div>

      {/* Sub-metrics */}
      {training && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
          <div className="bg-slate-50 rounded-lg p-3">
            <p className="text-xs text-slate-500">סטים משוקללים</p>
            <p className="font-bold">{training.weighted_sets}</p>
          </div>
          <div className="bg-slate-50 rounded-lg p-3">
            <p className="text-xs text-slate-500">חזרות משוקללות</p>
            <p className="font-bold">{training.weighted_reps}</p>
          </div>
          <div className="bg-slate-50 rounded-lg p-3">
            <p className="text-xs text-slate-500">סטים משקל גוף</p>
            <p className="font-bold">{training.bodyweight_sets}</p>
          </div>
          <div className="bg-slate-50 rounded-lg p-3">
            <p className="text-xs text-slate-500">חזרות משקל גוף</p>
            <p className="font-bold">{training.bodyweight_reps}</p>
          </div>
          {training.timed_sets > 0 && (
            <div className="bg-slate-50 rounded-lg p-3">
              <p className="text-xs text-slate-500">סטים זמן</p>
              <p className="font-bold">{training.timed_sets} ({training.timed_seconds}ש)</p>
            </div>
          )}
          {training.unknown_load_sets > 0 && (
            <div className="bg-slate-50 rounded-lg p-3">
              <p className="text-xs text-slate-500">סטים ללא משקל רשום</p>
              <p className="font-bold">{training.unknown_load_sets}</p>
            </div>
          )}
        </div>
      )}

      {training?.weighted_volume_kg != null && (training.has_mixed_types || training.bodyweight_sets > 0) && (
        <DisclosureBanner text="נפח משוקלל כולל רק סטים עם משקל שנרשם. עבודת משקל גוף, זמן ורשומות ללא משקל מוצגות בנפרד." />
      )}
      {training?.adherence_basis === 'approximate_date_only' && training.planned_sessions != null && (
        <DisclosureBanner text="היענות לאימונים מבוססת על התאמת ימי אימון בלבד." />
      )}

      {/* Muscle groups */}
      {training?.muscle_groups?.length > 0 && (
        <Card className="p-4">
          <div className="flex justify-between items-center mb-3">
            <p className="font-medium text-slate-700">ניתוח קבוצות שרירים</p>
            <span className="text-xs text-slate-400">כיסוי: {training.muscle_group_coverage_pct}%</span>
          </div>
          {training.muscle_group_coverage_pct < 50 && (
            <DisclosureBanner text="חלק מהתרגילים לא זוהו, ולכן ניתוח קבוצות השרירים חלקי." prominent />
          )}
          {training.unmatched_sets > 0 && (
            <p className="text-xs text-slate-400 mb-2">{training.unmatched_sets} סטים ללא זיהוי קבוצת שריר</p>
          )}
          <div className="space-y-2">
            {training.muscle_groups.map((mg, i) => (
              <div key={i} className="flex items-center gap-3">
                <span className="text-sm text-slate-600 w-24 text-right">{mg.group}</span>
                <div className="flex-1 h-2 bg-slate-100 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-teal-400 rounded-full"
                    style={{ width: `${Math.min(100, (mg.total_sets / (training.total_sets || 1)) * 100 * 3)}%` }}
                  />
                </div>
                <span className="text-xs text-slate-500 w-16">{mg.total_sets} סטים</span>
                {mg.weighted_volume_kg != null && (
                  <span className="text-xs text-slate-400 w-20">{fmtNum(mg.weighted_volume_kg)} ק"ג</span>
                )}
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Session list */}
      <div>
        <p className="font-medium text-slate-700 mb-3">אימונים ({training?.sessions_completed || 0})</p>
        <div className="space-y-3">
          {training?.sessions?.map((sess, i) => (
            <SessionCard key={i} sess={sess} onView={() => onViewWorkout(sess.session_id)} />
          ))}
        </div>
      </div>
    </div>
  );
}

function SessionCard({ sess, onView }) {
  return (
    <Card className="border border-slate-100 hover:border-teal-200 transition-colors">
      <CardContent className="p-4">
        <div className="flex justify-between items-start">
          <div>
            <p className="font-medium text-slate-800">{sess.title || 'אימון'}</p>
            <p className="text-sm text-slate-500">{fmtDate(sess.date)}</p>
          </div>
          <Button size="sm" variant="outline" onClick={onView} className="text-teal-600 border-teal-200">
            פרטים
          </Button>
        </div>
        <div className="flex flex-wrap gap-3 mt-2 text-xs text-slate-600">
          <span>סטים: <strong>{sess.total_sets}</strong></span>
          <span>חזרות: <strong>{sess.total_reps}</strong></span>
          {sess.weighted_volume_kg != null && <span>נפח: <strong>{fmtNum(sess.weighted_volume_kg)} ק"ג</strong></span>}
          {sess.bodyweight_sets > 0 && <span>גוף: <strong>{sess.bodyweight_reps} חזרות</strong></span>}
          {sess.duration_min && <span>⏱ {sess.duration_min} דקות</span>}
          {sess.effort_score && <span>מאמץ: {sess.effort_score}/10</span>}
        </div>
        {sess.has_mixed_types && (
          <p className="text-xs text-slate-400 mt-1">* מכיל עבודת משקל גוף — הנפח המשוקלל חלקי</p>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Progress Tab ─────────────────────────────────────────────────────────────

function ProgressTab({ data }) {
  const { progress, daily } = data;

  const weightData = (progress?.weight_entries || []).map(e => ({
    date: fmtDateShort(e.date),
    weight: e.weight_kg,
  }));

  if (progress?.no_data && (!daily || !daily.some(d => d.progress.logged))) {
    return (
      <div className="text-center py-12 text-slate-400">
        <Scale className="w-10 h-10 mx-auto mb-3 opacity-30" />
        <p>אין מדדי גוף בתקופה זו</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Summary */}
      {!progress?.no_data && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <KPICard label="משקל נוכחי"  value={progress.weight_end}       unit={'ק"ג'} noData={progress.weight_end == null} />
          <KPICard label="שינוי משקל"  value={progress.weight_change_kg} unit={'ק"ג'} noData={progress.weight_change_kg == null} />
          <KPICard label="שומן גוף %" value={progress.body_fat_pct_end}  unit="%"    noData={progress.body_fat_pct_end == null} />
          <KPICard label="מסת שריר"    value={progress.muscle_mass_end}  unit={'ק"ג'} noData={progress.muscle_mass_end == null} />
        </div>
      )}

      {/* Weight chart */}
      {weightData.length >= 2 ? (
        <Card className="p-4">
          <p className="font-medium text-slate-700 mb-3">גרף משקל</p>
          <div className="h-48">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={weightData}>
                <XAxis dataKey="date" fontSize={10} tickLine={false} axisLine={false} />
                <YAxis fontSize={10} domain={['auto','auto']} width={35} />
                <Tooltip formatter={v => [`${v} ק"ג`]} contentStyle={{ direction: 'rtl', fontSize: 11 }} />
                <Line type="monotone" dataKey="weight" stroke="#8b5cf6" strokeWidth={2} dot={{ r: 4 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
          <p className="text-xs text-slate-400 mt-1">מוצגות רשומות ממדי גוף בלבד. אין אינטרפולציה בין מדידות.</p>
        </Card>
      ) : weightData.length === 1 ? (
        <Card className="p-4 text-center">
          <p className="text-slate-500 text-sm">רשומה אחת בלבד — נדרשות לפחות שתיים לגרף</p>
        </Card>
      ) : null}

      {/* Entries list */}
      <Card className="p-4">
        <p className="font-medium text-slate-700 mb-3">רשומות מדדים</p>
        {progress?.weight_entries?.length > 0 ? (
          <div className="space-y-2">
            {[...(progress.weight_entries)].sort((a,b) => b.date.localeCompare(a.date)).map((e, i) => {
              const dayData = daily?.find(d => d.date === e.date);
              const pd = dayData?.progress;
              return (
                <div key={i} className="flex flex-wrap justify-between items-center text-sm p-2 bg-slate-50 rounded">
                  <span className="text-slate-500">{fmtDate(e.date)}</span>
                  <div className="flex gap-3">
                    {e.weight_kg != null && <span className="font-medium">משקל: {e.weight_kg} ק"ג</span>}
                    {pd?.body_fat_pct != null && <span>שומן: {pd.body_fat_pct}%</span>}
                    {pd?.muscle_mass_kg != null && <span>שריר: {pd.muscle_mass_kg} ק"ג</span>}
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <p className="text-slate-400 text-sm text-center py-4">אין רשומות מדדים בתקופה זו</p>
        )}
      </Card>
    </div>
  );
}

// ─── Insights Tab ─────────────────────────────────────────────────────────────

function InsightsTab({ insights }) {
  const coachFacts   = insights?.coach?.facts || [];
  const traineeFacts = insights?.trainee?.facts || [];

  if (coachFacts.length === 0 && traineeFacts.length === 0) {
    return (
      <div className="text-center py-12 text-slate-400">
        <Activity className="w-10 h-10 mx-auto mb-3 opacity-30" />
        <p>אין תובנות לתקופה זו — ייתכן שחסרים נתונים</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Coach insights */}
      <div>
        <p className="font-semibold text-slate-800 mb-3">תובנות למאמן</p>
        <div className="space-y-3">
          {coachFacts.map((f, i) => (
            <InsightCard key={i} insight={f} isCoach />
          ))}
          {coachFacts.length === 0 && <p className="text-slate-400 text-sm">אין תובנות לתקופה זו</p>}
        </div>
      </div>

      {/* Trainee insights */}
      <div>
        <p className="font-semibold text-slate-800 mb-3">תובנות למתאמן</p>
        <div className="space-y-3">
          {traineeFacts.map((f, i) => (
            <InsightCard key={i} insight={f} />
          ))}
          {traineeFacts.length === 0 && <p className="text-slate-400 text-sm">אין תובנות לתקופה זו</p>}
        </div>
        <p className="text-xs text-slate-400 mt-3">
          * תובנות מבוססות על ניתוח דטרמיניסטי של הנתונים הרשומים בלבד. אין שימוש בבינה מלאכותית לניסוח עובדות.
        </p>
      </div>
    </div>
  );
}

function InsightCard({ insight, isCoach = false }) {
  const sev   = insight.severity || 'info';
  const cls   = SEVERITY[sev] || SEVERITY.info;
  const dot   = SEVERITY_DOT[sev] || SEVERITY_DOT.info;
  const confLabel = isCoach ? CONFIDENCE_LABEL[insight.data_confidence] : null;

  return (
    <div className={`border rounded-lg p-3 ${cls}`}>
      <div className="flex gap-2 items-start">
        <div className={`w-2 h-2 rounded-full mt-1.5 flex-shrink-0 ${dot}`} />
        <div className="flex-1">
          <p className="text-sm">{isCoach ? insight.fact : insight.text}</p>
          {isCoach && confLabel && (
            <p className="text-xs opacity-70 mt-1">אמינות נתונים: {confLabel}</p>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function TraineeAnalytics() {
  const navigate = useNavigate();
  const params   = new URLSearchParams(window.location.search);
  const traineeId  = params.get('id');
  const fromEmail  = params.get('email');

  const [dateRange, setDateRange] = useState('7d');
  const [dateFrom,  setDateFrom]  = useState(nDaysAgoIL(6));
  const [dateTo,    setDateTo]    = useState(todayIL());
  const [activeTab, setActiveTab] = useState('summary');
  const [customFrom, setCustomFrom] = useState('');
  const [customTo,   setCustomTo]   = useState('');

  // Workout detail modal
  const [workoutModalId, setWorkoutModalId] = useState(null);

  const applyPreset = useCallback((preset) => {
    setDateRange(preset);
    const today = todayIL();
    if (preset === '7d')  { setDateFrom(nDaysAgoIL(6));   setDateTo(today); }
    if (preset === '30d') { setDateFrom(nDaysAgoIL(29));  setDateTo(today); }
    if (preset === '3m')  { setDateFrom(nDaysAgoIL(89));  setDateTo(today); }
  }, []);

  const applyCustom = useCallback(() => {
    if (customFrom && customTo && customFrom <= customTo) {
      setDateFrom(customFrom);
      setDateTo(customTo);
      setDateRange('custom');
    }
  }, [customFrom, customTo]);

  const { data, isLoading, isError, refetch, dataUpdatedAt } = useQuery({
    queryKey: ['traineeAnalytics', traineeId, dateFrom, dateTo],
    queryFn:  () => base44.functions.invoke('getTraineeAnalytics', {
      trainee_id:              traineeId,
      date_from:               dateFrom,
      date_to:                 dateTo,
      include_previous_period: true,
    }),
    enabled:    !!traineeId,
    staleTime:  2 * 60 * 1000,
    retry:      1,
  });

  const d          = data?.data;
  const traineeName = d?.trainee?.full_name || fromEmail || traineeId || '...';
  const lastUpdated = dataUpdatedAt ? format(new Date(dataUpdatedAt), 'HH:mm:ss') : null;

  const handleBackToProfile = () => {
    if (fromEmail)  navigate(`${createPageUrl('TraineeProfile')}?email=${encodeURIComponent(fromEmail)}`);
    else            navigate(createPageUrl('TraineeCard360'));
  };

  if (!traineeId) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50" dir="rtl">
        <div className="text-center p-8">
          <AlertCircle className="w-10 h-10 text-red-400 mx-auto mb-3" />
          <p className="text-slate-600">חסר מזהה מתאמן. חזור לפרופיל המתאמן.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 pb-20" dir="rtl">
      <div className="max-w-5xl mx-auto p-4 space-y-4">

        {/* Header */}
        <div className="bg-white rounded-xl shadow-sm p-4">
          <div className="flex items-center gap-3 mb-3">
            <Button variant="ghost" size="sm" onClick={handleBackToProfile} className="text-slate-600">
              <ArrowRight className="w-4 h-4 ml-1" />
              חזור לפרופיל
            </Button>
            <div className="flex-1">
              <h1 className="text-xl font-bold text-slate-800">{traineeName}</h1>
              <p className="text-xs text-slate-400">דשבורד ניתוח נתונים</p>
            </div>
            <Button variant="ghost" size="sm" onClick={() => refetch()} className="text-slate-500">
              <RefreshCw className="w-4 h-4" />
            </Button>
          </div>

          {/* Date range selector */}
          <div className="flex flex-wrap gap-2 items-end">
            {['7d','30d','3m'].map(p => (
              <Button
                key={p}
                size="sm"
                variant={dateRange === p ? 'default' : 'outline'}
                onClick={() => applyPreset(p)}
                style={dateRange === p ? { backgroundColor: '#0d9488' } : {}}
              >
                {p === '7d' ? '7 ימים' : p === '30d' ? '30 יום' : '3 חודשים'}
              </Button>
            ))}

            {/* Custom range */}
            <div className="flex gap-1 items-center">
              <input
                type="date" value={customFrom} onChange={e => setCustomFrom(e.target.value)}
                className="text-xs border rounded px-2 py-1.5 text-slate-600 h-8"
              />
              <span className="text-xs text-slate-400">—</span>
              <input
                type="date" value={customTo} onChange={e => setCustomTo(e.target.value)}
                className="text-xs border rounded px-2 py-1.5 text-slate-600 h-8"
              />
              <Button size="sm" variant="outline" onClick={applyCustom} className="h-8">
                <Calendar className="w-3 h-3 ml-1" />
                טווח
              </Button>
            </div>

            {lastUpdated && (
              <span className="text-xs text-slate-400 mr-auto">עודכן: {lastUpdated}</span>
            )}
          </div>

          <p className="text-xs text-slate-400 mt-2">
            {fmtDate(dateFrom)} — {fmtDate(dateTo)}
          </p>
        </div>

        {/* Loading */}
        {isLoading && (
          <div className="space-y-3">
            {[1,2,3].map(i => (
              <div key={i} className="h-24 bg-white rounded-xl animate-pulse" />
            ))}
          </div>
        )}

        {/* Error */}
        {isError && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-6 text-center">
            <AlertCircle className="w-8 h-8 text-red-400 mx-auto mb-2" />
            <p className="text-red-700 font-medium">שגיאה בטעינת נתוני המתאמן</p>
            <Button size="sm" className="mt-3" onClick={() => refetch()}>נסה שוב</Button>
          </div>
        )}

        {/* Content */}
        {d && (
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList className="grid w-full grid-cols-5 bg-white border rounded-xl overflow-hidden shadow-sm">
              <TabsTrigger value="summary"   className="text-xs md:text-sm">סיכום</TabsTrigger>
              <TabsTrigger value="nutrition" className="text-xs md:text-sm">תזונה</TabsTrigger>
              <TabsTrigger value="training"  className="text-xs md:text-sm">אימונים</TabsTrigger>
              <TabsTrigger value="progress"  className="text-xs md:text-sm">התקדמות</TabsTrigger>
              <TabsTrigger value="insights"  className="text-xs md:text-sm">תובנות</TabsTrigger>
            </TabsList>

            <TabsContent value="summary">
              <SummaryTab
                data={d}
                comparison={d.comparison}
                traineeId={traineeId}
                onViewWorkout={setWorkoutModalId}
              />
            </TabsContent>

            <TabsContent value="nutrition">
              <NutritionTab data={d} traineeId={traineeId} />
            </TabsContent>

            <TabsContent value="training">
              <TrainingTab data={d} traineeId={traineeId} onViewWorkout={setWorkoutModalId} />
            </TabsContent>

            <TabsContent value="progress">
              <ProgressTab data={d} />
            </TabsContent>

            <TabsContent value="insights">
              <InsightsTab insights={d.insights} />
            </TabsContent>
          </Tabs>
        )}
      </div>

      {/* Workout detail modal */}
      {workoutModalId && (
        <WorkoutDetailModal
          sessionId={workoutModalId}
          traineeId={traineeId}
          open={!!workoutModalId}
          onClose={() => setWorkoutModalId(null)}
        />
      )}
    </div>
  );
}
