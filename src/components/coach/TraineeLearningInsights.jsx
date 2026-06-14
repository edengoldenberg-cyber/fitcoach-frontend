import React from 'react';
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Lightbulb, Utensils, Dumbbell, TrendingUp, ChevronRight } from "lucide-react";
import { useNavigate } from 'react-router-dom';
import { nutritionRecordMatchesTrainee } from '@/utils/nutritionSync';

export default function TraineeLearningInsights({ trainee, meals = [], workouts = [] }) {
  const navigate = useNavigate();
  if (!trainee) return null;

  // Calculate insights from historical data
  const recentMeals = meals.filter(m => nutritionRecordMatchesTrainee(m, trainee)).slice(0, 50);
  const recentWorkouts = workouts.filter(w => w.trainee_email === trainee.user_email).slice(0, 20);

  // Favorite foods (most logged)
  const foodFrequency = {};
  recentMeals.forEach(m => {
    if (m.food_name) {
      foodFrequency[m.food_name] = (foodFrequency[m.food_name] || 0) + 1;
    }
  });
  const favoriteFoods = Object.entries(foodFrequency)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([food]) => food);

  // Average daily calories (last 14 days)
  const last14Days = {};
  recentMeals.slice(-30).forEach(m => {
    if (m.date) {
      last14Days[m.date] = (last14Days[m.date] || 0) + (m.calories || 0);
    }
  });
  const avgCalories = Object.keys(last14Days).length > 0
    ? Math.round(Object.values(last14Days).reduce((a, b) => a + b, 0) / Object.keys(last14Days).length)
    : 0;

  // Workout frequency
  const workoutFrequency = recentWorkouts.length > 0
    ? (recentWorkouts.length / 4).toFixed(1)
    : 0;

  // Macro preferences
  const avgProtein = recentMeals.length > 0
    ? Math.round(recentMeals.reduce((sum, m) => sum + (m.protein || 0), 0) / recentMeals.length)
    : 0;
  const avgCarbs = recentMeals.length > 0
    ? Math.round(recentMeals.reduce((sum, m) => sum + (m.carbs || 0), 0) / recentMeals.length)
    : 0;
  const avgFat = recentMeals.length > 0
    ? Math.round(recentMeals.reduce((sum, m) => sum + (m.fat || 0), 0) / recentMeals.length)
    : 0;

  // Eating patterns
  const mealTypes = {};
  recentMeals.forEach(m => {
    if (m.meal_type) {
      mealTypes[m.meal_type] = (mealTypes[m.meal_type] || 0) + 1;
    }
  });
  const primaryMealType = Object.keys(mealTypes).length > 0
    ? Object.entries(mealTypes).sort((a, b) => b[1] - a[1])[0][0]
    : null;

  return (
    <Card className="p-3.5 bg-gradient-to-br from-teal-50 to-cyan-50 border border-teal-200 rounded-xl cursor-pointer hover:shadow-md transition-shadow" onClick={() => navigate(`/TraineeLearningAnalytics/${trainee.id}`)}>
      <div className="space-y-2.5">
        {/* Header */}
        <div className="flex items-start gap-2">
          <Lightbulb className="w-4 h-4 text-teal-600 flex-shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0">
            <h4 className="text-sm font-bold text-teal-900">מה המערכת למדה</h4>
            <p className="text-[11px] text-teal-700">סיכום של הרגלים וצפיפויות</p>
          </div>
          <ChevronRight className="w-4 h-4 text-teal-600 flex-shrink-0 mt-0.5" />
        </div>

        {/* Insights Grid */}
        <div className="grid grid-cols-2 gap-2">
          {/* Calories */}
          {avgCalories > 0 && (
            <div className="p-2 bg-white rounded-lg border border-teal-100">
              <p className="text-[10px] text-teal-600 font-medium mb-0.5">ממוצע קלוריות</p>
              <p className="text-sm font-bold text-slate-800">{avgCalories}</p>
              <p className="text-[10px] text-slate-500">קל׳ ביום</p>
            </div>
          )}

          {/* Workouts */}
          {workoutFrequency > 0 && (
            <div className="p-2 bg-white rounded-lg border border-orange-100">
              <p className="text-[10px] text-orange-600 font-medium mb-0.5 flex items-center gap-1">
                <Dumbbell className="w-3 h-3" />אימונים
              </p>
              <p className="text-sm font-bold text-slate-800">{workoutFrequency}</p>
              <p className="text-[10px] text-slate-500">לשבוע</p>
            </div>
          )}

          {/* Favorite food */}
          {favoriteFoods.length > 0 && (
            <div className="p-2 bg-white rounded-lg border border-green-100 col-span-2">
              <p className="text-[10px] text-green-600 font-medium mb-1 flex items-center gap-1">
                <Utensils className="w-3 h-3" />אהוב:
              </p>
              <div className="flex flex-wrap gap-1">
                {favoriteFoods.map(food => (
                  <Badge key={food} className="bg-green-100 text-green-800 text-[10px] px-1.5 py-0">
                    {food.length > 12 ? food.substring(0, 10) + '...' : food}
                  </Badge>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Macro Summary */}
        {avgProtein > 0 && (
          <div className="pt-2 border-t border-teal-200">
            <p className="text-[10px] text-teal-700 font-bold mb-1.5 flex items-center gap-1">
              <TrendingUp className="w-3 h-3" />ממוצע מקרו
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