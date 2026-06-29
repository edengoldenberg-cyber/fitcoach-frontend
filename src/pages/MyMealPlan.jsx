import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import MacroWheels from '@/components/mealplan/MacroWheels';
import MealItemRow from '@/components/mealplan/MealItemRow';
import MealFeedbackChat from '@/components/mealplan/MealFeedbackChat';
import { Button } from '@/components/ui/button';
import { ChevronRight, ChevronDown, ChevronUp, RefreshCw, Sparkles, Loader2, Calendar, Sun, MapPin } from 'lucide-react';

const DAY_NAMES = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת'];

function MealCard({ meal, mealIndex, planId, onMealUpdated, dayIndex }) {
  const [expanded, setExpanded] = useState(true);

  const mealName = meal.meal_name || '';
  const emoji = mealName.includes('בוקר') ? '🌅' :
    mealName.includes('צהר') ? '☀️' :
    mealName.includes('ערב') ? '🌙' :
    mealName.includes('אמצע') ? '🍎' : '🍽️';

  return (
    <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
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

const DAY_NAMES_FALLBACK = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת'];

function DayView({ day, dayIndex, planId, onRefresh }) {
  const handleMealUpdated = () => onRefresh();
  const dayName = day.day_name && day.day_name !== 'null' ? day.day_name : DAY_NAMES_FALLBACK[dayIndex] || `יום ${dayIndex + 1}`;

  const meals = Array.isArray(day.meals) ? day.meals : [];
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
      {day.meals?.map((meal, idx) => (
        <MealCard
          key={idx}
          meal={meal}
          mealIndex={idx}
          dayIndex={dayIndex}
          planId={planId}
          onMealUpdated={onRefresh}
        />
      ))}
      <MealFeedbackChat planId={planId} dayIndex={dayIndex} onPlanUpdated={onRefresh} />
    </div>
  );
}

export default function MyMealPlan() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [selectedDay, setSelectedDay] = useState(0);
  const [generatingWeekly, setGeneratingWeekly] = useState(false);

  const { data: user } = useQuery({ queryKey: ['currentUser'], queryFn: () => base44.auth.me() });
  const { data: traineeList } = useQuery({
    queryKey: ['wizard_trainee', user?.id, user?.email],
    queryFn: async () => {
      if (!user) return [];
      // Primary: lookup by user_id (works once invite link has been consumed)
      try {
        const byId = await base44.entities.Trainee.filter({ user_id: user.id });
        if (byId?.length) return byId;
      } catch { /* ignore */ }
      // Fallback: lookup by email (works for trainees whose user_id isn't linked yet)
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

  const { data: prefsList } = useQuery({
    queryKey: ['mealPrefs', trainee?.id],
    queryFn: () => base44.entities.MealPlanPreferences.filter({ trainee_id: trainee?.id }),
    enabled: !!trainee?.id,
  });
  const prefs = prefsList?.[0];

  const { data: plan, isLoading, refetch } = useQuery({
    queryKey: ['activeMealPlan', trainee?.id],
    queryFn: async () => {
      if (!trainee?.id) return null;
      const plans = await base44.entities.PersonalMealPlan.filter({ trainee_id: trainee.id, is_active: true });
      const raw = plans[0];
      if (!raw) return null;
      // meals and weekly_days are stored as JSON strings in the DB — parse them here.
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

  const generateWeekly = async () => {
    if (!trainee) return;
    setGeneratingWeekly(true);

    // Fire-and-forget — server generates the plan asynchronously
    base44.functions.invoke('generateWeeklyMealPlan', {
      trainee_id: trainee.id,
      trainee_email: trainee.user_email,
    }).catch(() => {});

    // Poll every 4s for up to 90s (increased from 60s to allow for longer AI calls)
    let attempts = 0;
    const maxAttempts = 22; // 22 × 4s = 88s
    const poll = setInterval(async () => {
      attempts++;
      try {
        const plans = await base44.entities.PersonalMealPlan.filter({ trainee_id: trainee.id, is_active: true });
        const weeklyPlan = plans.find(p => {
          const days = typeof p.weekly_days === 'string' ? (() => { try { return JSON.parse(p.weekly_days || '[]'); } catch { return []; } })() : (p.weekly_days || []);
          return p.is_weekly && Array.isArray(days) && days.length >= 7;
        });
        if (weeklyPlan || attempts >= maxAttempts) {
          clearInterval(poll);
          try {
            await queryClient.invalidateQueries({ queryKey: ['activeMealPlan', trainee?.id] });
            await refetch();
            setSelectedDay(0);
          } catch { /* ignore refresh errors */ } finally {
            setGeneratingWeekly(false);
          }
        }
      } catch {
        if (attempts >= maxAttempts) {
          clearInterval(poll);
          setGeneratingWeekly(false);
        }
      }
    }, 3000);
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
        <Button onClick={() => navigate('/MealPlanWizard')}
          className="gap-2 text-white font-bold px-8"
          style={{ backgroundColor: '#79DBD6' }}>
          <Sparkles className="w-5 h-5" />
          בנה תפריט אישי
        </Button>
      </div>
    );
  }

  const isWeekly = plan.is_weekly && plan.weekly_days?.length > 0;
  const currentDay = isWeekly ? plan.weekly_days[selectedDay] : null;
  const todayDayOfWeek = new Date().getDay(); // 0=Sun

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
          <button onClick={() => navigate('/MealPlanWizard')}
            className="p-2 rounded-full hover:bg-slate-100" title="הגדרות תפריט">
            <RefreshCw className="w-4 h-4 text-slate-500" />
          </button>
        </div>
      </div>

      <div className="max-w-lg mx-auto px-4 py-4 space-y-4">

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
              borderColor: '#79DBD6'
            }}
          >
            {generatingWeekly ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Calendar className="w-3.5 h-3.5" />}
            {generatingWeekly ? 'מכין תפריט שבועי...' : isWeekly ? 'תפריט שבועי ✓' : 'צור תפריט שבועי'}
          </button>
        </div>

        {/* Weekly day tabs */}
        {isWeekly && (
          <div className="flex gap-1 overflow-x-auto pb-1 -mx-1 px-1">
            {plan.weekly_days.map((day, idx) => {
              const isToday = idx === todayDayOfWeek;
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
                    border: `1.5px solid ${isSelected ? '#79DBD6' : isToday ? '#b2f5ea' : '#e2e8f0'}`
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
          />
        ) : (
          <>
            {/* Single day view */}
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
                />
              ))}
            </div>

            <MealFeedbackChat planId={plan.id} dayIndex={0} onPlanUpdated={handleRefresh} />
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
  );
}