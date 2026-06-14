import React from 'react';
import { Flame, Target, Clock, TrendingDown, Percent, HeartPulse } from 'lucide-react';

const KG_CALORIES = 7700;

const getWeekStart = () => {
  const now = new Date();
  const day = now.getDay();
  const diff = now.getDate() - day;
  const start = new Date(now.setDate(diff));
  start.setHours(0, 0, 0, 0);
  return start.toISOString().split('T')[0];
};

function MiniStat({ icon: Icon, label, value, color }) {
  return (
    <div className="bg-white/70 rounded-2xl p-3 flex-1 border border-white/80">
      <div className="flex items-center gap-1.5 mb-1">
        <Icon className="w-3.5 h-3.5" style={{ color }} />
        <span className="text-[11px] font-medium text-slate-500">{label}</span>
      </div>
      <p className="text-base font-bold text-slate-800 leading-tight">{value}</p>
    </div>
  );
}

export default function CalorieDeficitMotivationCard({ totals, allMeals, targets, trainee, measurements, caloriesBurned, includesBurned }) {
  if (!trainee || trainee.goal !== 'lose') return null;

  const targetCalories = Number(targets?.calories || trainee.target_calories || 0);
  if (!targetCalories) return null;

  const todayNet = Math.max(0, (totals?.calories || 0) - (includesBurned ? (caloriesBurned || 0) : 0));
  const todayDeficit = Math.max(0, Math.round(targetCalories - todayNet));
  const weekStart = getWeekStart();
  const weekMeals = (allMeals || []).filter(meal => meal?.date >= weekStart);
  const weekCalories = weekMeals.reduce((sum, meal) => sum + (meal?.calories || 0), 0);
  const activeDays = Math.max(1, new Set(weekMeals.map(meal => meal.date)).size);
  const weeklyDeficit = Math.max(0, Math.round((targetCalories * activeDays) - weekCalories));
  const weeklyKg = weeklyDeficit / KG_CALORIES;

  const sortedMeasurements = [...(measurements || [])].sort((a, b) => new Date(a.date || a.created_date) - new Date(b.date || b.created_date));
  const startWeight = sortedMeasurements[0]?.weight_kg || trainee.weight_kg;
  const currentWeight = sortedMeasurements[sortedMeasurements.length - 1]?.weight_kg || trainee.weight_kg || startWeight;
  const goalChangeKg = Number(trainee.goal_weight_change_kg || 0);
  const targetWeight = trainee.target_weight_kg || (startWeight && goalChangeKg ? startWeight - goalChangeKg : null);
  const remainingKg = targetWeight && currentWeight ? Math.max(0, currentWeight - targetWeight) : null;
  const weeklyPaceKg = weeklyKg > 0 ? weeklyKg : 0;
  const weeksLeft = remainingKg !== null && weeklyPaceKg > 0 ? Math.ceil(remainingKg / weeklyPaceKg) : null;
  const achievedKg = goalChangeKg > 0 && remainingKg !== null ? Math.max(0, goalChangeKg - remainingKg) : Math.max(0, startWeight - currentWeight);
  const goalProgressPct = goalChangeKg > 0 ? Math.min(100, Math.round((achievedKg / goalChangeKg) * 100)) : 0;
  const firstMeasurement = sortedMeasurements[0] || {};
  const latestMeasurement = sortedMeasurements[sortedMeasurements.length - 1] || {};
  const fatDrop = Number(firstMeasurement.body_fat_percent) && Number(latestMeasurement.body_fat_percent)
    ? Number(firstMeasurement.body_fat_percent) - Number(latestMeasurement.body_fat_percent)
    : 0;
  const bodyAgeDrop = Number(firstMeasurement.body_age_years) && Number(latestMeasurement.body_age_years)
    ? Number(firstMeasurement.body_age_years) - Number(latestMeasurement.body_age_years)
    : 0;
  const motivationWins = [
    achievedKg > 0.1 ? { icon: TrendingDown, label: 'ירדת עד כה', value: `${achievedKg.toFixed(1)} ק״ג`, color: '#10b981' } : null,
    fatDrop > 0.1 ? { icon: Percent, label: 'אחוז שומן', value: `-${fatDrop.toFixed(1)}%`, color: '#8b5cf6' } : null,
    bodyAgeDrop > 0.1 ? { icon: HeartPulse, label: 'גיל גוף', value: `-${bodyAgeDrop.toFixed(0)} שנים`, color: '#ec4899' } : null,
  ].filter(Boolean);

  return (
    <div className="rounded-3xl p-4 mb-4 bg-gradient-to-br from-orange-50 via-amber-50 to-white border-2 border-orange-100 shadow-sm">
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="flex items-center gap-2">
          <div className="w-10 h-10 rounded-2xl bg-orange-100 flex items-center justify-center">
            <Flame className="w-5 h-5 text-orange-500" />
          </div>
          <div>
            <p className="text-sm font-bold text-slate-800">מנוע הירידה שלך</p>
            <p className="text-xs text-slate-500">כמה הגירעון מקרב אותך ליעד</p>
          </div>
        </div>
        <div className="text-left">
          <p className="text-2xl font-black text-orange-500">{todayDeficit}</p>
          <p className="text-[11px] text-slate-400">קק״ל היום</p>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2 mb-3">
        <MiniStat icon={TrendingDown} label="השבוע" value={`${weeklyDeficit} קק״ל`} color="#f97316" />
        <MiniStat icon={Target} label="שווה בערך" value={`${weeklyKg.toFixed(2)} ק״ג`} color="#10b981" />
        <MiniStat icon={Clock} label="זמן ליעד" value={weeksLeft ? `${weeksLeft} שבועות` : 'יעודכן'} color="#3b82f6" />
      </div>

      {motivationWins.length > 0 && (
        <div className="mb-3 rounded-2xl p-3 bg-white/80 border border-emerald-100">
          <p className="text-xs font-bold text-slate-700 mb-2">הניצחונות שלך מהמדדים</p>
          <div className="grid grid-cols-3 gap-2">
            {motivationWins.map((win) => (
              <MiniStat key={win.label} icon={win.icon} label={win.label} value={win.value} color={win.color} />
            ))}
          </div>
        </div>
      )}

      {remainingKg !== null && (
        <div className="bg-white/80 rounded-2xl p-3 border border-orange-100">
          <div className="flex justify-between text-xs text-slate-500 mb-2">
            <span>נשארו ליעד</span>
            <span className="font-bold text-slate-800">{remainingKg.toFixed(1)} ק״ג</span>
          </div>
          <div className="h-2 bg-orange-100 rounded-full overflow-hidden">
            <div
              className="h-full rounded-full bg-gradient-to-r from-orange-400 to-emerald-400 transition-all"
              style={{ width: `${goalProgressPct}%` }}
            />
          </div>
        </div>
      )}
    </div>
  );
}