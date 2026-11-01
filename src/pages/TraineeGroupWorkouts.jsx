/**
 * TraineeGroupWorkouts — Open Gym workout execution.
 *
 * Features:
 *   • List today's published Group Workout Sessions
 *   • Full set-by-set execution via TraineeExerciseCard
 *   • Previous performance displayed per exercise
 *   • Save each exercise independently (real-time persistence)
 *   • Resume in-progress workout (localStorage)
 *   • Workout history tab (past WorkoutSessions)
 */
import React, { useState, useEffect, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import {
  Users, Clock, CheckCircle, Play, Dumbbell, ChevronLeft, Calendar,
  Trophy, RotateCcw, History,
} from 'lucide-react';
import { toast } from 'sonner';
import { format } from 'date-fns';
import TraineeExerciseCard from '../components/trainee/TraineeExerciseCard';
import { TraineeCardSkeleton } from '../components/shared/LoadingSkeleton';

// ── localStorage key for in-progress workout ─────────────────────────────────
const DRAFT_KEY = (email, sessionId) => `gym_draft_${email}_${sessionId}`;

export default function TraineeGroupWorkouts() {
  const queryClient = useQueryClient();

  const [activeTab, setActiveTab]               = useState('today'); // 'today' | 'history'
  const [showWorkout, setShowWorkout]           = useState(false);
  const [currentSession, setCurrentSession]     = useState(null);
  const [workoutExercises, setWorkoutExercises] = useState([]);
  const [savedExercises, setSavedExercises]     = useState(new Set()); // indices saved

  const today = new Date().toISOString().split('T')[0];

  const { data: user } = useQuery({
    queryKey: ['currentUser'],
    queryFn: () => base44.auth.me(),
  });

  const { data: trainee } = useQuery({
    queryKey: ['trainee', user?.email],
    queryFn: async () => {
      const ts = await base44.entities.Trainee.filter({ user_email: user?.email });
      return ts[0] || null;
    },
    enabled: !!user?.email,
  });

  // Today's published sessions from coach
  const { data: todaySessions = [], isLoading } = useQuery({
    queryKey: ['groupSessions', trainee?.coach_email, today],
    queryFn: async () => {
      const sessions = await base44.entities.GroupWorkoutSession.filter({
        coach_email: trainee?.coach_email,
        date: today,
        status: 'published',
      });
      return sessions.sort((a, b) => (a.start_time || '').localeCompare(b.start_time || ''));
    },
    enabled: !!trainee?.coach_email,
  });

  // Workout history (past completed sessions)
  const { data: historyWorkouts = [], isLoading: historyLoading } = useQuery({
    queryKey: ['workoutHistory', trainee?.user_email || user?.email],
    queryFn: () => base44.entities.WorkoutSession.filter({
      trainee_email: trainee?.user_email || user?.email,
    }, '-date', 20),
    enabled: activeTab === 'history' && !!(trainee?.user_email || user?.email),
  });

  // ── Open a session and load exercises + previous performance ─────────────────
  const openSession = useCallback(async (session) => {
    setCurrentSession(session);
    setSavedExercises(new Set());

    // Use embedded exercises from buildInclude
    let rawExercises = Array.isArray(session.exercises) && session.exercises.length > 0
      ? session.exercises
      : await base44.entities.GroupWorkoutSessionExercise.filter({ session_id: session.id });

    rawExercises = rawExercises.sort((a, b) => (a.order_index || 0) - (b.order_index || 0));

    const traineeEmail = trainee?.user_email || user?.email;

    // Load previous performance for each exercise
    const enriched = await Promise.all(
      rawExercises.map(async (ex) => {
        const targetSets = ex.sets || 3;
        let lastPerf = null;
        try {
          const res = await base44.functions.invoke('getLastExercisePerformance', {
            trainee_email: traineeEmail,
            exercise_id: ex.exercise_id || null,
            exercise_name: ex.exercise_name || null,
            date: today,
          });
          const d = res?.data?.data;
          if (d?.date && d.sets?.length > 0) {
            lastPerf = {
              date:   d.date,
              sets:   d.sets,
              weight: d.sets[0]?.weight || 0,
              reps:   d.sets[0]?.reps   || 0,
            };
          }
        } catch { /* no history */ }

        return {
          ...ex,
          current_sets: targetSets,
          current_reps: parseInt(ex.reps) || 10,
          current_weight: lastPerf?.sets?.[0]?.weight || ex.weight_kg || 0,
          last_performance: lastPerf,
          // performed_sets: array to fill in set-by-set
          performed_sets: Array.from({ length: targetSets }, (_, j) => ({
            set_number: j + 1,
            weight: lastPerf?.sets?.[j]?.weight || null,
            reps:   lastPerf?.sets?.[j]?.reps   || null,
          })),
        };
      })
    );

    // Restore draft if exists
    const draftKey = DRAFT_KEY(traineeEmail, session.id);
    const raw = localStorage.getItem(draftKey);
    let finalExercises = enriched;
    if (raw) {
      try {
        const draft = JSON.parse(raw);
        if (Date.now() - draft.savedAt < 86400000) {
          finalExercises = draft.exercises;
          toast.info('אימון קודם שוחזר — המשך מהמקום שהפסקת');
        }
      } catch { /* ignore corrupt draft */ }
    }

    setWorkoutExercises(finalExercises);
    setShowWorkout(true);
  }, [trainee, user, today]);

  // Persist draft on every change
  useEffect(() => {
    if (!showWorkout || !currentSession || workoutExercises.length === 0) return;
    const traineeEmail = trainee?.user_email || user?.email;
    const draftKey = DRAFT_KEY(traineeEmail, currentSession.id);
    localStorage.setItem(draftKey, JSON.stringify({
      exercises: workoutExercises,
      savedAt: Date.now(),
    }));
  }, [workoutExercises, showWorkout, currentSession]);

  const updateExercise = useCallback((index, field, value) => {
    setWorkoutExercises(prev => {
      const updated = [...prev];
      updated[index] = { ...updated[index], [field]: value };
      return updated;
    });
  }, []);

  // Save one exercise immediately
  const saveExerciseMutation = useMutation({
    mutationFn: async ({ exercise, index }) => {
      const traineeEmail = trainee?.user_email || user?.email;
      const sets = (exercise.performed_sets || []).filter(s => s.weight != null || s.reps != null);
      if (sets.length === 0) throw new Error('אין נתונים לשמירה');

      await base44.functions.invoke('saveExerciseProgress', {
        trainee_email: traineeEmail,
        date: today,
        source: 'open_gym',
        template_id: currentSession?.id || null,
        exercise_name: exercise.exercise_name || null,
        exercise_id: exercise.exercise_id   || null,
        sets: sets.map(s => ({
          weight: parseFloat(s.weight) || 0,
          reps:   parseInt(s.reps)    || 0,
        })),
      });
      return index;
    },
    onSuccess: (index) => {
      setSavedExercises(prev => new Set([...prev, index]));
      toast.success('תרגיל נשמר ✅');
    },
    onError: (err) => toast.error(`שגיאה: ${err.message}`),
  });

  // Complete the full workout
  const completeWorkoutMutation = useMutation({
    mutationFn: async () => {
      const traineeEmail = trainee?.user_email || user?.email;
      let anyError = false;

      for (const ex of workoutExercises) {
        const sets = (ex.performed_sets || []).filter(s => s.weight != null || s.reps != null);
        if (sets.length === 0) continue;
        try {
          await base44.functions.invoke('saveExerciseProgress', {
            trainee_email: traineeEmail,
            date: today,
            exercise_name: ex.exercise_name || null,
            exercise_id:   ex.exercise_id   || null,
            sets: sets.map(s => ({ weight: parseFloat(s.weight) || 0, reps: parseInt(s.reps) || 0 })),
          });
        } catch { anyError = true; }
      }

      if (anyError) toast.error('חלק מהתרגילים לא נשמרו — בדוק את החיבור');
    },
    onSuccess: () => {
      // Clear draft
      const draftKey = DRAFT_KEY(trainee?.user_email || user?.email, currentSession?.id);
      localStorage.removeItem(draftKey);

      queryClient.invalidateQueries({ queryKey: ['workoutHistory'] });
      toast.success('כל הכבוד! האימון הושלם 💪');
      setShowWorkout(false);
      setSavedExercises(new Set());
      setWorkoutExercises([]);
      setCurrentSession(null);
    },
    onError: (err) => toast.error(`שגיאה: ${err.message}`),
  });

  const handleCloseWorkout = () => {
    setShowWorkout(false);
    // Draft is preserved — user can resume
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 pb-20" dir="rtl">
        <div className="max-w-2xl mx-auto p-4">
          <TraineeCardSkeleton />
          <div className="mt-4"><TraineeCardSkeleton /></div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 pb-20" dir="rtl">
      <div className="max-w-2xl mx-auto p-4">

        {/* Header */}
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-slate-800">Open Gym</h1>
          <p className="text-sm text-slate-500 mt-0.5">אימוני סטודיו</p>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 bg-white border border-slate-200 rounded-lg p-1 mb-4">
          {[{ k: 'today', l: 'היום', icon: Dumbbell }, { k: 'history', l: 'היסטוריה', icon: History }].map(t => (
            <button
              key={t.k}
              onClick={() => setActiveTab(t.k)}
              className={`flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                activeTab === t.k ? 'bg-teal-600 text-white' : 'text-slate-600 hover:bg-slate-100'
              }`}
            >
              <t.icon className="w-4 h-4" />
              {t.l}
            </button>
          ))}
        </div>

        {/* Today's sessions */}
        {activeTab === 'today' && (
          todaySessions.length === 0 ? (
            <Card className="border-2 border-dashed border-slate-200 p-12 text-center">
              <Users className="w-10 h-10 text-slate-300 mx-auto mb-3" />
              <h3 className="font-semibold text-slate-600">אין אימונים להיום</h3>
              <p className="text-sm text-slate-400 mt-1">המאמן שלך טרם פרסם אימון להיום</p>
            </Card>
          ) : (
            <div className="space-y-3">
              {todaySessions.map(session => {
                const exCount = Array.isArray(session.exercises) ? session.exercises.length : '?';
                const draftKey = DRAFT_KEY(trainee?.user_email || user?.email, session.id);
                const hasDraft = !!localStorage.getItem(draftKey);

                return (
                  <Card key={session.id} className="bg-white border border-slate-200 p-5 hover:shadow-md transition-shadow">
                    <div className="flex items-start gap-3">
                      <div className="w-12 h-12 rounded-full bg-teal-100 flex items-center justify-center shrink-0">
                        <Dumbbell className="w-6 h-6 text-teal-600" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <h3 className="font-bold text-slate-800 text-lg">{session.title}</h3>
                          {hasDraft && (
                            <Badge className="bg-amber-100 text-amber-700 text-xs">
                              <RotateCcw className="w-3 h-3 ml-1" />
                              בהמשך
                            </Badge>
                          )}
                        </div>
                        <div className="flex items-center gap-3 text-xs text-slate-500 mt-1 flex-wrap">
                          {session.start_time && (
                            <span className="flex items-center gap-1">
                              <Clock className="w-3 h-3" />
                              {session.start_time}{session.end_time ? ` – ${session.end_time}` : ''}
                            </span>
                          )}
                          <span className="flex items-center gap-1">
                            <Dumbbell className="w-3 h-3" />
                            {exCount} תרגילים
                          </span>
                        </div>
                        {session.description && (
                          <p className="text-xs text-slate-500 mt-1 line-clamp-2">{session.description}</p>
                        )}
                      </div>
                      <Button
                        onClick={() => openSession(session)}
                        className="bg-teal-600 hover:bg-teal-700 text-white shrink-0"
                      >
                        <Play className="w-4 h-4 ml-1" />
                        {hasDraft ? 'המשך' : 'התחל'}
                      </Button>
                    </div>
                  </Card>
                );
              })}
            </div>
          )
        )}

        {/* History tab */}
        {activeTab === 'history' && (
          historyLoading ? (
            <div className="space-y-3">
              {[1,2,3].map(i => <TraineeCardSkeleton key={i} />)}
            </div>
          ) : historyWorkouts.length === 0 ? (
            <Card className="p-10 text-center border-2 border-dashed border-slate-200">
              <Trophy className="w-10 h-10 text-slate-300 mx-auto mb-3" />
              <p className="text-slate-500">עדיין לא בוצעו אימונים</p>
            </Card>
          ) : (
            <div className="space-y-3">
              {historyWorkouts.map(w => {
                const setCount = w.sets?.length || 0;
                const exNames = [...new Set((w.sets || []).map(s => s.exercise_name))];
                return (
                  <Card key={w.id} className="bg-white p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <h3 className="font-semibold text-slate-800">{w.title || 'אימון'}</h3>
                        <div className="flex items-center gap-2 text-xs text-slate-500 mt-1">
                          <Calendar className="w-3 h-3" />
                          {w.date ? format(new Date(w.date), 'dd/MM/yyyy') : '—'}
                          <span>·</span>
                          <span>{exNames.length} תרגילים</span>
                          <span>·</span>
                          <span>{setCount} סטים</span>
                        </div>
                        {exNames.length > 0 && (
                          <p className="text-xs text-slate-400 mt-1">{exNames.slice(0, 3).join(', ')}{exNames.length > 3 ? '...' : ''}</p>
                        )}
                      </div>
                      <Badge className={`${w.status === 'completed' ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'} text-xs shrink-0`}>
                        {w.status === 'completed' ? '✅ הושלם' : '⏳ בתהליך'}
                      </Badge>
                    </div>
                  </Card>
                );
              })}
            </div>
          )
        )}
      </div>

      {/* ── Workout Execution Dialog ── */}
      <Dialog open={showWorkout} onOpenChange={handleCloseWorkout}>
        <DialogContent dir="rtl" className="max-w-2xl max-h-[95vh] flex flex-col p-0 m-2 rounded-2xl">
          <DialogHeader className="p-5 pb-3 border-b">
            <div className="flex items-center gap-3">
              <button onClick={handleCloseWorkout} className="p-1 rounded-lg hover:bg-slate-100">
                <ChevronLeft className="w-5 h-5 text-slate-600" />
              </button>
              <div className="flex-1">
                <DialogTitle className="text-xl">{currentSession?.title}</DialogTitle>
                <p className="text-xs text-slate-400 mt-0.5">
                  {workoutExercises.length} תרגילים · {savedExercises.size} נשמרו
                </p>
              </div>
              {savedExercises.size === workoutExercises.length && workoutExercises.length > 0 && (
                <Badge className="bg-green-100 text-green-700 text-xs">הכל נשמר ✅</Badge>
              )}
            </div>
          </DialogHeader>

          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {workoutExercises.map((ex, i) => (
              <TraineeExerciseCard
                key={i}
                exercise={ex}
                index={i}
                onUpdate={updateExercise}
                showActualPerformance={true}
                isSaved={savedExercises.has(i)}
                isSaving={saveExerciseMutation.isPending && saveExerciseMutation.variables?.index === i}
                onSave={() => saveExerciseMutation.mutate({ exercise: ex, index: i })}
              />
            ))}
          </div>

          <div className="p-4 border-t bg-white space-y-2">
            <Button
              className="w-full bg-green-600 hover:bg-green-700 text-white h-14 text-base"
              onClick={() => completeWorkoutMutation.mutate()}
              disabled={completeWorkoutMutation.isPending}
            >
              <CheckCircle className="w-5 h-5 ml-2" />
              {completeWorkoutMutation.isPending ? 'שומר...' : '✅ סיימתי את האימון'}
            </Button>
            <p className="text-xs text-center text-slate-400">
              לחץ "שמור תרגיל" לשמירה מדורגת, או "סיימתי" לשמירת הכל בבת אחת
            </p>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
