import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Utensils, Search, ChevronLeft, Calendar, TrendingUp, TrendingDown } from 'lucide-react';
import { format, subDays } from 'date-fns';

export default function CoachNutrition() {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedTrainee, setSelectedTrainee] = useState(null);
  const [selectedDate, setSelectedDate] = useState(format(new Date(), 'yyyy-MM-dd'));

  const { data: user } = useQuery({
    queryKey: ['currentUser'],
    queryFn: () => base44.auth.me(),
  });

  const { data: trainees = [] } = useQuery({
    queryKey: ['coachTrainees', user?.email],
    queryFn: () => base44.entities.Trainee.filter({ coach_email: user?.email }),
    enabled: !!user?.email,
  });

  const { data: meals = [] } = useQuery({
    queryKey: ['traineeMeals', selectedTrainee?.user_email, selectedDate],
    queryFn: () => base44.entities.MealEntry.filter({
      trainee_email: selectedTrainee?.user_email,
      date: selectedDate,
    }),
    enabled: !!selectedTrainee,
  });

  const filteredTrainees = trainees.filter(t =>
    t.full_name?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const dailyTotals = {
    calories: meals.reduce((sum, m) => sum + (m.calories || 0), 0),
    protein: meals.reduce((sum, m) => sum + (m.protein || 0), 0),
    carbs: meals.reduce((sum, m) => sum + (m.carbs || 0), 0),
    fat: meals.reduce((sum, m) => sum + (m.fat || 0), 0),
    meals_count: meals.length,
  };

  const targets = selectedTrainee ? {
    calories: selectedTrainee.target_calories || 2000,
    protein: selectedTrainee.target_protein || 150,
    carbs: selectedTrainee.target_carbs || 200,
    fat: selectedTrainee.target_fat || 70,
  } : {};

  const getProgressPercent = (current, target) => {
    return target > 0 ? Math.round((current / target) * 100) : 0;
  };

  const getProgressColor = (percent) => {
    if (percent >= 90 && percent <= 110) return 'text-green-600';
    if (percent >= 70 && percent < 90) return 'text-amber-600';
    return 'text-red-600';
  };

  const mealsByType = {
    breakfast: meals.filter(m => m.meal_type === 'breakfast'),
    lunch: meals.filter(m => m.meal_type === 'lunch'),
    dinner: meals.filter(m => m.meal_type === 'dinner'),
    snack: meals.filter(m => m.meal_type === 'snack'),
  };

  const mealTypeNames = {
    breakfast: 'ארוחת בוקר',
    lunch: 'צהריים',
    dinner: 'ערב',
    snack: 'חטיף',
  };

  if (selectedTrainee) {
    return (
      <div className="min-h-screen bg-slate-50 pb-20" dir="rtl">
        <div className="max-w-4xl mx-auto p-4">
          <Button
            variant="ghost"
            onClick={() => setSelectedTrainee(null)}
            className="mb-4"
          >
            <ChevronLeft className="w-4 h-4 ml-2" />
            חזור לרשימת מתאמנים
          </Button>

          <div className="bg-white rounded-lg p-4 mb-4 shadow-sm">
            <h2 className="text-xl font-bold text-slate-800">
              {selectedTrainee.full_name}
            </h2>
            <p className="text-sm text-slate-500">{selectedTrainee.user_email}</p>
          </div>

          {/* Date Selector */}
          <div className="flex items-center gap-2 mb-4">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setSelectedDate(format(subDays(new Date(selectedDate), 1), 'yyyy-MM-dd'))}
            >
              ←
            </Button>
            <Input
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="flex-1"
            />
            <Button
              variant="outline"
              size="sm"
              onClick={() => setSelectedDate(format(new Date(Date.parse(selectedDate) + 86400000), 'yyyy-MM-dd'))}
              disabled={selectedDate >= format(new Date(), 'yyyy-MM-dd')}
            >
              →
            </Button>
          </div>

          {/* Daily Summary */}
          <div className="grid grid-cols-2 gap-3 mb-4">
            <Card>
              <CardContent className="p-3 text-center">
                <div className={`text-2xl font-bold ${getProgressColor(getProgressPercent(dailyTotals.calories, targets.calories))}`}>
                  {dailyTotals.calories}
                </div>
                <div className="text-xs text-slate-500">קלוריות</div>
                <div className="text-xs text-slate-400 mt-1">
                  יעד: {targets.calories} ({getProgressPercent(dailyTotals.calories, targets.calories)}%)
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-3 text-center">
                <div className={`text-2xl font-bold ${getProgressColor(getProgressPercent(dailyTotals.protein, targets.protein))}`}>
                  {dailyTotals.protein}
                </div>
                <div className="text-xs text-slate-500">חלבון (גר')</div>
                <div className="text-xs text-slate-400 mt-1">
                  יעד: {targets.protein} ({getProgressPercent(dailyTotals.protein, targets.protein)}%)
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-3 text-center">
                <div className={`text-2xl font-bold ${getProgressColor(getProgressPercent(dailyTotals.carbs, targets.carbs))}`}>
                  {dailyTotals.carbs}
                </div>
                <div className="text-xs text-slate-500">פחמימות (גר')</div>
                <div className="text-xs text-slate-400 mt-1">
                  יעד: {targets.carbs} ({getProgressPercent(dailyTotals.carbs, targets.carbs)}%)
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-3 text-center">
                <div className={`text-2xl font-bold ${getProgressColor(getProgressPercent(dailyTotals.fat, targets.fat))}`}>
                  {dailyTotals.fat}
                </div>
                <div className="text-xs text-slate-500">שומן (גר')</div>
                <div className="text-xs text-slate-400 mt-1">
                  יעד: {targets.fat} ({getProgressPercent(dailyTotals.fat, targets.fat)}%)
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Meals Breakdown */}
          <div className="space-y-3">
            {Object.entries(mealsByType).map(([type, typeMeals]) => {
              if (typeMeals.length === 0) return null;

              const mealTotals = {
                calories: typeMeals.reduce((sum, m) => sum + (m.calories || 0), 0),
                protein: typeMeals.reduce((sum, m) => sum + (m.protein || 0), 0),
                carbs: typeMeals.reduce((sum, m) => sum + (m.carbs || 0), 0),
                fat: typeMeals.reduce((sum, m) => sum + (m.fat || 0), 0),
              };

              return (
                <Card key={type}>
                  <CardContent className="p-4">
                    <h3 className="font-bold text-slate-800 mb-2">{mealTypeNames[type]}</h3>
                    
                    <div className="space-y-2 mb-3">
                      {typeMeals.map((meal) => (
                        <div key={meal.id} className="flex justify-between items-start text-sm border-b pb-2 last:border-0">
                          <div className="flex-1">
                            <p className="font-medium text-slate-700">{meal.food_name}</p>
                            <p className="text-xs text-slate-500">
                              {meal.amount} {meal.unit_name || 'גרם'}
                            </p>
                          </div>
                          <div className="text-left text-xs text-slate-600">
                            <div>{meal.calories} קק"ל</div>
                            <div>ח: {meal.protein} | פח: {meal.carbs} | ש: {meal.fat}</div>
                          </div>
                        </div>
                      ))}
                    </div>

                    <div className="bg-slate-50 p-2 rounded text-sm">
                      <div className="font-bold text-slate-700 mb-1">סיכום ארוחה:</div>
                      <div className="text-slate-600">
                        🔥 {mealTotals.calories} קק"ל | 
                        💪 {mealTotals.protein}g חלבון | 
                        🍞 {mealTotals.carbs}g פחמימות | 
                        🥑 {mealTotals.fat}g שומן
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>

          {meals.length === 0 && (
            <Card className="p-6 text-center">
              <p className="text-slate-500">אין רישום תזונה ליום זה</p>
            </Card>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 pb-20" dir="rtl">
      <div className="max-w-4xl mx-auto p-4">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-slate-800 mb-2">תזונת מתאמנים</h1>
          <p className="text-slate-600">צפייה מפורטת בתזונה של כל מתאמן</p>
        </div>

        <div className="relative mb-4">
          <Search className="absolute right-3 top-3 w-5 h-5 text-slate-400" />
          <Input
            type="text"
            placeholder="חפש מתאמן..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pr-10"
          />
        </div>

        <div className="grid gap-3">
          {filteredTrainees.map((trainee) => (
            <Card
              key={trainee.id}
              className="hover:shadow-md transition-shadow cursor-pointer"
              onClick={() => setSelectedTrainee(trainee)}
            >
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-full flex items-center justify-center" style={{ backgroundColor: '#79DBD6' }}>
                    <Utensils className="w-6 h-6 text-white" />
                  </div>
                  <div className="flex-1">
                    <h3 className="font-bold text-slate-800">{trainee.full_name}</h3>
                    <p className="text-sm text-slate-500">{trainee.user_email}</p>
                  </div>
                  <ChevronLeft className="w-5 h-5 text-slate-400" />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
}