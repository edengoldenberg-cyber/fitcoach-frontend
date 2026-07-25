import React, { useMemo } from 'react';
import {
  LineChart, Line, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LabelList,
} from 'recharts';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { TrendingUp, Calendar, Zap, Activity, AlertCircle, Loader2, WifiOff } from 'lucide-react';

// Minimum meals in the last 30 days required for meaningful analytics.
const MIN_MEALS = 3;

function dateCutoff(daysAgo) {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  return d.toISOString().slice(0, 10); // "YYYY-MM-DD"
}

// Canonical food-name extraction: items[].food_name (relation) → food_name (scalar).
function collectFoodNames(meal, acc) {
  if (meal.items && Array.isArray(meal.items) && meal.items.length > 0) {
    meal.items.forEach(item => {
      const name = item.food_name || 'לא ידוע';
      acc[name] = (acc[name] || 0) + 1;
    });
  } else if (meal.food_name) {
    acc[meal.food_name] = (acc[meal.food_name] || 0) + 1;
  }
}

/**
 * Props:
 *   meals     — MealEntry[] (canonical fields: date, food_name, items, calories, protein, carbs, fat, created_at)
 *   workouts  — WorkoutSession[]
 *   isLoading — combined loading state from TraineeLearningAnalytics
 *   isError   — true if any query failed
 *   error     — first Error object
 */
export default function TraineeAdvancedLearningDashboard({
  trainee: _trainee,
  meals    = [],
  workouts = [],
  isLoading = false,
  isError   = false,
  error     = null,
}) {
  const COLORS = ['#79DBD6', '#5BC5C0', '#ef4444', '#f59e0b', '#10b981'];

  // ─── useMemo must be first — hooks cannot be called after conditional returns ─
  const { stats, computeError } = useMemo(() => {
    if (!meals.length) return { stats: null, computeError: null };

    try {
      const cutoff30 = dateCutoff(30);

      // Canonical date field: m.date ("YYYY-MM-DD")
      const last30 = meals.filter(m => m.date && m.date >= cutoff30);

      // Daily calorie map grouped by date
      const dailyCalMap = {};
      last30.forEach(m => {
        dailyCalMap[m.date] = (dailyCalMap[m.date] || 0) + (m.calories || 0);
      });

      const caloriesTrend = Object.entries(dailyCalMap)
        .sort(([a], [b]) => a.localeCompare(b))
        .slice(-14)
        .map(([date, calories]) => ({
          date: date.slice(5).replace('-', '/'),
          calories: Math.round(calories),
        }));

      // Food frequency — canonical: items[].food_name then food_name
      const foodCounts = {};
      last30.forEach(m => collectFoodNames(m, foodCounts));
      const topFoods = Object.entries(foodCounts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 8)
        .map(([name, count]) => ({ name, value: count }));

      // Macro totals
      const totalCal  = last30.reduce((s, m) => s + (m.calories || 0), 0);
      const totalProt = last30.reduce((s, m) => s + (m.protein  || 0), 0);
      const totalCarb = last30.reduce((s, m) => s + (m.carbs    || 0), 0);
      const totalFat  = last30.reduce((s, m) => s + (m.fat      || 0), 0);

      const daysLogged = new Set(last30.map(m => m.date)).size;

      const avgDaily = daysLogged > 0 ? {
        calories: Math.round(totalCal  / daysLogged),
        protein:  Math.round(totalProt / daysLogged),
        carbs:    Math.round(totalCarb / daysLogged),
        fat:      Math.round(totalFat  / daysLogged),
      } : null;

      const macroPercentages = avgDaily && avgDaily.calories > 0 ? {
        protein: Math.round((avgDaily.protein * 4 / avgDaily.calories) * 100),
        carbs:   Math.round((avgDaily.carbs   * 4 / avgDaily.calories) * 100),
        fat:     Math.round((avgDaily.fat     * 9 / avgDaily.calories) * 100),
      } : null;

      // Meal time-of-day pattern via created_at (ISO timestamp); fallback to meal_type
      const mealsByTime = {};
      last30.forEach(m => {
        let slot = null;
        if (m.created_at) {
          const h = new Date(m.created_at).getHours();
          slot = h < 12 ? 'בוקר' : h < 17 ? 'צהריים' : 'ערב';
        } else if (m.meal_type) {
          const t = String(m.meal_type).toLowerCase();
          slot = t.includes('breakfast') || t.includes('בוקר') ? 'בוקר'
               : t.includes('lunch')    || t.includes('צהריים') ? 'צהריים'
               : 'ערב';
        }
        if (slot) mealsByTime[slot] = (mealsByTime[slot] || 0) + 1;
      });

      return {
        stats: {
          caloriesTrend,
          topFoods,
          avgDaily,
          macroPercentages,
          mealsByTime,
          daysLogged,
          consistency:   daysLogged > 0 ? Math.round((daysLogged / 30) * 100) : 0,
          missingDays:   30 - daysLogged,
          totalIn30:     last30.length,
          totalWorkouts: workouts.length,
        },
        computeError: null,
      };
    } catch (err) {
      console.error('[TraineeAdvancedLearningDashboard] computation error:', err);
      return { stats: null, computeError: err.message || String(err) };
    }
  }, [meals, workouts]);

  // ─── Loading ────────────────────────────────────────────────────────────────
  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-3 text-slate-400">
        <Loader2 className="w-8 h-8 animate-spin text-teal-500" />
        <p className="text-sm">טוען נתוני למידה...</p>
      </div>
    );
  }

  // ─── API / network error ────────────────────────────────────────────────────
  if (isError) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-lg p-8 text-center space-y-2">
        <WifiOff className="w-9 h-9 mx-auto text-red-400" />
        <p className="font-semibold text-red-700">שגיאה בטעינת נתוני הלמידה</p>
        <p className="text-sm text-red-500">
          {error?.message || 'אירעה שגיאת שרת. נסה לרענן את הדף.'}
        </p>
      </div>
    );
  }

  // ─── Computation error ──────────────────────────────────────────────────────
  if (computeError) {
    return (
      <div className="bg-amber-50 border border-amber-200 rounded-lg p-8 text-center space-y-2">
        <AlertCircle className="w-9 h-9 mx-auto text-amber-400" />
        <p className="font-semibold text-amber-700">שגיאת חישוב פנימית</p>
        <p className="text-xs text-amber-600 font-mono break-all">{computeError}</p>
      </div>
    );
  }

  // ─── Insufficient data ──────────────────────────────────────────────────────
  const cutoff30 = dateCutoff(30);
  const recentCount = meals.filter(m => m.date && m.date >= cutoff30).length;

  if (!stats || !stats.avgDaily || recentCount < MIN_MEALS) {
    return (
      <div className="bg-slate-50 border border-slate-200 rounded-lg p-10 text-center space-y-2">
        <AlertCircle className="w-10 h-10 mx-auto text-slate-300" />
        <p className="font-semibold text-slate-600">אין מספיק נתונים לניתוח מפורט</p>
        <p className="text-sm text-slate-400">
          {recentCount === 0
            ? 'לא נרשמו ארוחות ב-30 הימים האחרונים'
            : `נרשמו ${recentCount} ארוחות ב-30 הימים האחרונים — נדרשות לפחות ${MIN_MEALS}`}
        </p>
      </div>
    );
  }

  // ─── Full analytics render ──────────────────────────────────────────────────

  return (
    <div className="space-y-6" dir="rtl">
      {/* KPI row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="bg-blue-50 rounded-xl p-4">
          <div className="text-xs text-slate-500 mb-1">ממוצע קלוריות</div>
          <div className="text-2xl font-bold text-blue-700">{stats.avgDaily.calories}</div>
          <div className="text-xs text-slate-400 mt-1">קל׳ ליום (ממוצע ימי רישום)</div>
        </div>
        <div className="bg-green-50 rounded-xl p-4">
          <div className="text-xs text-slate-500 mb-1">קונסיסטנציה</div>
          <div className="text-2xl font-bold text-green-700">{stats.consistency}%</div>
          <div className="text-xs text-slate-400 mt-1">{stats.daysLogged}/30 ימים</div>
        </div>
        <div className="bg-purple-50 rounded-xl p-4">
          <div className="text-xs text-slate-500 mb-1">אימונים</div>
          <div className="text-2xl font-bold text-purple-700">{stats.totalWorkouts}</div>
          <div className="text-xs text-slate-400 mt-1">סה״כ בחודש</div>
        </div>
        <div className="bg-amber-50 rounded-xl p-4">
          <div className="text-xs text-slate-500 mb-1">ימים ללא רישום</div>
          <div className="text-2xl font-bold text-amber-700">{stats.missingDays}</div>
          <div className="text-xs text-slate-400 mt-1">מ-30 ימים</div>
        </div>
      </div>

      {/* Calorie trend */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <TrendingUp className="w-4 h-4" />
            מגמת קלוריות — 14 ימים אחרונים
          </CardTitle>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={260}>
            <LineChart data={stats.caloriesTrend} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
              <XAxis dataKey="date" fontSize={11} tickLine={false} />
              <YAxis fontSize={11} tickLine={false} axisLine={false} width={45} />
              <Tooltip formatter={(v) => [`${v} קל׳`, 'קלוריות']} labelStyle={{ direction: 'rtl' }} />
              <Line type="monotone" dataKey="calories" stroke="#79DBD6" strokeWidth={2} dot={{ fill: '#79DBD6', r: 3 }} activeDot={{ r: 5 }} />
            </LineChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      {/* Macro breakdown */}
      {stats.macroPercentages && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">התפלגות מאקרו (ממוצע ליום רישום)</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div>
                <ResponsiveContainer width="100%" height={180}>
                  <PieChart>
                    <Pie
                      data={[
                        { name: 'חלבון',    value: stats.macroPercentages.protein },
                        { name: 'פחמימות', value: stats.macroPercentages.carbs   },
                        { name: 'שומן',    value: stats.macroPercentages.fat     },
                      ]}
                      cx="50%" cy="50%" innerRadius={36} outerRadius={70} paddingAngle={2} dataKey="value"
                    >
                      {[0, 1, 2].map(i => <Cell key={i} fill={COLORS[i]} />)}
                    </Pie>
                    <Tooltip formatter={(v) => [`${v}%`]} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="col-span-1 md:col-span-2 space-y-3 flex flex-col justify-center">
                {[
                  { label: 'חלבון',    g: stats.avgDaily.protein, pct: stats.macroPercentages.protein, bar: 'bg-[#79DBD6]', txt: 'text-[#3db8b2]' },
                  { label: 'פחמימות', g: stats.avgDaily.carbs,   pct: stats.macroPercentages.carbs,   bar: 'bg-[#5BC5C0]', txt: 'text-[#3da8a3]' },
                  { label: 'שומן',    g: stats.avgDaily.fat,     pct: stats.macroPercentages.fat,     bar: 'bg-[#ef4444]', txt: 'text-red-600'   },
                ].map(({ label, g, pct, bar, txt }) => (
                  <div key={label}>
                    <div className="flex justify-between items-center mb-1">
                      <span className="text-sm font-medium">{label}</span>
                      <span className={`text-sm font-bold ${txt}`}>{g}ג׳ ({pct}%)</span>
                    </div>
                    <div className="w-full bg-slate-100 rounded-full h-2">
                      <div className={`${bar} h-2 rounded-full`} style={{ width: `${Math.min(pct, 100)}%` }} />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Top foods */}
      {stats.topFoods.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Zap className="w-4 h-4" />
              מאכלים נפוצים ביותר
            </CardTitle>
            <CardDescription>30 ימים אחרונים — לפי תדירות רישום</CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={stats.topFoods} margin={{ top: 16, right: 10, left: 0, bottom: 60 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis dataKey="name" fontSize={11} angle={-40} textAnchor="end" height={70} />
                <YAxis fontSize={11} tickLine={false} axisLine={false} width={30} />
                <Tooltip formatter={(v) => [`${v} פעמים`, 'תדירות']} />
                <Bar dataKey="value" fill="#79DBD6" radius={[3, 3, 0, 0]}>
                  <LabelList dataKey="value" position="top" style={{ fontSize: 11, fill: '#475569' }} />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

      {/* Eating patterns */}
      {Object.keys(stats.mealsByTime).length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Calendar className="w-4 h-4" />
              דפוסי אכילה לפי שעה
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-3 gap-4">
              {Object.entries(stats.mealsByTime).map(([slot, count]) => (
                <div key={slot} className="bg-slate-50 rounded-xl p-4 text-center">
                  <div className="text-sm text-slate-500 mb-1">{slot}</div>
                  <div className="text-3xl font-bold text-teal-600">{count}</div>
                  <div className="text-xs text-slate-400 mt-1">ארוחות</div>
                </div>
              ))}
            </div>
            <div className="mt-4 p-3 bg-blue-50 rounded-lg text-sm text-blue-800 flex items-center gap-2">
              <Activity className="w-4 h-4 flex-shrink-0" />
              <span>הכי פעיל ב<strong>{Object.entries(stats.mealsByTime).sort((a, b) => b[1] - a[1])[0]?.[0]}</strong></span>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Learning summary */}
      <Card className="bg-gradient-to-r from-teal-50 to-blue-50">
        <CardHeader>
          <CardTitle className="text-base">סיכום למידת המערכת</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm text-slate-700">
          <p>
            <strong>פרופיל תזונה:</strong> ממוצע {stats.avgDaily.calories} קל׳ ליום (מחושב על {stats.daysLogged} ימי רישום מתוך 30).
          </p>
          <p>
            <strong>דפוס עקביות:</strong> {stats.consistency}% — {
              stats.consistency > 75 ? 'עקביות גבוהה' :
              stats.consistency > 50 ? 'עקביות בינונית' :
              'צורך בשיפור עקביות'
            }.
          </p>
          {stats.topFoods.length >= 2 && (
            <p><strong>העדפות מזון:</strong> חוזר על {stats.topFoods[0].name} ו-{stats.topFoods[1].name}.</p>
          )}
          <p>
            <strong>שיפור מומלץ:</strong> {stats.missingDays > 10 ? 'הגברת תדירות הרישום' : 'שיפור איכות ועקביות הרישומים'}.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
