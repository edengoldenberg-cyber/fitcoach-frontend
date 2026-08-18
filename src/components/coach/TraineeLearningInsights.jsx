import React from 'react';
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Lightbulb, Utensils, Dumbbell, TrendingUp, ChevronRight } from "lucide-react";
import { useNavigate } from 'react-router-dom';
import { nutritionRecordMatchesTrainee } from '@/utils/nutritionSync';

// ── Evidence thresholds ───────────────────────────────────────────────────────
// MIN_LOGGED_DAYS_FOR_AVG: require at least this many days with meal logs
//   before showing an average. Below this we say "אין מספיק מידע".
// MIN_FOOD_OCCURRENCES: a food must appear at least twice to be called "favorite".
const MIN_LOGGED_DAYS_FOR_AVG  = 3;
const MIN_FOOD_OCCURRENCES     = 2;

export default function TraineeLearningInsights({ trainee, meals = [], workouts = [] }) {
  const navigate = useNavigate();
  if (!trainee) return null;

  // Filter for this trainee — meals prop is now allMeals (recent 7 days, all trainees)
  const recentMeals    = meals.filter(m => nutritionRecordMatchesTrainee(m, trainee));
  const recentWorkouts = workouts.filter(w => w.trainee_email === trainee.user_email);

  // ── Average daily calories per LOGGED day (not per calendar day) ─────────
  // Denominator = distinct dates with at least one meal record.
  // Requires MIN_LOGGED_DAYS_FOR_AVG days of logs for reliability.
  const caloriesByDay = {};
  recentMeals.forEach(m => {
    if (m.date) {
      caloriesByDay[m.date] = (caloriesByDay[m.date] || 0) + (m.calories || 0);
    }
  });
  const loggedDays  = Object.keys(caloriesByDay).length;
  const avgCalories = loggedDays >= MIN_LOGGED_DAYS_FOR_AVG
    ? Math.round(Object.values(caloriesByDay).reduce((a, b) => a + b, 0) / loggedDays)
    : null;

  // ── Average macros per LOGGED day ────────────────────────────────────────
  const proteinByDay = {};
  const carbsByDay   = {};
  const fatByDay     = {};
  recentMeals.forEach(m => {
    if (!m.date) return;
    proteinByDay[m.date] = (proteinByDay[m.date] || 0) + (m.protein || 0);
    carbsByDay[m.date]   = (carbsByDay[m.date]   || 0) + (m.carbs   || 0);
    fatByDay[m.date]     = (fatByDay[m.date]      || 0) + (m.fat     || 0);
  });
  const macroLoggedDays = Object.keys(proteinByDay).length;
  const hasMacroData    = macroLoggedDays >= MIN_LOGGED_DAYS_FOR_AVG;
  const avgProtein = hasMacroData
    ? Math.round(Object.values(proteinByDay).reduce((a, b) => a + b, 0) / macroLoggedDays)
    : null;
  const avgCarbs = hasMacroData
    ? Math.round(Object.values(carbsByDay).reduce((a, b) => a + b, 0) / macroLoggedDays)
    : null;
  const avgFat = hasMacroData
    ? Math.round(Object.values(fatByDay).reduce((a, b) => a + b, 0) / macroLoggedDays)
    : null;

  // ── Workouts THIS WEEK (distinct days) ───────────────────────────────────
  // Source: workouts prop = 7-day window passed from CoachDashboard.
  // Count distinct days (a trainee who logs two sessions on one day = 1 training day).
  const uniqueWorkoutDays = new Set(recentWorkouts.map(w => w.date)).size;

  // ── Favorite foods — minimum MIN_FOOD_OCCURRENCES appearances required ────
  const foodFrequency = {};
  recentMeals.forEach(m => {
    if (m.food_name) {
      foodFrequency[m.food_name] = (foodFrequency[m.food_name] || 0) + 1;
    }
  });
  const favoriteFoods = Object.entries(foodFrequency)
    .filter(([, count]) => count >= MIN_FOOD_OCCURRENCES)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([food]) => food);

  // Nothing reliable to show — don't render the card
  const hasAnything = avgCalories != null || uniqueWorkoutDays > 0 || favoriteFoods.length > 0;
  if (!hasAnything) return null;

  return (
    <Card
      className="p-3.5 bg-gradient-to-br from-teal-50 to-cyan-50 border border-teal-200 rounded-xl cursor-pointer hover:shadow-md transition-shadow"
      onClick={() => navigate(`/TraineeLearningAnalytics/${trainee.id}`)}
    >
      <div className="space-y-2.5">
        {/* Header */}
        <div className="flex items-start gap-2">
          <Lightbulb className="w-4 h-4 text-teal-600 flex-shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0">
            <h4 className="text-sm font-bold text-teal-900">מה המערכת למדה</h4>
            <p className="text-[11px] text-teal-600">בסיס: {loggedDays} ימי תיעוד ב-7 הימים האחרונים</p>
          </div>
          <ChevronRight className="w-4 h-4 text-teal-600 flex-shrink-0 mt-0.5" />
        </div>

        {/* Insights Grid */}
        <div className="grid grid-cols-2 gap-2">
          {/* Average calories — only when sufficient data */}
          {avgCalories != null && (
            <div className="p-2 bg-white rounded-lg border border-teal-100">
              <p className="text-[10px] text-teal-600 font-medium mb-0.5">ממוצע קלוריות</p>
              <p className="text-sm font-bold text-slate-800">{avgCalories.toLocaleString('he-IL')}</p>
              <p className="text-[10px] text-slate-500">קל׳ / יום רישום</p>
            </div>
          )}

          {/* Workouts this week */}
          {uniqueWorkoutDays > 0 && (
            <div className="p-2 bg-white rounded-lg border border-orange-100">
              <p className="text-[10px] text-orange-600 font-medium mb-0.5 flex items-center gap-1">
                <Dumbbell className="w-3 h-3" />אימונים
              </p>
              <p className="text-sm font-bold text-slate-800">{uniqueWorkoutDays}</p>
              <p className="text-[10px] text-slate-500">ימי אימון השבוע</p>
            </div>
          )}

          {/* Favorite foods — only when there are 2+ occurrences */}
          {favoriteFoods.length > 0 && (
            <div className="p-2 bg-white rounded-lg border border-green-100 col-span-2">
              <p className="text-[10px] text-green-600 font-medium mb-1 flex items-center gap-1">
                <Utensils className="w-3 h-3" />נצפה לעתים קרובות:
              </p>
              <div className="flex flex-wrap gap-1">
                {favoriteFoods.map(food => (
                  <Badge key={food} className="bg-green-100 text-green-800 text-[10px] px-1.5 py-0">
                    {food.length > 14 ? food.substring(0, 12) + '...' : food}
                  </Badge>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Average macros per logged day — only when sufficient data */}
        {hasMacroData && avgProtein != null && (
          <div className="pt-2 border-t border-teal-200">
            <p className="text-[10px] text-teal-700 font-bold mb-1.5 flex items-center gap-1">
              <TrendingUp className="w-3 h-3" />ממוצע מאקרו / יום רישום
            </p>
            <div className="grid grid-cols-3 gap-2 text-center">
              <div className="p-1.5 bg-white rounded border border-blue-100">
                <p className="text-[10px] text-blue-600 font-medium">חלבון</p>
                <p className="text-sm font-bold text-slate-800">{avgProtein}g</p>
              </div>
              <div className="p-1.5 bg-white rounded border border-amber-100">
                <p className="text-[10px] text-amber-600 font-medium">פחמימות</p>
                <p className="text-sm font-bold text-slate-800">{avgCarbs}g</p>
              </div>
              <div className="p-1.5 bg-white rounded border border-red-100">
                <p className="text-[10px] text-red-600 font-medium">שומן</p>
                <p className="text-sm font-bold text-slate-800">{avgFat}g</p>
              </div>
            </div>
          </div>
        )}
      </div>
    </Card>
  );
}
