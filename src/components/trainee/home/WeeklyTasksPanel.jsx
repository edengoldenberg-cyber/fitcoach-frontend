import React, { useState } from 'react';
import { CheckCircle2, Circle, Target, ChevronDown, ChevronUp } from 'lucide-react';

const DAYS = ['א', 'ב', 'ג', 'ד', 'ה', 'ו', 'ש'];
const DAY_NAMES = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת'];

function getTodayIndex() {
  const d = new Date().getDay();
  return d; // 0=Sun
}

function getIsraelDateString(date = new Date()) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Jerusalem',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).format(date);
}

function getWeekDays() {
  const today = new Date();
  const dayOfWeek = today.getDay();
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(today);
    d.setDate(today.getDate() - dayOfWeek + i);
    return getIsraelDateString(d);
  });
}

export default function WeeklyTasksPanel({ meals = [], water = [], workouts = [], trainee }) {
  const [expanded, setExpanded] = useState(false);
  const weekDays = getWeekDays();
  const todayIdx = getTodayIndex();

  const targets = {
    calories: trainee?.target_calories ?? 2000,
    water: trainee?.target_water_ml ?? 3000,
    protein: trainee?.target_protein ?? 150,
  };

  const goal = trainee?.goal || 'maintain'; // 'lose' | 'maintain' | 'gain'

  const weekStats = weekDays.map((date, i) => {
    const dayMeals = meals.filter(m => m.date === date);
    const dayWater = water.filter(w => w.date === date);
    const dayWorkouts = workouts.filter(w => w.date === date);

    const calories = dayMeals.reduce((sum, m) => sum + (m.calories || 0), 0);
    const waterMl = dayWater.reduce((sum, w) => sum + (w.amount_ml || 0), 0);
    const protein = dayMeals.reduce((sum, m) => sum + (m.protein || 0), 0);

    const hasNutrition = dayMeals.length > 0;
    const hasWater = waterMl >= targets.water * 0.7;
    const hasWorkout = dayWorkouts.length > 0;
    const hasTwoWorkouts = dayWorkouts.length >= 2;

    // Dynamic task list based on goal
    const taskResults = {
      nutrition: hasNutrition,
      water: hasWater,
      workout: hasWorkout,
      ...(goal === 'lose' && { calorie_deficit: calories > 0 && calories <= targets.calories }),
      ...(goal === 'gain' && { two_workouts: hasTwoWorkouts }),
    };

    const score = Object.values(taskResults).filter(Boolean).length;
    const maxScore = Object.keys(taskResults).length;

    return {
      date,
      dayLabel: DAYS[i],
      dayName: DAY_NAMES[i],
      isToday: i === todayIdx,
      isPast: i < todayIdx,
      isFuture: i > todayIdx,
      ...taskResults,
      score,
      maxScore,
      calories: Math.round(calories),
      waterMl: Math.round(waterMl),
      protein: Math.round(protein),
      workoutCount: dayWorkouts.length,
    };
  });

  const todayMaxScore = weekStats[todayIdx]?.maxScore || 1;
  const completedDays = weekStats.filter(d => d.isPast || d.isToday).filter(d => d.score === d.maxScore).length;
  const totalPastDays = weekStats.filter(d => d.isPast || d.isToday).length;
  const weekScore = totalPastDays > 0 ? Math.round((completedDays / totalPastDays) * 100) : 0;

  // Build task list dynamically
  const tasks = [
    { id: 'nutrition', label: 'תיעוד תזונה', icon: '🥗',
      description: 'לפחות מוצר / ארוחה אחת מתועדת היום' },
    { id: 'water', label: 'שתיית מים', icon: '💧',
      description: `70%+ מיעד המים (${targets.water} מ"ל)` },
    { id: 'workout', label: 'אימון יומי', icon: '💪',
      description: 'לפחות אימון אחד ביום' },
    ...(goal === 'lose' ? [{ id: 'calorie_deficit', label: 'גירעון קלורי', icon: '📉',
      description: `נשאר מתחת ל-${targets.calories} קק"ל` }] : []),
    ...(goal === 'gain' ? [{ id: 'two_workouts', label: '2 אימונים', icon: '🏋️',
      description: 'שני אימונים ביום לגדילה' }] : []),
  ];

  const todayStats = weekStats[todayIdx];

  return (
    <div className="rounded-2xl overflow-hidden mb-4" style={{ background: 'linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%)' }}>
      {/* Header */}
      <div className="p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Target className="w-5 h-5 text-teal-400" />
            <h3 className="font-bold text-white text-base">לוח יעדים שבועי</h3>
          </div>
          <div className="flex items-center gap-2">
            <div className="bg-teal-500/20 rounded-full px-3 py-1">
              <span className="text-teal-300 text-sm font-bold">{weekScore}%</span>
            </div>
            <button onClick={() => setExpanded(!expanded)} className="text-slate-400 hover:text-white transition-colors">
              {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            </button>
          </div>
        </div>

        {/* Week Days Row */}
        <div className="grid grid-cols-7 gap-1">
          {weekStats.map((day, i) => (
            <div key={day.date} className="flex flex-col items-center gap-1">
              <span className={`text-xs font-medium ${day.isToday ? 'text-teal-400' : 'text-slate-500'}`}>
                {day.dayLabel}
              </span>
              <div
                className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold border-2 transition-all
                  ${day.isToday ? 'border-teal-400 bg-teal-400/20 text-teal-300 scale-110' :
                    day.score === day.maxScore && (day.isPast || day.isToday) ? 'border-emerald-400 bg-emerald-400/20 text-emerald-300' :
                    day.score > 0 && day.isPast ? 'border-amber-400 bg-amber-400/20 text-amber-300' :
                    day.isPast ? 'border-red-400/40 bg-red-400/10 text-red-400/60' :
                    'border-slate-600 bg-slate-800/50 text-slate-600'
                  }`}
              >
                {day.score === day.maxScore && (day.isPast || day.isToday) ? '✓' :
                 day.isFuture ? '' : day.score}
              </div>
              {/* Mini dots for tasks */}
              <div className="flex gap-0.5 flex-wrap justify-center max-w-[36px]">
                {tasks.map((task) => (
                  <div
                    key={task.id}
                    className={`w-1 h-1 rounded-full ${
                      day[task.id] ? 'bg-teal-400' : day.isFuture ? 'bg-slate-700' : 'bg-slate-600'
                    }`}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Today's Tasks */}
      <div className="px-4 pb-4">
        <div className="bg-white/5 rounded-xl p-3">
          <div className="flex items-center justify-between mb-2">
            <p className="text-slate-400 text-xs font-medium">משימות היום</p>
            <p className="text-xs text-teal-300 font-bold">{todayStats?.score || 0}/{todayMaxScore}</p>
          </div>
          <div className="space-y-2">
            {tasks.map((task) => {
              const done = todayStats?.[task.id] || false;
              return (
                <div key={task.id} className="flex items-center gap-3">
                  {done ? (
                    <CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0" />
                  ) : (
                    <Circle className="w-4 h-4 text-slate-500 flex-shrink-0" />
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="text-sm">{task.icon}</span>
                      <span className={`text-sm ${done ? 'text-emerald-300' : 'text-slate-300'}`}>{task.label}</span>
                    </div>
                    <p className="text-xs text-slate-500 truncate">{task.description}</p>
                  </div>
                  {done && <span className="text-xs text-emerald-400 flex-shrink-0">✓</span>}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Expanded Details */}
      {expanded && (
        <div className="border-t border-white/10 px-4 py-3">
          <p className="text-slate-400 text-xs mb-3 font-medium">פירוט שבועי</p>
          <div className="space-y-2">
            {weekStats.filter(d => d.isPast || d.isToday).map((day) => (
              <div key={day.date} className="flex items-center gap-3 bg-white/5 rounded-lg px-3 py-2">
                <span className={`text-xs font-medium w-12 ${day.isToday ? 'text-teal-400' : 'text-slate-400'}`}>
                  {day.isToday ? 'היום' : day.dayName}
                </span>
                <div className="flex gap-2 flex-1">
                  <span className={`text-xs px-2 py-0.5 rounded-full ${day.hasNutrition ? 'bg-emerald-400/20 text-emerald-300' : 'bg-slate-700 text-slate-500'}`}>🥗</span>
                  <span className={`text-xs px-2 py-0.5 rounded-full ${day.hasWater ? 'bg-blue-400/20 text-blue-300' : 'bg-slate-700 text-slate-500'}`}>💧</span>
                  <span className={`text-xs px-2 py-0.5 rounded-full ${day.hasWorkout ? 'bg-purple-400/20 text-purple-300' : 'bg-slate-700 text-slate-500'}`}>💪</span>
                </div>
                <span className={`text-xs font-bold ${day.score === day.maxScore ? 'text-emerald-400' : day.score > 0 ? 'text-amber-400' : 'text-red-400/60'}`}>
                  {day.score}/{day.maxScore}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}