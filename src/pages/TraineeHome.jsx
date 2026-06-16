import React, { useState, useMemo, useEffect, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import HomeErrorBoundary from '../components/shared/HomeErrorBoundary';
import HomeDebugPanel from '../components/shared/HomeDebugPanel';

import HelpButton from '../components/shared/HelpButton';
import SuperAICoach from '../components/trainee/SuperAICoach';
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Droplets, User } from "lucide-react";
import { getDailyStatus, calculateWeeklyCompliance } from '../components/shared/ComplianceCalculator';
import AddMealManual from '../components/trainee/AddMealManual';
import AddMealWithAI from '../components/trainee/AddMealWithAI';
import AddMealFromPhoto from '../components/trainee/AddMealFromPhoto';
import AddWaterDialog from '../components/trainee/AddWaterDialog';
import AddWorkoutDialog from '../components/trainee/AddWorkoutDialog';
import AddWorkoutFromPhoto from '../components/trainee/AddWorkoutFromPhoto';
import AddActivityWithAI from '../components/trainee/AddActivityWithAI';
import GoalCelebrationAnimation from '../components/trainee/GoalCelebrationAnimation';
import AchievementsBadge from '../components/trainee/AchievementsBadge';
import { useNavigate, Link } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import { ArrowRight } from 'lucide-react';
import NotificationAlert from '../components/trainee/NotificationAlert';
import EditPersonalInfo from '../components/trainee/EditPersonalInfo';
import AutoLinkUserOnLogin from '../components/shared/AutoLinkUserOnLogin';
import LoginDiagnosticScreen from '../components/shared/LoginDiagnosticScreen';
import SuggestFoodDialog from '../components/trainee/SuggestFoodDialog';
import HomeHeader from '../components/trainee/home/HomeHeader';
import DailyStatsRow from '../components/trainee/home/DailyStatsRow';
import QuickActionsBar from '../components/trainee/home/QuickActionsBar';
import TodayWorkoutCard from '../components/trainee/home/TodayWorkoutCard';
import WeeklyTasksPanel from '../components/trainee/home/WeeklyTasksPanel';
import GoalProgressCard from '../components/trainee/home/GoalProgressCard';
import CalorieDeficitMotivationCard from '../components/trainee/home/CalorieDeficitMotivationCard';
import { getIsraelDateString, nutritionRecordMatchesTrainee, metricRecordMatchesTrainee, invalidateCoachTraineeSyncQueries, logSyncEvent } from '@/utils/nutritionSync';

const generateCorrelationId = () => {
  return `HM-${Date.now().toString(36)}-${Math.random().toString(36).substr(2, 5)}`.toUpperCase();
};

function TraineeHomeContent() {
  const correlationId = useRef(generateCorrelationId()).current;
  const [debugSteps, setDebugSteps] = useState([]);
  const [showMealDialog, setShowMealDialog] = useState(false);
  const [showMealAIDialog, setShowMealAIDialog] = useState(false);
  const [showMealPhotoDialog, setShowMealPhotoDialog] = useState(false);
  const [selectedMealType, setSelectedMealType] = useState('breakfast');
  const [showWaterDialog, setShowWaterDialog] = useState(false);
  const [showWorkoutDialog, setShowWorkoutDialog] = useState(false);
  const [showWorkoutPhotoDialog, setShowWorkoutPhotoDialog] = useState(false);
  const [prefilledWorkoutExercises, setPrefilledWorkoutExercises] = useState([]);
  const [showActivityAI, setShowActivityAI] = useState(false);
  const [showPersonalInfo, setShowPersonalInfo] = useState(false);
  const [showAICoach, setShowAICoach] = useState(false);
  const [showSuggestFood, setShowSuggestFood] = useState(false);
  const [celebration, setCelebration] = useState(null);
  const [showQuickWater, setShowQuickWater] = useState(false);
  
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const today = getIsraelDateString();

  console.log('[TraineeHome] Session:', correlationId);

  const updateStep = (name, status, data = {}) => {
    setDebugSteps(prev => {
      const existing = prev.find(s => s.name === name);
      if (existing) {
        return prev.map(s => s.name === name ? { ...s, status, ...data } : s);
      }
      return [...prev, { name, status, ok: true, ...data }];
    });
  };

  const markStepError = (name, errorCode, errorMessage, debugData = {}) => {
    setDebugSteps(prev => prev.map(s => 
      s.name === name ? { ...s, status: 'complete', ok: false, errorCode, errorMessage, debugData } : s
    ));
  };

  const markStepSuccess = (name, debugData = {}) => {
    setDebugSteps(prev => prev.map(s => 
      s.name === name ? { ...s, status: 'complete', ok: true, debugData } : s
    ));
  };

  // Step A: Auth session
  const { data: user, isLoading: userLoading } = useQuery({
    queryKey: ['currentUser'],
    queryFn: async () => {
      const start = Date.now();
      updateStep('Step A: Auth Session', 'running');
      
      try {
        const userData = await base44.auth.me();
        const duration = Date.now() - start;
        
        
        markStepSuccess('Step A: Auth Session', {
          user_id: userData.id,
          email: userData.email,
          duration_ms: duration
        });
        
        return userData;
      } catch (err) {
        markStepError('Step A: Auth Session', 'AUTH_FAILED', err.message);
        throw err;
      }
    },
    retry: 2,
  });

  // Step B: Resolve trainee with full debug + SAFE MODE
  const { data: trainee, isLoading: traineeLoading } = useQuery({
    queryKey: ['trainee', user?.email],
    queryFn: async () => {
      const start = Date.now();
      updateStep('Step B: Resolve Trainee', 'running');
      
      try {
        const userId = user.id || user.user_id;
        const userEmail = user.email;
        
        // Try by user_id
        let trainees = await base44.entities.Trainee.filter({ user_id: userId });
        
        let lookupMethod = 'none';
        
        if (trainees.length > 0) {
          lookupMethod = 'user_id';
          const exactCoach = trainees.find(t => t.coach_email && t.coach_email !== 'coach@example.com');
          const activeWithData = trainees.find(t => t.status === 'active' && t.onboarding_status === 'completed');
          trainees = [exactCoach || activeWithData || trainees[0]];
        } else {
          // Fallback to email
          const normalizedEmail = userEmail.toLowerCase().trim();
          trainees = await base44.entities.Trainee.filter({ user_email: normalizedEmail });
          
          if (trainees.length > 0) {
            lookupMethod = 'email';

            // Link user_id if missing — trainee already exists, just needs the link
            const fixKey = `uid_fixed_${trainees[0].id}`;
            if (!trainees[0].user_id && !sessionStorage.getItem(fixKey)) {
              await base44.entities.Trainee.update(trainees[0].id, { user_id: userId });
              trainees[0].user_id = userId;
              sessionStorage.setItem(fixKey, '1');
            }
          } else {
            // No trainee record found for this user — do not auto-create.
            // Only coaches can create trainees via the AddTrainee flow.
            return null;
          }
        }
        
        let traineeRecord = trainees[0];
        
        // Auto-fix visible_modules if missing
        if (!traineeRecord.visible_modules || Object.keys(traineeRecord.visible_modules).length === 0) {
          const defaultModules = { nutrition: true, water: true, workouts: true, metrics: true };
          await base44.entities.Trainee.update(traineeRecord.id, { visible_modules: defaultModules });
          traineeRecord.visible_modules = defaultModules;
        }
        
        
        if (traineeRecord.status === 'pending_coach_approval') {
          navigate(createPageUrl('PendingApproval'));
          return null;
        }

        // If trainee is deleted or inactive — restore automatically with safe defaults
        if (traineeRecord.status === 'deleted' || traineeRecord.status === 'inactive') {
          console.log('[TraineeHome] AUTO-RESTORE: Restoring deleted/inactive trainee', traineeRecord.id);
          await base44.entities.Trainee.update(traineeRecord.id, {
            status: 'active',
          });
          traineeRecord = { ...traineeRecord, status: 'active' };
          lookupMethod = 'restored';
        }
        
        const duration = Date.now() - start;
        markStepSuccess('Step B: Resolve Trainee', {
          trainee_id: traineeRecord.id,
          lookup_method: lookupMethod,
          duration_ms: duration
        });
        
        return traineeRecord;
      } catch (err) {
        console.error('ERROR:', err);
        markStepError('Step B: Resolve Trainee', 'FETCH_FAILED', err.message);
        throw err;
      }
    },
    enabled: !!user?.email,
    retry: 1,
  });

  // All data queries with safe fallbacks - MUST BE CALLED UNCONDITIONALLY
  const { data: todayMeals = [] } = useQuery({
    queryKey: ['meals', trainee?.id, user?.email, today],
    queryFn: async () => {
      try {
        const meals = await base44.entities.MealEntry.filter({ date: today });
        return Array.isArray(meals) ? meals.filter(meal => nutritionRecordMatchesTrainee(meal, trainee)) : [];
      } catch { return []; }
    },
    enabled: !!user?.email && !!trainee,
  });

  const { data: todayWater = [] } = useQuery({
    queryKey: ['water', trainee?.id, user?.email, today],
    queryFn: async () => {
      try {
        const water = await base44.entities.WaterEntry.filter({ date: today });
        return Array.isArray(water) ? water.filter(entry => nutritionRecordMatchesTrainee(entry, trainee)) : [];
      } catch { return []; }
    },
    enabled: !!user?.email && !!trainee,
  });

  const { data: todayWorkouts = [] } = useQuery({
    queryKey: ['workouts', trainee?.id, user?.email, today],
    queryFn: async () => {
      try {
        const [sessions, traineeWorkouts, leagueActivities] = await Promise.all([
          base44.entities.WorkoutSession.filter({ trainee_email: trainee?.user_email || user?.email, date: today }),
          base44.entities.TraineeWorkout.filter({ trainee_email: trainee?.user_email || user?.email, date: today }),
          trainee?.id ? base44.entities.ShapeLeagueActivityLog.filter({ trainee_id: trainee.id, activity_date: today }) : Promise.resolve([]),
        ]);
        return [...(sessions || []), ...(traineeWorkouts || []), ...(leagueActivities || [])];
      } catch { return []; }
    },
    enabled: !!user?.email && !!trainee,
  });

  const { data: todayActivities = [] } = useQuery({
    queryKey: ['activities', user?.email, today],
    queryFn: () => base44.entities.ActivityLog.filter({ trainee_email: user?.email, date: today }).catch(() => []),
    enabled: !!user?.email,
  });

  const { data: todayDeviceStats } = useQuery({
    queryKey: ['deviceStats', user?.email, today],
    queryFn: async () => {
      try {
        const stats = await base44.entities.DeviceDailyStats.filter({ trainee_email: user?.email, date: today });
        return stats[0] || null;
      } catch { return null; }
    },
    enabled: !!user?.email,
  });

  const { data: allMealsWeek = [] } = useQuery({
    queryKey: ['allMealsWeek', trainee?.id, user?.email],
    queryFn: async () => {
      const traineeEmail = trainee?.user_email || user?.email;
      const meals = await base44.entities.MealEntry.filter(
        { trainee_email: traineeEmail },
        '-created_date',
        200
      );
      return meals.filter(meal => nutritionRecordMatchesTrainee(meal, trainee));
    },
    enabled: !!user?.email && !!trainee,
  });

  const { data: allWaterWeek = [] } = useQuery({
    queryKey: ['allWaterWeek', trainee?.id, user?.email],
    queryFn: async () => {
      const traineeEmail = trainee?.user_email || user?.email;
      const water = await base44.entities.WaterEntry.filter(
        { trainee_email: traineeEmail },
        '-created_date',
        200
      );
      return water.filter(entry => nutritionRecordMatchesTrainee(entry, trainee));
    },
    enabled: !!user?.email && !!trainee,
  });

  const { data: allWorkoutsWeek = [] } = useQuery({
    queryKey: ['allWorkoutsWeek', trainee?.id, user?.email],
    queryFn: async () => {
      const [sessions, traineeWorkouts, leagueActivities] = await Promise.all([
        base44.entities.WorkoutSession.filter({ trainee_email: trainee?.user_email || user?.email }).catch(() => []),
        base44.entities.TraineeWorkout.filter({ trainee_email: trainee?.user_email || user?.email }).catch(() => []),
        trainee?.id ? base44.entities.ShapeLeagueActivityLog.filter({ trainee_id: trainee.id }).catch(() => []) : Promise.resolve([]),
      ]);
      return [
        ...(sessions || []),
        ...(traineeWorkouts || []),
        ...(leagueActivities || []).map(activity => ({ ...activity, date: activity.activity_date, status: 'completed' })),
      ];
    },
    enabled: !!user?.email && !!trainee,
  });

  const { data: allMeasurementsWeek = [] } = useQuery({
    queryKey: ['allMeasurementsWeek', trainee?.id, user?.email],
    queryFn: async () => {
      const traineeEmail = trainee?.user_email || user?.email;
      const records = await base44.entities.MetricsEntry.filter(
        { trainee_email: traineeEmail },
        '-date',
        200
      );
      return records.filter(record => metricRecordMatchesTrainee(record, trainee));
    },
    enabled: !!user?.email && !!trainee,
  });

  // MealPlanPreferences is a Base44-only entity — not in the new system.
  // Targets come from Trainee.target_* directly.
  const mealPlanPrefs = null;

  const { data: achievements = [] } = useQuery({
    queryKey: ['achievements', trainee?.user_email],
    queryFn: () => base44.entities.Achievement.filter({ trainee_email: trainee?.user_email }).catch(() => []),
    enabled: !!trainee?.user_email,
  });

  const { data: todayDailyWorkout } = useQuery({
    queryKey: ['dailyWorkout', today],
    queryFn: async () => {
      const workouts = await base44.entities.DailyWorkout.filter({ date: today, status: 'published' });
      return workouts[0] || null;
    },
    enabled: !!user?.email,
  });

  const { data: todayTemplates = [] } = useQuery({
    queryKey: ['dailyWorkoutTemplates', 'home', today],
    queryFn: () => base44.entities.DailyWorkoutTemplate.filter({ date: today, is_published: true }, '-created_date', 20),
    enabled: !!user?.email,
  });

  const { data: onlineDailyWorkout } = useQuery({
    queryKey: ['onlineDailyWorkout', user?.email, today],
    queryFn: async () => {
      const workouts = await base44.entities.OnlineDailyWorkout.filter({ trainee_email: user?.email, workout_date: today });
      return workouts[0] || null;
    },
    enabled: !!user?.email,
  });

  const { data: rotationSessionToday } = useQuery({
    queryKey: ['rotationSessionToday', user?.email, today],
    queryFn: async () => {
      
      // Get active assignments
      const assignments = await base44.entities.RotationAssignment.filter({ 
        trainee_email: user?.email,
        status: 'active'
      });
      
      if (assignments.length === 0) return null;

      // Get today's session instance
      const sessions = await base44.entities.RotationSessionInstance.filter({
        assignment_id: assignments[0].id,
        date: today
      });

      if (sessions.length === 0) return null;

      const session = sessions[0];

      // Get exercises for this category
      const exercises = await base44.entities.RotationCategoryExercise.filter({
        category_id: session.category_id
      });
      
      return {
        ...session,
        exercises: exercises.sort((a, b) => a.order_index - b.order_index),
        assignment: assignments[0]
      };
    },
    enabled: !!user?.email,
  });

  const { data: traineeWorkout } = useQuery({
    queryKey: ['traineeWorkout', user?.email, today],
    queryFn: async () => {
      const workouts = await base44.entities.TraineeWorkout.filter({ trainee_email: user?.email, date: today });
      return workouts[0] || null;
    },
    enabled: !!user?.email && !!todayDailyWorkout,
  });

  // Mutations - MUST BE CALLED UNCONDITIONALLY
  const addMealMutation = useMutation({
    mutationFn: (data) => base44.entities.MealEntry.create({
      ...data,
      trainee_id: trainee?.id || data.trainee_id,
      user_id: user?.id || data.user_id,
      trainee_email: trainee?.user_email || user?.email,
      date: data.date || today
    }),
    onSuccess: async () => {
      // Invalidate both today's meals and week meals so rings update immediately
      await queryClient.invalidateQueries({ queryKey: ['meals'] });
      await queryClient.invalidateQueries({ queryKey: ['allMealsWeek'] });
      queryClient.invalidateQueries({ queryKey: ['achievements', trainee?.user_email] });
      invalidateCoachTraineeSyncQueries(queryClient);
      logSyncEvent({ entity: 'MealEntry', trainee_id: trainee?.id, coach_id: trainee?.coach_email, source: 'trainee_home', write_success: true, refresh_success: true, visible_to_coach: true, visible_to_trainee: true });
      setShowMealDialog(false);
      setShowMealAIDialog(false);
      setShowMealPhotoDialog(false);
    },
  });

  const addWaterMutation = useMutation({
    mutationFn: (data) => base44.entities.WaterEntry.create({
      trainee_id: trainee?.id || data.trainee_id,
      trainee_email: trainee?.user_email || user?.email,
      amount_ml: data.amount_ml,
      date: data.date || today
    }),
    onSuccess: () => {
      // Invalidate both so water card updates immediately
      queryClient.invalidateQueries({ queryKey: ['water'] });
      queryClient.invalidateQueries({ queryKey: ['allWaterWeek'] });
      queryClient.invalidateQueries({ queryKey: ['achievements', trainee?.user_email] });
      invalidateCoachTraineeSyncQueries(queryClient);
      logSyncEvent({ entity: 'WaterEntry', trainee_id: trainee?.id, coach_id: trainee?.coach_email, source: 'trainee_home', write_success: true, refresh_success: true, visible_to_coach: true, visible_to_trainee: true });
      setShowWaterDialog(false);
      setShowQuickWater(false);
    },
  });

  const addWorkoutMutation = useMutation({
    mutationFn: (data) => base44.entities.WorkoutSession.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['workouts'] });
      queryClient.invalidateQueries({ queryKey: ['allWorkoutsWeek'] });
      queryClient.invalidateQueries({ queryKey: ['pointsToday'] });
      queryClient.invalidateQueries({ queryKey: ['pointsWeek'] });
      queryClient.invalidateQueries({ queryKey: ['achievements', trainee?.user_email] });
      setShowWorkoutDialog(false);
      setCelebration('workout');
      setTimeout(() => setCelebration(null), 3000);
    },
  });

  const addActivityMutation = useMutation({
    mutationFn: (data) => base44.entities.ActivityLog.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['activities'] });
      queryClient.invalidateQueries({ queryKey: ['workouts'] });
      queryClient.invalidateQueries({ queryKey: ['allWorkoutsWeek'] });
      setShowActivityAI(false);
    },
  });

  // Calculations with safe fallbacks - MUST BE CALLED UNCONDITIONALLY
  const totals = useMemo(() => {
    if (!Array.isArray(todayMeals)) return { calories: 0, protein: 0, carbs: 0, fat: 0 };
    return todayMeals.reduce((acc, meal) => ({
      calories: acc.calories + (meal?.calories || 0),
      protein: acc.protein + (meal?.protein || 0),
      carbs: acc.carbs + (meal?.carbs || 0),
      fat: acc.fat + (meal?.fat || 0),
    }), { calories: 0, protein: 0, carbs: 0, fat: 0 });
  }, [todayMeals]);

  const totalWater = useMemo(() => {
    if (!Array.isArray(todayWater)) return 0;
    return todayWater.reduce((acc, entry) => acc + (entry?.amount_ml || 0), 0);
  }, [todayWater]);

  const caloriesBurned = useMemo(() => {
    if (todayDeviceStats?.device_calories_burned) return todayDeviceStats.device_calories_burned;
    if (!Array.isArray(todayActivities)) return 0;
    return todayActivities.reduce((sum, a) => sum + (a?.calories_burned || 0), 0);
  }, [todayDeviceStats, todayActivities]);

  const targets = {
    calories: mealPlanPrefs?.target_daily_calories || trainee?.target_calories || 2000,
    protein: mealPlanPrefs?.target_protein_g || trainee?.target_protein || 150,
    carbs: mealPlanPrefs?.target_carbs_g || trainee?.target_carbs || 200,
    fat: mealPlanPrefs?.target_fat_g || trainee?.target_fat || 70,
    water: trainee?.water_target_ml ?? 3000,
  };

  const visibleModules = {
    nutrition: trainee?.visible_modules?.nutrition ?? true,
    water: trainee?.visible_modules?.water ?? true,
    workouts: trainee?.visible_modules?.workouts ?? true,
    metrics: trainee?.visible_modules?.metrics ?? true,
  };

  const includesBurned = trainee?.include_burned_calories_in_balance ?? false;
  const netCalories = includesBurned ? totals.calories - caloriesBurned : totals.calories;
  const filledMeals = [...new Set((todayMeals || []).map(m => m?.meal_type).filter(Boolean))];
  const dailyStatus = trainee ? getDailyStatus(todayMeals, todayWater, todayWorkouts, trainee) : null;
  
  const weeklyCompliance = useMemo(() => {
    if (!trainee) return null;
    return calculateWeeklyCompliance(allMealsWeek || [], allWaterWeek || [], allWorkoutsWeek || [], allMeasurementsWeek || [], trainee);
  }, [allMealsWeek, allWaterWeek, allWorkoutsWeek, allMeasurementsWeek, trainee]);

  useEffect(() => {
    if (!trainee?.id) return;
    const refresh = () => {
      invalidateCoachTraineeSyncQueries(queryClient);
      logSyncEvent({ entity: 'REALTIME_SYNC', trainee_id: trainee.id, coach_id: trainee.coach_email, source: 'trainee_home_subscription', refresh_success: true, visible_to_trainee: true });
    };
    const unsubMeal = base44.entities.MealEntry.subscribe(refresh);
    const unsubWater = base44.entities.WaterEntry.subscribe(refresh);
    const unsubMetrics = base44.entities.MetricsEntry.subscribe(refresh);
    const unsubTrainee = base44.entities.Trainee.subscribe(refresh);
    return () => { unsubMeal(); unsubWater(); unsubMetrics(); unsubTrainee(); };
  }, [trainee?.id, queryClient]);

  // Timeout guard — if loading for more than 12s show error
  const [loadingTooLong, setLoadingTooLong] = useState(false);
  const [retryCount, setRetryCount] = useState(0);
  const loadingTimerRef = useRef(null);

  useEffect(() => {
    if (userLoading || traineeLoading) {
      loadingTimerRef.current = setTimeout(() => {
        console.error('[TraineeHome] ⏰ TIMEOUT: Loading took >12s', {
          correlationId,
          userLoading,
          traineeLoading,
          user: !!user,
          retryCount
        });
        setLoadingTooLong(true);
      }, 12000);
    } else {
      clearTimeout(loadingTimerRef.current);
      setLoadingTooLong(false);
    }
    return () => clearTimeout(loadingTimerRef.current);
  }, [userLoading, traineeLoading]);

  // NOW we can do conditional returns - all hooks have been called
  if (loadingTooLong) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center p-4" dir="rtl">
        <div className="text-center max-w-sm">
          <div className="text-4xl mb-4">⚠️</div>
          <h2 className="text-xl font-bold text-slate-800 mb-2">יש בעיה בטעינת הרשאות</h2>
          <p className="text-slate-600 text-sm mb-6">הטעינה לוקחת יותר מדי זמן. ייתכן שיש בעיית חיבור לאינטרנט.</p>
          <div className="flex flex-col gap-3">
            <Button
              onClick={() => { setLoadingTooLong(false); setRetryCount(c => c + 1); window.location.reload(); }}
              className="w-full text-white"
              style={{ backgroundColor: '#79DBD6' }}
            >
              🔄 נסה שוב
            </Button>
            <Button
              variant="outline"
              onClick={() => base44.auth.logout(window.location.origin)}
              className="w-full"
            >
              התנתק והתחבר מחדש
            </Button>
          </div>
        </div>
      </div>
    );
  }

  if (userLoading || traineeLoading) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center" dir="rtl">
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-t-transparent rounded-full animate-spin mx-auto mb-4" style={{ borderColor: '#79DBD6', borderTopColor: 'transparent' }}></div>
          <p className="text-slate-600 text-sm">
            {userLoading ? 'טוען הרשאות...' : 'טוען פרופיל מתאמן...'}
          </p>
        </div>
      </div>
    );
  }

  if (!user) {
    return <LoginDiagnosticScreen />;
  }

  // No trainee record found for this user — show refresh prompt
  if (!trainee) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4" dir="rtl">
        <Card className="max-w-md w-full p-8 text-center border-2 border-amber-300">
          <div className="w-20 h-20 mx-auto mb-6 rounded-full flex items-center justify-center" style={{ backgroundColor: '#79DBD6' }}>
            <User className="w-12 h-12 text-white" />
          </div>
          <div className="w-16 h-16 border-4 border-t-transparent rounded-full animate-spin mx-auto mb-4" style={{ borderColor: '#79DBD6', borderTopColor: 'transparent' }}></div>
          <h2 className="text-2xl font-bold mb-3" style={{ color: '#79DBD6' }}>יוצר פרופיל...</h2>
          <p className="text-slate-700 mb-6">
            מכין את הכל בשבילך. רק שנייה...
          </p>
          <Button 
            onClick={() => window.location.reload()} 
            className="w-full text-white"
            style={{ backgroundColor: '#79DBD6' }}
          >
            🔄 רענן
          </Button>
        </Card>
      </div>
    );
  }



  const handleQuickAction = (id) => {
    if (id === 'photo') navigate(createPageUrl('NutritionLog'));
    if (id === 'ai') navigate(createPageUrl('NutritionLog'));
    if (id === 'water') setShowQuickWater(true);
    if (id === 'workout') setShowWorkoutDialog(true);
    if (id === 'mealplan') navigate('/MealPlanWizard');
  };

  return (
    <div className="min-h-screen" style={{ backgroundColor: '#f8f9fb' }} dir="rtl">
      <AutoLinkUserOnLogin />

      {!trainee?.user_id && user && (
        <div className="bg-amber-100 border-b border-amber-300 p-3 text-center">
          <p className="text-sm text-amber-800 font-medium">
            החשבון עדיין לא קושר למתאמן. התנתק והתחבר מחדש
          </p>
        </div>
      )}

      <div className="max-w-lg mx-auto px-4 py-4 pb-32">

        {/* Header with Back Button and Onboarding Reset */}
        <div className="flex items-center justify-between mb-4 px-2">
          <Link to="/">
            <button className="p-2 rounded-full hover:bg-slate-100 min-h-0 min-w-0">
              <ArrowRight className="w-5 h-5 text-slate-600" />
            </button>
          </Link>
          {trainee?.onboarding_status !== 'completed' && (
            <Button
              onClick={() => base44.entities.Trainee.update(trainee.id, { onboarding_status: 'pending' }).then(() => window.location.reload())}
              className="text-white"
              style={{ backgroundColor: '#79DBD6' }}
            >
              🔖 התחל הדרכה
            </Button>
          )}
        </div>

        {/* Hero Header */}
        <HomeHeader user={user} trainee={trainee} onOpenAICoach={() => setShowAICoach(true)} />

        {/* Daily Stats Row */}
        <DailyStatsRow
          totals={totals}
          targets={targets}
          totalWater={totalWater}
          todayWorkouts={todayWorkouts}
          visibleModules={visibleModules}
          onWaterClick={() => setShowQuickWater(true)}
        />

        <CalorieDeficitMotivationCard
          totals={totals}
          allMeals={allMealsWeek || []}
          targets={targets}
          trainee={trainee}
          measurements={allMeasurementsWeek || []}
          caloriesBurned={caloriesBurned}
          includesBurned={includesBurned}
        />

        {/* Weekly Tasks Panel */}
        <WeeklyTasksPanel
          meals={allMealsWeek || []}
          water={allWaterWeek || []}
          workouts={allWorkoutsWeek || []}
          trainee={trainee}
        />

        {/* Goal Progress */}
        <GoalProgressCard trainee={trainee} measurements={allMeasurementsWeek || []} />

        {/* Today's Workout */}
        {visibleModules.workouts && (
          <TodayWorkoutCard
            todayDailyWorkout={todayDailyWorkout}
            todayTemplates={todayTemplates}
            rotationSessionToday={rotationSessionToday}
            onlineDailyWorkout={onlineDailyWorkout}
            traineeWorkout={traineeWorkout}
            onAddManual={() => setShowWorkoutDialog(true)}
          />
        )}

        {/* Achievements */}
        {achievements && achievements.length > 0 && (
          <div className="rounded-2xl p-4 mb-4 bg-gradient-to-br from-amber-50 to-amber-100 border-2 border-amber-200">
            <div className="flex items-center gap-2 mb-3">
              <span className="text-lg">🏆</span>
              <p className="text-sm font-bold text-amber-800">ההישגים שלי</p>
            </div>
            <AchievementsBadge achievements={achievements} />
          </div>
        )}

        {/* Quick Actions */}
        <QuickActionsBar onAction={handleQuickAction} visibleModules={visibleModules} />

      </div>

      <HelpButton pageName="TraineeHome" />
      <NotificationAlert userEmail={user.email} />
      
      {celebration && (
        <GoalCelebrationAnimation type={celebration} show={true} onComplete={() => setCelebration(null)} />
      )}

      {/* Dialogs */}
      <AddMealFromPhoto open={showMealPhotoDialog} onClose={() => setShowMealPhotoDialog(false)} onSuccess={() => { queryClient.invalidateQueries({ queryKey: ['meals'] }); queryClient.invalidateQueries({ queryKey: ['allMealsWeek'] }); setShowMealPhotoDialog(false); }} mealType={selectedMealType} traineeEmail={trainee.user_email || user.email} />
      <AddMealWithAI open={showMealAIDialog} onClose={() => setShowMealAIDialog(false)} onSave={(data) => addMealMutation.mutate(data)} traineeEmail={trainee.user_email || user.email} />
      <AddMealManual open={showMealDialog} onClose={() => setShowMealDialog(false)} onSave={(data) => addMealMutation.mutate(data)} traineeEmail={trainee.user_email || user.email} />
      <AddWaterDialog open={showWaterDialog} onClose={() => setShowWaterDialog(false)} onSave={(data) => addWaterMutation.mutate(data)} traineeEmail={trainee.user_email || user.email} />

      {/* Quick Water Tap Sheet */}
      {showQuickWater && (
        <div className="fixed inset-0 z-50 flex items-end" dir="rtl" onClick={() => setShowQuickWater(false)}>
          <div className="absolute inset-0 bg-black/40" />
          <div className="relative w-full bg-white rounded-t-2xl p-6 shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="w-10 h-1 bg-slate-200 rounded-full mx-auto mb-4" />
            <div className="flex items-center gap-2 mb-4">
              <Droplets className="w-5 h-5 text-blue-500" />
              <h3 className="font-bold text-slate-800">הוסף מים</h3>
              <span className="text-sm text-slate-500 mr-auto">{totalWater} / {targets.water} מ״ל</span>
            </div>
            <div className="grid grid-cols-2 gap-3 mb-3">
              {[250, 500, 750, 1000].map(ml => (
                <Button
                  key={ml}
                  variant="outline"
                  className="h-14 text-base border-2 border-blue-200 text-blue-700 hover:bg-blue-50"
                  onClick={() => addWaterMutation.mutate({ trainee_email: trainee.user_email || user.email, amount_ml: ml, date: today })}
                  disabled={addWaterMutation.isPending}
                >
                  + {ml >= 1000 ? '1 ליטר' : `${ml} מ״ל`}
                </Button>
              ))}
            </div>
            {totalWater > 0 && (
              <Button
                variant="ghost"
                className="w-full text-red-500 text-sm"
                onClick={() => addWaterMutation.mutate({ trainee_email: trainee.user_email || user.email, amount_ml: -250, date: today })}
                disabled={addWaterMutation.isPending}
              >
                הפחת 250 מ״ל
              </Button>
            )}
            <Button variant="ghost" className="w-full mt-1 text-slate-500" onClick={() => { setShowQuickWater(false); setShowWaterDialog(true); }}>
              קבע ידנית
            </Button>
          </div>
        </div>
      )}
      <AddWorkoutDialog 
        open={showWorkoutDialog} 
        onClose={() => { setShowWorkoutDialog(false); setPrefilledWorkoutExercises([]); }} 
        onSave={(data) => addWorkoutMutation.mutate(data)} 
        traineeEmail={user.email} 
        previousWorkouts={allWorkoutsWeek || []} 
        prefilledExercises={prefilledWorkoutExercises} 
      />
      <AddWorkoutFromPhoto open={showWorkoutPhotoDialog} onClose={() => setShowWorkoutPhotoDialog(false)} onWorkoutDetected={(ex) => { setPrefilledWorkoutExercises(ex); setShowWorkoutPhotoDialog(false); setShowWorkoutDialog(true); }} />
      <AddActivityWithAI open={showActivityAI} onClose={() => setShowActivityAI(false)} onSuccess={(data) => addActivityMutation.mutate(data)} traineeEmail={user.email} />
      <EditPersonalInfo open={showPersonalInfo} onClose={() => setShowPersonalInfo(false)} trainee={trainee} />
      <SuggestFoodDialog open={showSuggestFood} onClose={() => setShowSuggestFood(false)} trainee={trainee} />
      {showAICoach && (
        <SuperAICoach open={showAICoach} onClose={() => setShowAICoach(false)} trainee={trainee} meals={allMealsWeek || []} water={allWaterWeek || []} workouts={allWorkoutsWeek || []} measurements={allMeasurementsWeek || []} />
      )}
    </div>
  );
}

export default function TraineeHome() {
  return (
    <HomeErrorBoundary>
      <TraineeHomeContent />
    </HomeErrorBoundary>
  );
}