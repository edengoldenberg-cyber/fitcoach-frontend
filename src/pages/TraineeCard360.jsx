import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { Search, ChevronLeft, Droplets, Dumbbell, Utensils, MessageSquare, Send, AlertCircle, Scale } from 'lucide-react';
import { format, subDays } from 'date-fns';
import { useNavigate } from 'react-router-dom';
import { getIsraelDateString, nutritionRecordMatchesTrainee, invalidateCoachTraineeSyncQueries, logSyncEvent } from '@/utils/nutritionSync';
import { createPageUrl } from '@/utils';
import ProgressRing from '../components/shared/ProgressRing';
import AddMetricsDialog from '../components/coach/AddMetricsDialog';

export default function TraineeCard360() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const params = new URLSearchParams(window.location.search);
  const traineeId = params.get('id');
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedDate, setSelectedDate] = useState(getIsraelDateString());
  const [showMessageDialog, setShowMessageDialog] = useState(false);
  const [messageText, setMessageText] = useState('');
  const [activeTab, setActiveTab] = useState('today');
  const [filters, setFilters] = useState({
    noNutrition: false,
    noWater: false,
    noWorkout: false,
    inactive48h: false,
  });
  const [searchFood, setSearchFood] = useState('');
  const [searchExercise, setSearchExercise] = useState('');
  const [showMetricsDialog, setShowMetricsDialog] = useState(false);

  const { data: user } = useQuery({
    queryKey: ['currentUser'],
    queryFn: () => base44.auth.me(),
  });

  const { data: trainees = [] } = useQuery({
    queryKey: ['coachTrainees', user?.email],
    queryFn: () => base44.entities.Trainee.filter({ coach_email: user?.email }),
    enabled: !!user?.email,
  });

  const { data: trainee } = useQuery({
    queryKey: ['trainee', traineeId],
    queryFn: async () => {
      const t = trainees.find(t => t.id === traineeId);
      return t;
    },
    enabled: !!traineeId && trainees.length > 0,
  });

  const { data: meals = [] } = useQuery({
    queryKey: ['traineeMeals', trainee?.user_email, selectedDate],
    queryFn: async () => {
      const records = await base44.entities.MealEntry.filter({ date: selectedDate });
      return records.filter(record => nutritionRecordMatchesTrainee(record, trainee));
    },
    enabled: !!trainee?.user_email && activeTab === 'today',
  });

  const { data: water = [] } = useQuery({
    queryKey: ['traineeWater', trainee?.user_email, selectedDate],
    queryFn: async () => {
      const records = await base44.entities.WaterEntry.filter({ date: selectedDate });
      return records.filter(record => nutritionRecordMatchesTrainee(record, trainee));
    },
    enabled: !!trainee?.user_email && activeTab === 'today',
  });

  const { data: workouts = [] } = useQuery({
    queryKey: ['traineeWorkouts', trainee?.user_email, selectedDate],
    queryFn: () => base44.entities.WorkoutSession.filter({
      trainee_email: trainee?.user_email,
      date: selectedDate,
    }),
    enabled: !!trainee?.user_email && activeTab === 'today',
  });

  const { data: exerciseLines = [] } = useQuery({
    queryKey: ['exerciseLines', workouts.map(w => w.id)],
    queryFn: async () => {
      const allLines = await Promise.all(
        workouts.map(w => base44.entities.WorkoutExerciseLine.filter({ workout_session_id: w.id }))
      );
      return allLines.flat();
    },
    enabled: workouts.length > 0 && activeTab === 'today',
  });

  const { data: allSets = [] } = useQuery({
    queryKey: ['workoutSets', exerciseLines.map(l => l.id)],
    queryFn: async () => {
      const setsPromises = exerciseLines.map(line =>
        base44.entities.WorkoutSet.filter({ exercise_line_id: line.id })
      );
      const results = await Promise.all(setsPromises);
      return results.flat();
    },
    enabled: exerciseLines.length > 0 && activeTab === 'today',
  });

  const { data: exercises = [] } = useQuery({
    queryKey: ['exercises'],
    queryFn: () => base44.entities.Exercise.list(),
  });

  // For filters - fetch today's data for all trainees
  const { data: allMealsToday = [] } = useQuery({
    queryKey: ['allMealsToday'],
    queryFn: async () => {
      const today = getIsraelDateString();
      return base44.entities.MealEntry.filter({ date: today });
    },
    enabled: !traineeId,
  });

  const { data: allWaterToday = [] } = useQuery({
    queryKey: ['allWaterToday'],
    queryFn: async () => {
      const today = getIsraelDateString();
      return base44.entities.WaterEntry.filter({ date: today });
    },
    enabled: !traineeId,
  });

  const { data: allWorkoutsToday = [] } = useQuery({
    queryKey: ['allWorkoutsToday'],
    queryFn: async () => {
      const today = getIsraelDateString();
      return base44.entities.WorkoutSession.filter({ date: today });
    },
    enabled: !traineeId,
  });

  // For week view - fetch 7 days of data
  const { data: weekMeals = [] } = useQuery({
    queryKey: ['weekMeals', trainee?.user_email],
    queryFn: async () => {
      const promises = [];
      for (let i = 0; i < 7; i++) {
        const date = getIsraelDateString(subDays(new Date(), i));
        promises.push(base44.entities.MealEntry.filter({ date }));
      }
      const results = await Promise.all(promises);
      return results.flat().filter(record => nutritionRecordMatchesTrainee(record, trainee));
    },
    enabled: !!trainee?.user_email && activeTab === 'week',
  });

  const { data: weekWater = [] } = useQuery({
    queryKey: ['weekWater', trainee?.user_email],
    queryFn: async () => {
      const promises = [];
      for (let i = 0; i < 7; i++) {
        const date = getIsraelDateString(subDays(new Date(), i));
        promises.push(base44.entities.WaterEntry.filter({ date }));
      }
      const results = await Promise.all(promises);
      return results.flat().filter(record => nutritionRecordMatchesTrainee(record, trainee));
    },
    enabled: !!trainee?.user_email && activeTab === 'week',
  });

  const { data: weekWorkouts = [] } = useQuery({
    queryKey: ['weekWorkouts', trainee?.user_email],
    queryFn: async () => {
      const promises = [];
      for (let i = 0; i < 7; i++) {
        const date = getIsraelDateString(subDays(new Date(), i));
        promises.push(base44.entities.WorkoutSession.filter({ trainee_email: trainee?.user_email, date }));
      }
      const results = await Promise.all(promises);
      return results.flat();
    },
    enabled: !!trainee?.user_email && activeTab === 'week',
  });

  // For history - all data
  const { data: allMealsHistory = [] } = useQuery({
    queryKey: ['allMealsHistory', trainee?.user_email],
    queryFn: async () => {
      const records = await base44.entities.MealEntry.list('-created_date', 1000);
      return records.filter(record => nutritionRecordMatchesTrainee(record, trainee));
    },
    enabled: !!trainee?.user_email && activeTab === 'history',
  });

  const { data: allWorkoutsHistory = [] } = useQuery({
    queryKey: ['allWorkoutsHistory', trainee?.user_email],
    queryFn: () => base44.entities.WorkoutSession.filter({ trainee_email: trainee?.user_email }),
    enabled: !!trainee?.user_email && activeTab === 'history',
  });

  const { data: allExerciseLinesHistory = [] } = useQuery({
    queryKey: ['allExerciseLinesHistory', allWorkoutsHistory.map(w => w.id)],
    queryFn: async () => {
      const promises = allWorkoutsHistory.map(w => 
        base44.entities.WorkoutExerciseLine.filter({ workout_session_id: w.id })
      );
      const results = await Promise.all(promises);
      return results.flat();
    },
    enabled: allWorkoutsHistory.length > 0 && activeTab === 'history',
  });

  React.useEffect(() => {
    if (!trainee?.id && traineeId) return;
    const refresh = () => {
      invalidateCoachTraineeSyncQueries(queryClient);
      logSyncEvent({ entity: 'REALTIME_SYNC', trainee_id: trainee?.id, coach_id: user?.email, source: 'coach_360_subscription', refresh_success: true, visible_to_coach: true });
    };
    const unsubMeal = base44.entities.MealEntry.subscribe(refresh);
    const unsubWater = base44.entities.WaterEntry.subscribe(refresh);
    const unsubMetrics = base44.entities.MetricsEntry.subscribe(refresh);
    const unsubTrainee = base44.entities.Trainee.subscribe(refresh);
    return () => { unsubMeal(); unsubWater(); unsubMetrics(); unsubTrainee(); };
  }, [trainee?.id, user?.email, queryClient]);

  const sendMessage = useMutation({
    mutationFn: async (text) => {
      await base44.entities.Notification.create({
        trainee_email: trainee?.user_email,
        title_he: 'הודעה מהמאמן',
        body_he: text,
        channel_sent: 'in_app',
        status: 'sent',
        sent_at: new Date().toISOString(),
      });
    },
    onSuccess: () => {
      setShowMessageDialog(false);
      setMessageText('');
      alert('✅ ההודעה נשלחה');
    },
  });

  const getTraineeStatus = (trainee) => {
    const today = getIsraelDateString();
    const hasNutrition = allMealsToday.some(m => nutritionRecordMatchesTrainee(m, trainee));
    const hasWater = allWaterToday.some(w => nutritionRecordMatchesTrainee(w, trainee));
    const hasWorkout = allWorkoutsToday.some(w => w.trainee_email === trainee.user_email);
    const lastLogin = trainee.last_login_at ? new Date(trainee.last_login_at) : null;
    const inactive48h = lastLogin ? (new Date() - lastLogin) > (48 * 60 * 60 * 1000) : false;
    
    return { hasNutrition, hasWater, hasWorkout, inactive48h };
  };

  const filteredTrainees = trainees.filter(t => {
    const matchesSearch = t.full_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      t.user_email?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      t.phone?.includes(searchTerm);
    
    if (!matchesSearch) return false;
    
    const status = getTraineeStatus(t);
    
    if (filters.noNutrition && status.hasNutrition) return false;
    if (filters.noWater && status.hasWater) return false;
    if (filters.noWorkout && status.hasWorkout) return false;
    if (filters.inactive48h && !status.inactive48h) return false;
    
    return true;
  });

  // Calculations
  const dailyTotals = {
    calories: meals.reduce((sum, m) => sum + (m.calories || 0), 0),
    protein: meals.reduce((sum, m) => sum + (m.protein || 0), 0),
    carbs: meals.reduce((sum, m) => sum + (m.carbs || 0), 0),
    fat: meals.reduce((sum, m) => sum + (m.fat || 0), 0),
  };

  const targets = trainee ? {
    calories: trainee.target_calories || 2000,
    protein: trainee.target_protein || 150,
    carbs: trainee.target_carbs || 200,
    fat: trainee.target_fat || 70,
    water: trainee.water_target_ml || 3000,
  } : {};

  const totalWater = water.reduce((sum, w) => sum + (w.amount_ml || 0), 0);

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

  const getExerciseName = (line) => {
    if (line.custom_name) return line.custom_name;
    const exercise = exercises.find(e => e.id === line.exercise_id);
    return exercise?.name_he || 'תרגיל';
  };

  const getSetsForLine = (lineId) => {
    return allSets.filter(s => s.exercise_line_id === lineId).sort((a, b) => a.set_index - b.set_index);
  };

  const quickMessages = [
    'לא מילאת היום תזונה – בוא נסגור ארוחה אחת עכשיו 🍽️',
    'מים נמוך היום – תעדכן 2 כוסות 💧',
    'לא עדכנת אימון – תעדכן סטים כדי שנראה התקדמות 💪',
    'כל הכבוד על ההתמדה! ממשיך ככה 🔥',
  ];

  // No trainee selected - show list
  if (!traineeId) {
    return (
      <div className="min-h-screen bg-slate-50 pb-20" dir="rtl">
        <div className="max-w-4xl mx-auto p-4">
          <div className="mb-6">
            <h1 className="text-2xl font-bold text-slate-800 mb-2">כרטיס מתאמן 360°</h1>
            <p className="text-slate-600">צפייה מפורטת בכל הפעילות של המתאמן</p>
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

          <Card className="mb-4">
            <CardContent className="p-3">
              <p className="text-sm font-medium mb-2">סינון:</p>
              <div className="grid grid-cols-2 gap-2">
                <Button
                  variant={filters.noNutrition ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setFilters({...filters, noNutrition: !filters.noNutrition})}
                  className="text-xs"
                >
                  ❌ לא מילא תזונה
                </Button>
                <Button
                  variant={filters.noWater ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setFilters({...filters, noWater: !filters.noWater})}
                  className="text-xs"
                >
                  💧 לא מילא מים
                </Button>
                <Button
                  variant={filters.noWorkout ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setFilters({...filters, noWorkout: !filters.noWorkout})}
                  className="text-xs"
                >
                  💪 לא מילא אימון
                </Button>
                <Button
                  variant={filters.inactive48h ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setFilters({...filters, inactive48h: !filters.inactive48h})}
                  className="text-xs"
                >
                  ⏰ לא פעיל 48 שעות
                </Button>
              </div>
            </CardContent>
          </Card>

          <div className="grid gap-3">
            {filteredTrainees.map((t) => {
              const status = getTraineeStatus(t);
              return (
                <Card
                  key={t.id}
                  className="hover:shadow-md transition-shadow cursor-pointer"
                  onClick={() => navigate(`${createPageUrl('TraineeCard360')}?id=${t.id}`)}
                >
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between">
                      <div className="flex-1">
                        <h3 className="font-bold text-slate-800">{t.full_name}</h3>
                        <p className="text-sm text-slate-500">{t.user_email}</p>
                        <div className="flex gap-2 mt-2 text-xs">
                          <span className={status.hasNutrition ? 'text-green-600' : 'text-red-500'}>
                            {status.hasNutrition ? '✅' : '❌'} תזונה
                          </span>
                          <span className={status.hasWater ? 'text-green-600' : 'text-red-500'}>
                            {status.hasWater ? '✅' : '❌'} מים
                          </span>
                          <span className={status.hasWorkout ? 'text-green-600' : 'text-red-500'}>
                            {status.hasWorkout ? '✅' : '❌'} אימון
                          </span>
                        </div>
                      </div>
                      <ChevronLeft className="w-5 h-5 text-slate-400" />
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </div>
      </div>
    );
  }

  // Trainee selected - show 360 view
  return (
    <div className="min-h-screen bg-slate-50 pb-20" dir="rtl">
      <div className="max-w-4xl mx-auto p-4">
        <Button
          variant="ghost"
          onClick={() => navigate(createPageUrl('TraineeCard360'))}
          className="mb-4"
        >
          <ChevronLeft className="w-4 h-4 ml-2" />
          חזור לרשימה
        </Button>

        {trainee && (
          <>
            <div className="bg-white rounded-lg p-4 mb-4 shadow-sm">
              <div className="flex justify-between items-start">
                <div>
                  <h2 className="text-xl font-bold text-slate-800">{trainee.full_name}</h2>
                  <p className="text-sm text-slate-500">{trainee.user_email}</p>
                </div>
                <div className="flex gap-2">
                  <Button
                    onClick={() => setShowMetricsDialog(true)}
                    size="sm"
                    variant="outline"
                    className="text-blue-600 hover:text-blue-700"
                  >
                    <Scale className="w-4 h-4 ml-2" />
                    שקילה
                  </Button>
                  <Button
                    onClick={() => setShowMessageDialog(true)}
                    size="sm"
                    style={{ backgroundColor: '#79DBD6' }}
                  >
                    <MessageSquare className="w-4 h-4 ml-2" />
                    שלח הודעה
                  </Button>
                </div>
              </div>
            </div>

            <Tabs value={activeTab} onValueChange={setActiveTab}>
              <TabsList className="grid w-full grid-cols-3 mb-4">
                <TabsTrigger value="today">היום</TabsTrigger>
                <TabsTrigger value="week">שבוע</TabsTrigger>
                <TabsTrigger value="history">היסטוריה</TabsTrigger>
              </TabsList>

              <TabsContent value="today" className="space-y-4">
                {/* Date Selector */}
                <Input
                  type="date"
                  value={selectedDate}
                  onChange={(e) => setSelectedDate(e.target.value)}
                  className="mb-4"
                />

                {/* Progress Rings */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
                  <Card>
                    <CardContent className="p-3 text-center">
                      <ProgressRing
                        current={dailyTotals.calories}
                        target={targets.calories}
                        size={60}
                        strokeWidth={6}
                      />
                      <p className="text-xs text-slate-600 mt-2">קלוריות</p>
                      <p className="text-xs text-slate-400">{dailyTotals.calories}/{targets.calories}</p>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardContent className="p-3 text-center">
                      <ProgressRing
                        current={dailyTotals.protein}
                        target={targets.protein}
                        size={60}
                        strokeWidth={6}
                      />
                      <p className="text-xs text-slate-600 mt-2">חלבון</p>
                      <p className="text-xs text-slate-400">{dailyTotals.protein}/{targets.protein}</p>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardContent className="p-3 text-center">
                      <ProgressRing
                        current={dailyTotals.carbs}
                        target={targets.carbs}
                        size={60}
                        strokeWidth={6}
                      />
                      <p className="text-xs text-slate-600 mt-2">פחמימות</p>
                      <p className="text-xs text-slate-400">{dailyTotals.carbs}/{targets.carbs}</p>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardContent className="p-3 text-center">
                      <ProgressRing
                        current={totalWater}
                        target={targets.water}
                        size={60}
                        strokeWidth={6}
                      />
                      <p className="text-xs text-slate-600 mt-2">מים</p>
                      <p className="text-xs text-slate-400">{Math.round(totalWater/1000*10)/10}L/{targets.water/1000}L</p>
                    </CardContent>
                  </Card>
                </div>

                {/* Status */}
                <Card>
                  <CardContent className="p-3">
                    <div className="flex items-center justify-between text-sm">
                      <span>ארוחות: {Object.values(mealsByType).filter(m => m.length > 0).length}/4</span>
                      <span>מים: {water.length} רישומים</span>
                      <span>אימון: {workouts.length > 0 ? '✅' : '❌'}</span>
                    </div>
                  </CardContent>
                </Card>

                {/* Nutrition Details */}
                <div>
                  <h3 className="font-bold text-slate-800 mb-3 flex items-center gap-2">
                    <Utensils className="w-5 h-5" />
                    תזונה מפורטת
                  </h3>
                  
                  {Object.entries(mealsByType).map(([type, typeMeals]) => {
                    if (typeMeals.length === 0) return null;

                    const mealTotals = {
                      calories: typeMeals.reduce((sum, m) => sum + (m.calories || 0), 0),
                      protein: typeMeals.reduce((sum, m) => sum + (m.protein || 0), 0),
                      carbs: typeMeals.reduce((sum, m) => sum + (m.carbs || 0), 0),
                      fat: typeMeals.reduce((sum, m) => sum + (m.fat || 0), 0),
                    };

                    return (
                      <Card key={type} className="mb-3">
                        <CardContent className="p-4">
                          <h4 className="font-bold text-slate-700 mb-3">{mealTypeNames[type]}</h4>
                          
                          <div className="space-y-2">
                            {typeMeals.map((meal) => (
                              <div key={meal.id} className="border-b pb-2 last:border-0">
                                <div className="flex justify-between items-start">
                                  <div className="flex-1">
                                    <p className="font-medium text-slate-800">{meal.food_name}</p>
                                    <div className="text-xs text-slate-500 mt-1 space-y-0.5">
                                      <p>כמות: {meal.amount} {meal.unit_name || 'גרם'}</p>
                                      {meal.grams_final && (
                                        <p className="text-blue-600">≈ {meal.grams_final} גרם</p>
                                      )}
                                    </div>
                                  </div>
                                  <div className="text-left text-xs">
                                    <div className="font-medium">{meal.calories} קק"ל</div>
                                    <div className="text-slate-500">
                                      ח:{meal.protein}g פח:{meal.carbs}g ש:{meal.fat}g
                                    </div>
                                  </div>
                                </div>
                              </div>
                            ))}
                          </div>

                          <div className="mt-3 pt-3 border-t bg-slate-50 -mx-4 -mb-4 px-4 py-2">
                            <p className="text-sm font-bold text-slate-700">סיכום ארוחה:</p>
                            <p className="text-sm text-slate-600">
                              {mealTotals.calories} קק"ל | 
                              ח: {mealTotals.protein}g | 
                              פח: {mealTotals.carbs}g | 
                              ש: {mealTotals.fat}g
                            </p>
                          </div>
                        </CardContent>
                      </Card>
                    );
                  })}

                  {meals.length === 0 && (
                    <Card>
                      <CardContent className="p-6 text-center">
                        <AlertCircle className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                        <p className="text-slate-500">לא מילא תזונה היום</p>
                      </CardContent>
                    </Card>
                  )}
                </div>

                {/* Water Details */}
                <div>
                  <h3 className="font-bold text-slate-800 mb-3 flex items-center gap-2">
                    <Droplets className="w-5 h-5" />
                    מים
                  </h3>
                  
                  {water.length > 0 ? (
                    <Card>
                      <CardContent className="p-4">
                        <div className="space-y-2 mb-3">
                          {water.map((w) => (
                            <div key={w.id} className="flex justify-between text-sm border-b pb-1 last:border-0">
                              <span className="text-slate-600">
                                {new Date(w.created_date).toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' })}
                              </span>
                              <span className="font-medium">{w.amount_ml} מ"ל</span>
                            </div>
                          ))}
                        </div>
                        <div className="pt-2 border-t">
                          <p className="font-bold text-slate-700">
                            סה"כ: {(totalWater/1000).toFixed(1)} ליטר
                          </p>
                        </div>
                      </CardContent>
                    </Card>
                  ) : (
                    <Card>
                      <CardContent className="p-6 text-center">
                        <p className="text-slate-500">לא רשם מים היום</p>
                      </CardContent>
                    </Card>
                  )}
                </div>

                {/* Workout Details */}
                <div>
                  <h3 className="font-bold text-slate-800 mb-3 flex items-center gap-2">
                    <Dumbbell className="w-5 h-5" />
                    אימון
                  </h3>
                  
                  {workouts.length > 0 ? (
                    workouts.map((workout) => (
                      <Card key={workout.id} className="mb-3">
                        <CardContent className="p-4">
                          <div className="mb-3">
                            <h4 className="font-bold text-slate-800">{workout.title || 'אימון'}</h4>
                            <p className="text-xs text-slate-500">
                              {workout.status === 'completed' ? '✅ הושלם' : '⏳ בתהליך'}
                            </p>
                          </div>

                          <div className="space-y-3">
                            {exerciseLines
                              .filter(l => l.workout_session_id === workout.id)
                              .sort((a, b) => a.order_index - b.order_index)
                              .map((line, idx) => {
                                const sets = getSetsForLine(line.id);
                                return (
                                  <div key={line.id} className="border-b pb-2 last:border-0">
                                    <p className="font-medium text-slate-700">
                                      {idx + 1}. {getExerciseName(line)}
                                    </p>
                                    {sets.length > 0 && (
                                      <div className="mt-2 text-xs space-y-1">
                                        {sets.map((set) => (
                                          <div key={set.id} className="flex gap-4 text-slate-600">
                                            <span>סט {set.set_index}:</span>
                                            <span>{set.weight}kg × {set.reps}</span>
                                          </div>
                                        ))}
                                      </div>
                                    )}
                                  </div>
                                );
                              })}
                          </div>
                        </CardContent>
                      </Card>
                    ))
                  ) : (
                    <Card>
                      <CardContent className="p-6 text-center">
                        <p className="text-slate-500">לא עדכן אימון היום</p>
                      </CardContent>
                    </Card>
                  )}
                </div>
              </TabsContent>

              <TabsContent value="week" className="space-y-4">
                <Card>
                  <CardContent className="p-4">
                    <h3 className="font-bold text-slate-800 mb-3">סיכום שבועי (7 ימים אחרונים)</h3>
                    
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b">
                            <th className="text-right py-2">תאריך</th>
                            <th className="text-center">קלוריות</th>
                            <th className="text-center">חלבון</th>
                            <th className="text-center">מים</th>
                            <th className="text-center">אימון</th>
                          </tr>
                        </thead>
                        <tbody>
                          {[...Array(7)].map((_, i) => {
                            const date = getIsraelDateString(subDays(new Date(), i));
                            const dayMeals = weekMeals.filter(m => m.date === date);
                            const dayWater = weekWater.filter(w => w.date === date);
                            const dayWorkouts = weekWorkouts.filter(w => w.date === date);
                            
                            const calories = dayMeals.reduce((sum, m) => sum + (m.calories || 0), 0);
                            const protein = dayMeals.reduce((sum, m) => sum + (m.protein || 0), 0);
                            const waterTotal = dayWater.reduce((sum, w) => sum + (w.amount_ml || 0), 0);
                            
                            return (
                              <tr key={date} className="border-b">
                                <td className="py-2">{format(new Date(date), 'dd/MM')}</td>
                                <td className="text-center">
                                  <span className={calories >= targets.calories * 0.9 ? 'text-green-600' : 'text-red-500'}>
                                    {calories}
                                  </span>
                                </td>
                                <td className="text-center">
                                  <span className={protein >= targets.protein * 0.9 ? 'text-green-600' : 'text-red-500'}>
                                    {Math.round(protein)}g
                                  </span>
                                </td>
                                <td className="text-center">
                                  <span className={waterTotal >= targets.water * 0.8 ? 'text-green-600' : 'text-red-500'}>
                                    {(waterTotal/1000).toFixed(1)}L
                                  </span>
                                </td>
                                <td className="text-center">
                                  {dayWorkouts.length > 0 ? '✅' : '❌'}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardContent className="p-4">
                    <h3 className="font-bold text-slate-800 mb-3">סטטיסטיקה שבועית</h3>
                    <div className="grid grid-cols-2 gap-3 text-sm">
                      <div className="bg-slate-50 p-3 rounded">
                        <p className="text-slate-600">ממוצע קלוריות</p>
                        <p className="font-bold text-lg">
                          {Math.round(weekMeals.reduce((sum, m) => sum + (m.calories || 0), 0) / 7)}
                        </p>
                      </div>
                      <div className="bg-slate-50 p-3 rounded">
                        <p className="text-slate-600">ממוצע חלבון</p>
                        <p className="font-bold text-lg">
                          {Math.round(weekMeals.reduce((sum, m) => sum + (m.protein || 0), 0) / 7)}g
                        </p>
                      </div>
                      <div className="bg-slate-50 p-3 rounded">
                        <p className="text-slate-600">ממוצע מים</p>
                        <p className="font-bold text-lg">
                          {(weekWater.reduce((sum, w) => sum + (w.amount_ml || 0), 0) / 7000).toFixed(1)}L
                        </p>
                      </div>
                      <div className="bg-slate-50 p-3 rounded">
                        <p className="text-slate-600">אימונים השבוע</p>
                        <p className="font-bold text-lg">
                          {weekWorkouts.length}
                        </p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="history" className="space-y-4">
                <div>
                  <h3 className="font-bold text-slate-800 mb-3">חיפוש מזון בהיסטוריה</h3>
                  <Input
                    type="text"
                    placeholder="הקלד שם מוצר..."
                    value={searchFood}
                    onChange={(e) => setSearchFood(e.target.value)}
                    className="mb-3"
                  />
                  
                  {searchFood && (
                    <Card>
                      <CardContent className="p-4">
                        {allMealsHistory
                          .filter(m => m.food_name?.toLowerCase().includes(searchFood.toLowerCase()))
                          .slice(0, 20)
                          .map((meal) => (
                            <div key={meal.id} className="border-b py-2 last:border-0">
                              <div className="flex justify-between items-start">
                                <div>
                                  <p className="font-medium text-slate-800">{meal.food_name}</p>
                                  <p className="text-xs text-slate-500">
                                    {format(new Date(meal.date), 'dd/MM/yyyy')} • {meal.amount} {meal.unit_name}
                                  </p>
                                </div>
                                <div className="text-left text-xs">
                                  <p className="font-medium">{meal.calories} קק"ל</p>
                                  <p className="text-slate-500">ח:{meal.protein}g</p>
                                </div>
                              </div>
                            </div>
                          ))}
                        {allMealsHistory.filter(m => m.food_name?.toLowerCase().includes(searchFood.toLowerCase())).length === 0 && (
                          <p className="text-center text-slate-500 py-4">לא נמצא</p>
                        )}
                      </CardContent>
                    </Card>
                  )}
                </div>

                <div>
                  <h3 className="font-bold text-slate-800 mb-3">חיפוש תרגיל בהיסטוריה</h3>
                  <Input
                    type="text"
                    placeholder="הקלד שם תרגיל..."
                    value={searchExercise}
                    onChange={(e) => setSearchExercise(e.target.value)}
                    className="mb-3"
                  />
                  
                  {searchExercise && (
                    <Card>
                      <CardContent className="p-4">
                        {allExerciseLinesHistory
                          .filter(line => {
                            const name = line.custom_name || exercises.find(e => e.id === line.exercise_id)?.name_he || '';
                            return name.toLowerCase().includes(searchExercise.toLowerCase());
                          })
                          .slice(0, 20)
                          .map((line) => {
                            const workout = allWorkoutsHistory.find(w => w.id === line.workout_session_id);
                            const name = line.custom_name || exercises.find(e => e.id === line.exercise_id)?.name_he || 'תרגיל';
                            return (
                              <div key={line.id} className="border-b py-2 last:border-0">
                                <p className="font-medium text-slate-800">{name}</p>
                                <p className="text-xs text-slate-500">
                                  {workout?.date && format(new Date(workout.date), 'dd/MM/yyyy')} • {workout?.title}
                                </p>
                              </div>
                            );
                          })}
                        {allExerciseLinesHistory.filter(line => {
                          const name = line.custom_name || exercises.find(e => e.id === line.exercise_id)?.name_he || '';
                          return name.toLowerCase().includes(searchExercise.toLowerCase());
                        }).length === 0 && (
                          <p className="text-center text-slate-500 py-4">לא נמצא</p>
                        )}
                      </CardContent>
                    </Card>
                  )}
                </div>
              </TabsContent>
            </Tabs>
          </>
        )}

        {/* Metrics Dialog */}
        <AddMetricsDialog
          open={showMetricsDialog}
          onClose={() => setShowMetricsDialog(false)}
          traineeEmail={trainee?.user_email}
          traineeName={trainee?.full_name}
          trainee={trainee}
        />

        {/* Message Dialog */}
        <Dialog open={showMessageDialog} onOpenChange={setShowMessageDialog}>
          <DialogContent dir="rtl">
            <DialogHeader>
              <DialogTitle>שלח הודעה למתאמן</DialogTitle>
            </DialogHeader>

            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-2">
                {quickMessages.map((msg, idx) => (
                  <Button
                    key={idx}
                    variant="outline"
                    size="sm"
                    onClick={() => setMessageText(msg)}
                    className="text-xs h-auto py-2"
                  >
                    {msg}
                  </Button>
                ))}
              </div>

              <Textarea
                value={messageText}
                onChange={(e) => setMessageText(e.target.value)}
                placeholder="כתוב הודעה..."
                rows={4}
              />

              <Button
                onClick={() => sendMessage.mutate(messageText)}
                disabled={!messageText || sendMessage.isPending}
                className="w-full"
                style={{ backgroundColor: '#79DBD6' }}
              >
                <Send className="w-4 h-4 ml-2" />
                {sendMessage.isPending ? 'שולח...' : 'שלח הודעה'}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}