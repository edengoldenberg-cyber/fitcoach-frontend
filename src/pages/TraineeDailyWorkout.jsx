import React, { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ArrowRight, CheckCircle2, Copy, Users, Search } from "lucide-react";
import { createPageUrl } from '@/utils';
import { format } from 'date-fns';
import { he } from 'date-fns/locale/he';
import { Link } from 'react-router-dom';
import ExerciseCard from '../components/trainee/ExerciseCard';
import CopyWorkoutDialogTrainee from '../components/trainee/CopyWorkoutDialogTrainee';
import SupersetGroupCard from '../components/trainee/SupersetGroupCard';
import { toast } from 'sonner';

// Build marker — injected at build time so users can confirm their device is running the latest code.
const BUILD_TS = typeof __BUILD_TS__ !== 'undefined' ? __BUILD_TS__ : 'dev';

export default function TraineeDailyWorkout() {
  const queryClient = useQueryClient();
  const [previousWorkouts, setPreviousWorkouts] = useState({});
  const [showCopyDialog, setShowCopyDialog] = useState(false);
  const [exerciseSearch, setExerciseSearch] = useState('');

  const { data: user } = useQuery({
    queryKey: ['currentUser'],
    queryFn: () => base44.auth.me(),
  });

  const { data: trainee } = useQuery({
    queryKey: ['trainee', user?.email],
    queryFn: async () => {
      const trainees = await base44.entities.Trainee.filter({ user_email: user?.email });
      const t = trainees[0];
      if (t) {
        // normalize: ensure user_email is always populated
        t.user_email = t.user_email || t.email || user?.email;
      }
      return t;
    },
    enabled: !!user?.email,
  });

  // Get today's daily workout
  const { data: dailyWorkouts = [] } = useQuery({
    queryKey: ['dailyWorkouts', trainee?.coach_email],
    queryFn: async () => {
      const workouts = await base44.entities.DailyWorkout.filter({ 
        coach_email: trainee?.coach_email,
        status: 'published'
      });
      return Array.isArray(workouts) ? workouts : [];
    },
    enabled: !!trainee?.coach_email,
  });

  const todayStr = format(new Date(), 'yyyy-MM-dd');
  const todayWorkouts = dailyWorkouts?.filter(w => w?.date === todayStr);
  const todayWorkout = todayWorkouts?.[0];

  // Extract exercises from the workout JSON - with safety
  const rawEx = todayWorkout?.exercises;
  const todayExercises = Array.isArray(rawEx)
    ? rawEx
    : (typeof rawEx === 'string' ? (() => { try { return JSON.parse(rawEx); } catch { return []; } })() : []);
  
  // ── Debug logging — visible in browser console ──────────────────────────
  console.log('[TraineeDailyWorkout] BUILD:', BUILD_TS);
  console.log('[TraineeDailyWorkout] todayStr:', todayStr);
  console.log('[TraineeDailyWorkout] coach_email:', trainee?.coach_email);
  console.log('[TraineeDailyWorkout] dailyWorkouts (total from API):', dailyWorkouts.length);
  console.log('[TraineeDailyWorkout] todayWorkouts (after date filter):', todayWorkouts?.length);
  console.log('[TraineeDailyWorkout] workout titles:', todayWorkouts?.map(w => w.title || w.title_he));
  // ── end debug ────────────────────────────────────────────────────────────

  // Fetch previous workout data for all exercises
  useEffect(() => {
    if (!trainee?.user_email || todayExercises.length === 0) return;

    const fetchPrevious = async () => {
      try {
        const exerciseIds = todayExercises
          .filter(ex => ex?.exercise_id || ex?.exercise_name)
          .map(ex => ex.exercise_id || ex.exercise_name);
        
        if (exerciseIds.length === 0) return;
        
        const result = await base44.functions.invoke('getPreviousWorkouts', {
          trainee_email: trainee.user_email,
          exercise_ids: exerciseIds
        });
        
        if (result.data?.success) {
          setPreviousWorkouts(result.data.data || {});
        }
      } catch (error) {
        console.error('Failed to fetch previous workouts:', error);
      }
    };

    fetchPrevious();
  }, [trainee?.user_email, todayExercises.length]);

  const saveExerciseMutation = useMutation({
    mutationFn: async ({ exercise, sets }) => {
      // trainee?.user_email may be undefined if the Trainee record has user_email=null;
      // the backend falls back to req.user.email from the JWT in that case.
      const result = await base44.functions.invoke('saveExerciseProgress', {
        trainee_email: trainee?.user_email,
        date: format(new Date(), 'yyyy-MM-dd'),
        workout_id: todayWorkout?.id,
        exercise_name: exercise.exercise_name || exercise.name,
        exercise_id: exercise.exercise_id || null,
        sets: sets.map(s => ({
          weight: parseFloat(s.weight) || 0,
          reps: parseInt(s.reps) || 0
        }))
      });

      if (!result.data?.success) {
        throw new Error(result.data?.error || 'שגיאה בשמירה');
      }

      return result.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['traineeWorkouts'] });
      queryClient.invalidateQueries({ queryKey: ['todayTraineeWorkout'] });

      // Refresh previous workouts after save
      const exerciseIds = todayExercises
        .filter(ex => ex?.exercise_id || ex?.exercise_name)
        .map(ex => ex.exercise_id || ex.exercise_name);

      if (exerciseIds.length > 0) {
        base44.functions.invoke('getPreviousWorkouts', {
          trainee_email: trainee?.user_email,
          exercise_ids: exerciseIds
        }).then(result => {
          if (result.data?.success) {
            setPreviousWorkouts(result.data.data || {});
          }
        });
      }
    }
  });

  const handleSaveExercise = async (exercise, sets) => {
    await saveExerciseMutation.mutateAsync({ exercise, sets });
  };

  // Loading state
  if (!dailyWorkouts) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-orange-50 to-slate-100 p-6 flex items-center justify-center" dir="rtl">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-orange-500 mx-auto mb-4"></div>
          <p className="text-slate-600">טוען אימון יומי...</p>
        </div>
      </div>
    );
  }

  if (!todayWorkouts || todayWorkouts.length === 0) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-orange-50 to-slate-100 p-6 pb-24" dir="rtl">
        <div className="max-w-2xl mx-auto">
          <div className="flex items-center gap-3 mb-6">
            <Link to={createPageUrl('WorkoutLog')}>
              <Button variant="ghost" size="icon">
                <ArrowRight className="w-5 h-5" />
              </Button>
            </Link>
            <div>
              <h1 className="text-2xl font-bold text-slate-800">אימון קבוצתי</h1>
              <p className="text-sm text-slate-500">אימון לסטודיו</p>
            </div>
          </div>

          <Card className="bg-white border-0 shadow-lg">
            <CardContent className="p-8">
              <div className="empty-state">
                <Users className="empty-state-icon" />
                <h3 className="empty-state-title">אין אימון קבוצתי</h3>
                <p className="empty-state-description">המאמן טרם פרסם אימון קבוצתי להיום</p>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  // Filtered exercises based on search (applied to the first/primary workout for search UI)
  const filteredExercises = exerciseSearch.trim()
    ? todayExercises.filter(ex =>
        (ex?.exercise_name || '').toLowerCase().includes(exerciseSearch.toLowerCase())
      )
    : todayExercises;

  // Build render list: group grouped exercises, keep standalone as-is
  const buildRenderList = (exList) => {
    const rendered = [];
    const seenGroups = new Set();

    exList.forEach((ex, idx) => {
      if (!ex?.group_id) {
        rendered.push({ type: 'standalone', ex, idx });
        return;
      }
      if (seenGroups.has(ex.group_id)) return;
      seenGroups.add(ex.group_id);
      const groupExercises = exList.filter(e => e?.group_id === ex.group_id);
      rendered.push({
        type: 'group',
        group_id: ex.group_id,
        group_type: ex.group_type || 'superset',
        round_count: ex.round_count || 3,
        rest_after_round_seconds: ex.rest_after_round_seconds || 60,
        exercises: groupExercises,
      });
    });
    return rendered;
  };

  // Safe render wrapper to catch errors
  const renderExercises = () => {
    try {
      if (!filteredExercises || filteredExercises.length === 0) {
        return (
          <Card className="bg-white border-0 shadow-lg">
            <CardContent className="p-8 text-center text-slate-500">
              אין תרגילים באימון היומי
            </CardContent>
          </Card>
        );
      }

      const renderList = buildRenderList(filteredExercises);

      return renderList.map((item, i) => {
        try {
          if (item.type === 'group') {
            return (
              <SupersetGroupCard
                key={item.group_id}
                exercises={item.exercises}
                groupMeta={{ group_type: item.group_type, round_count: item.round_count, rest_after_round_seconds: item.rest_after_round_seconds }}
                previousWorkouts={previousWorkouts}
                onSave={handleSaveExercise}
              />
            );
          }

          const ex = item.ex;
          const idx = item.idx;
          const exerciseKey = ex?.exercise_id || ex?.exercise_name || `exercise_${idx}`;
          const previousData = previousWorkouts[exerciseKey];

          return (
            <ExerciseCard
              key={exerciseKey}
              exercise={{
                exercise_name: ex?.exercise_name || 'תרגיל',
                exercise_id: ex?.exercise_id || null,
                default_sets_count: ex?.sets || 3,
                target_reps_min: ex?.reps_min,
                target_reps_max: ex?.reps_max,
                notes: ex?.notes,
                sets: ex?.sets || []
              }}
              index={idx}
              previousData={previousData}
              onSave={handleSaveExercise}
            />
          );
        } catch (err) {
          console.error(`Error rendering item ${i}:`, err);
          return (
            <Card key={`error_${i}`} className="bg-red-50 border-red-200">
              <CardContent className="p-4 text-center text-red-600">שגיאה בטעינת תרגיל</CardContent>
            </Card>
          );
        }
      });
    } catch (error) {
      console.error('Error rendering exercises:', error);
      return (
        <Card className="bg-red-50 border-red-200">
          <CardContent className="p-8 text-center text-red-600">
            שגיאה בטעינת התרגילים. נסה לרענן את הדף.
          </CardContent>
        </Card>
      );
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50 p-4 pb-24" dir="rtl">
      <div className="max-w-2xl mx-auto space-y-4">
        {/* Header */}
        <div className="flex items-center gap-3 mb-4">
          <Link to={createPageUrl('WorkoutLog')}>
            <Button variant="ghost" size="icon">
              <ArrowRight className="w-5 h-5" />
            </Button>
          </Link>
          <div>
            <h1 className="text-2xl font-bold text-slate-800">
              אימון קבוצתי - {format(new Date(), 'd בMMMM', { locale: he })}
            </h1>
            <p className="text-sm text-slate-500 mt-1">
              {todayWorkouts.length > 1 ? `${todayWorkouts.length} אימונים להיום` : 'האימון הקבוצתי שלך לסטודיו'}
            </p>
          </div>
        </div>

        {/* Debug banner — visible to user and coach for version/cache diagnosis */}
        <div className="bg-slate-800 text-slate-300 rounded-xl px-3 py-2 text-xs font-mono flex items-center justify-between gap-2">
          <span>v{BUILD_TS} · {todayWorkouts.length} אימונים · {todayStr}</span>
          <button
            onClick={async () => {
              if ('serviceWorker' in navigator) {
                const regs = await navigator.serviceWorker.getRegistrations();
                for (const r of regs) await r.unregister();
              }
              if ('caches' in window) {
                const keys = await caches.keys();
                for (const k of keys) await caches.delete(k);
              }
              window.location.reload(true);
            }}
            className="text-teal-400 underline shrink-0"
          >
            עדכן
          </button>
        </div>

        {/* Exercise Search (only when 1 workout to keep UX simple) */}
        {todayWorkouts.length === 1 && todayExercises.length > 3 && (
          <div className="relative">
            <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              type="text"
              placeholder="חפש תרגיל..."
              value={exerciseSearch}
              onChange={e => setExerciseSearch(e.target.value)}
              className="w-full h-11 pr-10 pl-4 border border-slate-200 rounded-xl text-sm bg-white focus:outline-none focus:border-orange-400 focus:ring-2 focus:ring-orange-100"
              dir="rtl"
            />
          </div>
        )}

        {/* Render ALL today's workouts */}
        {todayWorkouts.map((workout, workoutIdx) => {
          const rawExercises = workout?.exercises;
          const exercises = Array.isArray(rawExercises)
            ? rawExercises
            : (typeof rawExercises === 'string' ? (() => { try { return JSON.parse(rawExercises); } catch { return []; } })() : []);

          const displayExercises = (todayWorkouts.length === 1 && exerciseSearch.trim())
            ? exercises.filter(ex => (ex?.exercise_name || '').toLowerCase().includes(exerciseSearch.toLowerCase()))
            : exercises;

          return (
            <div key={workout.id} className="space-y-4">
              {/* Workout header card */}
              <Card className="bg-gradient-to-l from-orange-50 to-orange-100 border-2 border-orange-200">
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-orange-700 flex items-center gap-2">
                      <CheckCircle2 className="w-5 h-5" />
                      {workout.title || workout.title_he || `אימון ${workoutIdx + 1}`}
                      {todayWorkouts.length > 1 && (
                        <span className="text-xs font-normal text-orange-500 bg-orange-100 px-2 py-0.5 rounded-full">
                          {workoutIdx + 1} / {todayWorkouts.length}
                        </span>
                      )}
                    </CardTitle>
                    {exercises.length > 0 && workoutIdx === 0 && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setShowCopyDialog(true)}
                        className="text-orange-600 hover:text-orange-700"
                      >
                        <Copy className="w-4 h-4 ml-1" />
                        העתק
                      </Button>
                    )}
                  </div>
                </CardHeader>
                {workout.description_he && (
                  <CardContent>
                    <p className="text-sm text-slate-700">{workout.description_he}</p>
                  </CardContent>
                )}
              </Card>

              {/* Exercise cards for this workout */}
              <div className="space-y-4">
                {displayExercises.length === 0 ? (
                  <Card className="bg-white border-0 shadow-lg">
                    <CardContent className="p-8 text-center text-slate-500">
                      אין תרגילים באימון זה
                    </CardContent>
                  </Card>
                ) : (
                  (() => {
                    const renderList = buildRenderList(displayExercises);
                    return renderList.map((item, i) => {
                      try {
                        if (item.type === 'group') {
                          return (
                            <SupersetGroupCard
                              key={`${workout.id}_${item.group_id}`}
                              exercises={item.exercises}
                              groupMeta={{ group_type: item.group_type, round_count: item.round_count, rest_after_round_seconds: item.rest_after_round_seconds }}
                              previousWorkouts={previousWorkouts}
                              onSave={handleSaveExercise}
                            />
                          );
                        }
                        const ex = item.ex;
                        const idx = item.idx;
                        const exerciseKey = ex?.exercise_id || ex?.exercise_name || `exercise_${idx}`;
                        return (
                          <ExerciseCard
                            key={`${workout.id}_${exerciseKey}`}
                            exercise={{
                              exercise_name: ex?.exercise_name || 'תרגיל',
                              exercise_id: ex?.exercise_id || null,
                              default_sets_count: ex?.sets || 3,
                              target_reps_min: ex?.reps_min,
                              target_reps_max: ex?.reps_max,
                              notes: ex?.notes,
                              sets: ex?.sets || [],
                            }}
                            index={idx}
                            previousData={previousWorkouts[exerciseKey]}
                            onSave={handleSaveExercise}
                          />
                        );
                      } catch (err) {
                        return (
                          <Card key={`${workout.id}_error_${i}`} className="bg-red-50 border-red-200">
                            <CardContent className="p-4 text-center text-red-600">שגיאה בטעינת תרגיל</CardContent>
                          </Card>
                        );
                      }
                    });
                  })()
                )}
              </div>
            </div>
          );
        })}

        {/* Back button */}
        <Link to={createPageUrl('WorkoutLog')}>
          <Button variant="outline" className="w-full mt-6">
            <ArrowRight className="w-4 h-4 ml-2" />
            חזור לאימונים שלי
          </Button>
        </Link>
      </div>

      <CopyWorkoutDialogTrainee
        open={showCopyDialog}
        onClose={() => setShowCopyDialog(false)}
        workout={todayWorkout}
        traineeEmail={trainee?.user_email}
      />
    </div>
  );
}