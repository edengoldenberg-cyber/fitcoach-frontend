import React, { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { useNavigate, Routes, Route, Link, useLocation, Navigate } from 'react-router-dom';
import HomeErrorBoundary from '../components/shared/HomeErrorBoundary';

// Import all trainee pages
import TraineeHome from './TraineeHome';
import NutritionLog from './NutritionLog';
import WorkoutLog from './WorkoutLog';
import WaterLog from './WaterLog';
import Metrics from './Metrics';
import TraineeNotifications from './TraineeNotifications';
import TraineeProfile from './TraineeProfile';

import { Home, Utensils, Dumbbell, Droplets, Scale, Bell, User, X, ChevronDown, ChevronUp, RotateCcw, Trash2, Trophy } from 'lucide-react';
import ShapeLeagueHome from './ShapeLeagueHome';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';

// No hardcoded test email — previewEmail is computed per-coach at runtime in CoachAsTrainee().

const TABS = [
  { id: 'home', label: 'בית', icon: Home, path: '/CoachAsTrainee' },
  { id: 'nutrition', label: 'תזונה', icon: Utensils, path: '/CoachAsTrainee/nutrition' },
  { id: 'workout', label: 'אימון', icon: Dumbbell, path: '/CoachAsTrainee/workout' },
  { id: 'league', label: 'ליגה', icon: Trophy, path: '/CoachAsTrainee/league' },
  { id: 'notifications', label: 'התראות', icon: Bell, path: '/CoachAsTrainee/notifications' },
];

function TestToolsPanel({ traineeId, traineeEmail, onReset }) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const queryClient = useQueryClient();
  const today = new Date().toISOString().split('T')[0];

  const run = async (label, fn) => {
    setLoading(true);
    try {
      await fn();
      toast.success(`✅ ${label}`);
      queryClient.invalidateQueries();
    } catch (e) {
      toast.error(`שגיאה: ${e.message}`);
    } finally {
      setLoading(false);
    }
  };

  const addSampleMeal = () => run('נוספה ארוחה לדוגמה', async () => {
    const trainees = await base44.entities.Trainee.filter({ user_email: traineeEmail });
    const tid = trainees[0]?.id;
    return base44.entities.MealEntry.create({
      trainee_id: tid, trainee_email: traineeEmail, date: today, meal_type: 'lunch',
      food_name: 'עוף בגריל + אורז', calories: 450, protein: 40, carbs: 35, fat: 12, quantity: 1, unit: 'מנה'
    });
  });

  const addSampleWater = () => run('נוספו מים לדוגמה', async () => {
    const trainees = await base44.entities.Trainee.filter({ user_email: traineeEmail });
    const tid = trainees[0]?.id;
    return base44.entities.WaterEntry.create({
      trainee_id: tid, trainee_email: traineeEmail, date: today, amount_ml: 500, container_type: 'large_bottle'
    });
  });

  const addSampleWorkout = () => run('נוסף אימון לדוגמה', async () => {
    const trainees = await base44.entities.Trainee.filter({ user_email: traineeEmail });
    const tid = trainees[0]?.id;
    return base44.entities.WorkoutSession.create({
      trainee_id: tid, trainee_email: traineeEmail, date: today, title: 'אימון כוח עליון', duration_minutes: 45,
      notes: 'אימון בדיקה', status: 'completed'
    });
  });

  const addSampleMetrics = () => run('נוספו מדדים', () =>
    base44.entities.MetricsEntry.create({
      trainee_email: traineeEmail, date: today, weight_kg: 75, body_fat_percent: 18, source: 'manual'
    })
  );

  const clearToday = () => run('נוקה היום הנוכחי', async () => {
    const [meals, water, workouts] = await Promise.all([
      base44.entities.MealEntry.filter({ trainee_email: traineeEmail, date: today }),
      base44.entities.WaterEntry.filter({ trainee_email: traineeEmail, date: today }),
      base44.entities.WorkoutSession.filter({ trainee_email: traineeEmail, date: today }),
    ]);
    await Promise.all([
      ...meals.map(m => base44.entities.MealEntry.delete(m.id)),
      ...water.map(w => base44.entities.WaterEntry.delete(w.id)),
      ...workouts.map(w => base44.entities.WorkoutSession.delete(w.id)),
    ]);
  });

  return (
    <div className="fixed bottom-16 left-0 right-0 z-40" dir="rtl">
      <div className="max-w-lg mx-auto px-3">
        <div className="bg-slate-900 rounded-xl shadow-2xl overflow-hidden border border-slate-700">
          <button
            onClick={() => setOpen(!open)}
            className="w-full flex items-center justify-between px-4 py-2 text-white text-xs font-bold bg-slate-800 hover:bg-slate-700 transition-colors min-h-0 min-w-0"
          >
            <span className="flex items-center gap-1.5">🔧 כלי בדיקה</span>
            {open ? <ChevronDown className="w-3 h-3" /> : <ChevronUp className="w-3 h-3" />}
          </button>

          {open && (
            <div className="p-3 grid grid-cols-2 gap-2">
              <button onClick={addSampleMeal} disabled={loading} className="bg-green-700 hover:bg-green-600 text-white text-xs py-2 px-3 rounded-lg transition-colors min-h-0 min-w-0 text-center">
                🍗 ארוחה לדוגמה
              </button>
              <button onClick={addSampleWater} disabled={loading} className="bg-blue-700 hover:bg-blue-600 text-white text-xs py-2 px-3 rounded-lg transition-colors min-h-0 min-w-0 text-center">
                💧 מים לדוגמה
              </button>
              <button onClick={addSampleWorkout} disabled={loading} className="bg-purple-700 hover:bg-purple-600 text-white text-xs py-2 px-3 rounded-lg transition-colors min-h-0 min-w-0 text-center">
                🏋️ אימון לדוגמה
              </button>
              <button onClick={addSampleMetrics} disabled={loading} className="bg-orange-700 hover:bg-orange-600 text-white text-xs py-2 px-3 rounded-lg transition-colors min-h-0 min-w-0 text-center">
                📊 הוסף מדדים
              </button>
              <button onClick={clearToday} disabled={loading} className="bg-red-800 hover:bg-red-700 text-white text-xs py-2 px-3 rounded-lg transition-colors min-h-0 min-w-0 text-center">
                🗑️ נקה היום
              </button>
              <button onClick={onReset} disabled={loading} className="bg-slate-600 hover:bg-slate-500 text-white text-xs py-2 px-3 rounded-lg transition-colors min-h-0 min-w-0 text-center">
                ↺ איפוס מתאמן
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function CoachAsTraineeShell({ traineeId, traineeEmail, onExit, onReset }) {
  const location = useLocation();

  // Override auth.me so trainee pages resolve to our test email
  // We patch the global context via the URL path for tab detection
  const tabs = TABS;
  const currentPath = location.pathname;

  // Determine which page to render based on path
  const getPage = () => {
    if (currentPath === '/CoachAsTrainee/nutrition') return <NutritionLog />;
    if (currentPath === '/CoachAsTrainee/workout') return <WorkoutLog />;
    if (currentPath === '/CoachAsTrainee/water') return <WaterLog />;
    if (currentPath === '/CoachAsTrainee/metrics') return <Metrics />;
    if (currentPath === '/CoachAsTrainee/notifications') return <TraineeNotifications />;
    if (currentPath.startsWith('/CoachAsTrainee/profile')) return <TraineeProfile />;
    if (currentPath === '/CoachAsTrainee/league') return <ShapeLeagueHome />;
    return <TraineeHome />;
  };

  return (
    <div className="min-h-screen bg-white" dir="rtl">
      {/* Test Mode Banner */}
      <div
        className="sticky top-0 z-50 flex items-center justify-between px-4 py-2.5 text-white text-sm font-semibold shadow-md"
        style={{ background: 'linear-gradient(90deg, #f59e0b, #d97706)' }}
      >
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-base flex-shrink-0">🧪</span>
          <span className="truncate text-xs">מצב תצוגה מקדימה: ממשק מתאמן</span>
        </div>
        <Button
          size="sm"
          onClick={onExit}
          className="bg-white text-amber-700 hover:bg-amber-50 border-0 font-bold h-7 px-3 text-xs flex-shrink-0 min-h-0"
        >
          ← חזור
        </Button>
      </div>

      {/* Page Content */}
      <div className="pb-32">
        <HomeErrorBoundary>
          {getPage()}
        </HomeErrorBoundary>
      </div>

      {/* Test Tools Panel */}
      <TestToolsPanel traineeId={traineeId} traineeEmail={traineeEmail} onReset={onReset} />

      {/* Bottom Navigation - identical to trainee nav */}
      <nav className="fixed bottom-0 left-0 right-0 bg-white border-t shadow-lg z-50">
        <div className="max-w-lg mx-auto">
          <div className="flex justify-around items-center h-16">
            {tabs.map(({ id, label, icon: Icon, path }) => {
              const isActive = currentPath === path || (path === '/CoachAsTrainee' && currentPath === '/CoachAsTrainee');
              return (
                <Link
                  key={id}
                  to={path}
                  className="flex flex-col items-center justify-center flex-1 h-full transition-colors relative min-w-0"
                  style={{ color: isActive ? '#79DBD6' : '#94a3b8' }}
                >
                  <Icon className={`w-5 h-5 mb-1 flex-shrink-0 ${isActive ? 'stroke-[2.5px]' : ''}`} />
                  <span className={`text-[10px] truncate max-w-full px-1 ${isActive ? 'font-medium' : ''}`}>{label}</span>
                </Link>
              );
            })}
          </div>
        </div>
      </nav>
    </div>
  );
}

export default function CoachAsTrainee() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [traineeReady, setTraineeReady] = useState(false);
  const [traineeId, setTraineeId] = useState(null);
  const [setupError, setSetupError] = useState(null);

  const { data: user, isLoading: userLoading } = useQuery({
    queryKey: ['currentUser'],
    queryFn: () => base44.auth.me(),
  });

  // Coach guard (defense-in-depth; primary gate is CoachRoute in App.jsx).
  // Uses same cache key as CoachRoute so no extra network call.
  const { data: coachTrainees, isLoading: loadingCoachCheck } = useQuery({
    queryKey: ['coachGuardTrainees', user?.email],
    queryFn: () => base44.entities.Trainee.filter({ coach_email: user.email }),
    enabled: !!user?.email && user?.role !== 'admin',
    staleTime: 5 * 60 * 1000,
  });

  // Per-coach preview email — clearly synthetic, scoped by user ID, never a real account.
  // Uses __preview__ prefix + first 12 chars of stripped user ID + @fitcoach.local.
  // Each coach gets their own isolated preview space that persists across sessions.
  const previewEmail = user?.id
    ? `__preview__${user.id.replace(/-/g, '').slice(0, 12)}@fitcoach.local`
    : null;

  const ensureTrainee = async () => {
    if (!previewEmail || !user) return;
    try {
      let trainees = await base44.entities.Trainee.filter({ user_email: previewEmail });
      let trainee;
      if (trainees.length === 0) {
        trainee = await base44.entities.Trainee.create({
          user_id: user.id,
          user_email: previewEmail,
          coach_email: user.email,
          full_name: 'תצוגה מקדימה',
          phone: '',
          status: 'active',
          whatsapp_notifications_enabled: false,
          target_calories: 2000,
          target_protein: 150,
          target_carbs: 200,
          target_fat: 70,
          target_water_ml: 3000,
          activity_level: 'moderate',
          goal: 'maintain',
          visible_modules: { nutrition: true, water: true, workouts: true, metrics: true },
          home_layout_version: 'default_v2',
        });
      } else {
        trainee = trainees[0];
        // Always enforce safety: no whatsapp on preview accounts
        if (trainee.whatsapp_notifications_enabled !== false) {
          await base44.entities.Trainee.update(trainee.id, { whatsapp_notifications_enabled: false });
        }
      }
      setTraineeId(trainee.id);
      setTraineeReady(true);
    } catch (err) {
      setSetupError(err.message);
    }
  };

  useEffect(() => {
    if (!user || !previewEmail) return;
    ensureTrainee();
  }, [user, previewEmail]);

  const handleReset = async () => {
    if (!previewEmail) return;
    if (!window.confirm('איפוס יגרום למחיקת כל הנתונים של פרופיל הבדיקה. להמשיך?')) return;
    try {
      const [trainees, meals, water, workouts, metrics] = await Promise.all([
        base44.entities.Trainee.filter({ user_email: previewEmail }),
        base44.entities.MealEntry.filter({ trainee_email: previewEmail }),
        base44.entities.WaterEntry.filter({ trainee_email: previewEmail }),
        base44.entities.WorkoutSession.filter({ trainee_email: previewEmail }),
        base44.entities.MetricsEntry.filter({ trainee_email: previewEmail }),
      ]);
      await Promise.all([
        ...trainees.map(t => base44.entities.Trainee.delete(t.id)),
        ...meals.map(m => base44.entities.MealEntry.delete(m.id)),
        ...water.map(w => base44.entities.WaterEntry.delete(w.id)),
        ...workouts.map(w => base44.entities.WorkoutSession.delete(w.id)),
        ...metrics.map(m => base44.entities.MetricsEntry.delete(m.id)),
      ]);
      setTraineeReady(false);
      setTraineeId(null);
      queryClient.clear();
      await ensureTrainee();
      toast.success('המתאמן אופס בהצלחה');
    } catch (e) {
      toast.error('שגיאה באיפוס: ' + e.message);
    }
  };

  const handleExit = () => navigate('/CoachDashboard');

  // In-component auth guard — redirect trainees who somehow bypass CoachRoute
  const isAdmin = user?.role === 'admin';
  const isCoach = isAdmin || (coachTrainees?.length > 0);
  if (!userLoading && !loadingCoachCheck && user && !isCoach) {
    return <Navigate to="/" replace />;
  }

  if (userLoading || (!isAdmin && loadingCoachCheck) || (!traineeReady && !setupError)) {
    return (
      <div className="min-h-screen flex items-center justify-center" dir="rtl">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-t-transparent rounded-full animate-spin mx-auto mb-3"
            style={{ borderColor: '#f59e0b', borderTopColor: 'transparent' }} />
          <p className="text-slate-600 text-sm">מכין ממשק מתאמן...</p>
        </div>
      </div>
    );
  }

  if (setupError) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6" dir="rtl">
        <div className="text-center max-w-sm">
          <p className="text-red-600 font-bold mb-2">שגיאה בטעינת ממשק מתאמן</p>
          <p className="text-slate-500 text-sm mb-4">{setupError}</p>
          <button onClick={handleExit} className="text-amber-600 underline text-sm">חזור לממשק מאמן</button>
        </div>
      </div>
    );
  }

  return (
    <CoachAsTraineeShell
      traineeId={traineeId}
      traineeEmail={previewEmail}
      onExit={handleExit}
      onReset={handleReset}
    />
  );
}