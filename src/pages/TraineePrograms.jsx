/**
 * TraineePrograms — trainee views and executes their assigned training program.
 *
 * Features:
 *   • Show all active programs assigned to this trainee
 *   • Expand each program to see workouts (A, B, C, D)
 *   • Open a workout for execution using TraineeExerciseCard
 *   • Previous performance shown per exercise
 *   • Save each exercise and complete workout
 */
import React, { useState, useCallback, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { ChevronLeft, Play, CheckCircle, Target, ChevronDown, ChevronUp } from 'lucide-react';
import { toast } from 'sonner';
import TraineeExerciseCard from '../components/trainee/TraineeExerciseCard';
import { TraineeCardSkeleton } from '../components/shared/LoadingSkeleton';

// localStorage key for in-progress program workout draft (keyed by workout template ID)
const DRAFT_KEY = (email, workoutId) => `prog_draft_${email}_${workoutId}`;

export default function TraineePrograms() {
  const queryClient = useQueryClient();
  const [expandedProgram, setExpandedProgram] = useState(null);
  const [showWorkout, setShowWorkout]         = useState(false);
  const [activeWorkout, setActiveWorkout]     = useState(null); // { label, exercises }
  const [executionSessionId, setExecutionSessionId] = useState(null);
  const [workoutExercises, setWorkoutExercises] = useState([]);
  const [savedExercises, setSavedExercises]   = useState(new Set());

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

  // Load programs assigned to this trainee
  const { data: programs = [], isLoading } = useQuery({
    queryKey: ['myTrainingPrograms', trainee?.user_email || user?.email],
    queryFn: () => base44.entities.TrainingProgram.filter({
      trainee_email: trainee?.user_email || user?.email,
      status: 'active',
    }),
    enabled: !!(trainee?.user_email || user?.email),
  });

  // Persist draft on every exercise change so resume survives browser refresh
  useEffect(() => {
    if (!showWorkout || !activeWorkout || workoutExercises.length === 0) return;
    const traineeEmail = trainee?.user_email || user?.email;
    if (!traineeEmail) return;
    const draftKey = DRAFT_KEY(traineeEmail, activeWorkout.id);
    localStorage.setItem(draftKey, JSON.stringify({
      exercises: workoutExercises,
      executionSessionId,
      savedAt: Date.now(),
    }));
  }, [workoutExercises, showWorkout, activeWorkout, executionSessionId, trainee, user]);

  const openWorkout = useCallback(async (programWorkout) => {
    setActiveWorkout(programWorkout);
    setSavedExercises(new Set());

    const traineeEmail = trainee?.user_email || user?.email;

    // Restore draft if it exists (within 24 h) — resume the same execution
    const draftKey = DRAFT_KEY(traineeEmail, programWorkout.id);
    const rawDraft = localStorage.getItem(draftKey);
    let restoredDraft = null;
    if (rawDraft) {
      try {
        const parsed = JSON.parse(rawDraft);
        if (Date.now() - parsed.savedAt < 86400000) restoredDraft = parsed;
      } catch { /* corrupt draft — ignore */ }
    }

    let execId = restoredDraft?.executionSessionId || null;
    if (!execId) {
      // No draft → start a fresh execution session
      try {
        const res = await base44.functions.invoke('startWorkoutSession', {
          trainee_email: traineeEmail,
          date: today,
          source: 'program',
          template_id: programWorkout.id || null,
          title: programWorkout.label || programWorkout.name || 'תוכנית אימונים',
        });
        execId = res?.data?.session_id || null;
      } catch { /* fall back to legacy mode */ }
    }
    setExecutionSessionId(execId);

    if (restoredDraft) {
      setWorkoutExercises(restoredDraft.exercises);
      toast.info('אימון קודם שוחזר — המשך מהמקום שהפסקת');
      setShowWorkout(true);
      return;
    }

    // Load embedded exercises, or fetch if not available
    let rawExercises = programWorkout.exercises || [];
    if (!rawExercises.length && programWorkout.id) {
      const wk = await base44.entities.TrainingProgramWorkout.get(programWorkout.id).catch(() => null);
      rawExercises = wk?.exercises || [];
    }
    rawExercises = rawExercises.sort((a, b) => (a.order_index || 0) - (b.order_index || 0));

    // Load previous performance + build exercise cards
    const enriched = await Promise.all(rawExercises.map(async (ex) => {
      const targetSets = ex.sets || 3;
      let lastPerf = null;
      try {
        const res = await base44.functions.invoke('getLastExercisePerformance', {
          trainee_email: traineeEmail,
          exercise_id:   ex.exercise_id   || null,
          exercise_name: ex.exercise_name || null,
          date: today,
        });
        const d = res?.data?.data;
        if (d?.date && d.sets?.length > 0) {
          lastPerf = { date: d.date, sets: d.sets, weight: d.sets[0]?.weight || 0, reps: d.sets[0]?.reps || 0 };
        }
      } catch {}

      return {
        ...ex,
        current_sets: targetSets,
        current_reps: (ex.reps_min || 10),
        current_weight: lastPerf?.sets?.[0]?.weight || 0,
        last_performance: lastPerf,
        reps: ex.reps_min ? `${ex.reps_min}${ex.reps_max ? '-' + ex.reps_max : ''}` : '8-12',
        performed_sets: Array.from({ length: targetSets }, (_, i) => ({
          set_number: i + 1,
          weight: lastPerf?.sets?.[i]?.weight || null,
          reps:   lastPerf?.sets?.[i]?.reps   || null,
        })),
      };
    }));

    setWorkoutExercises(enriched);
    setShowWorkout(true);
  }, [trainee, user, today]);

  const updateExercise = useCallback((index, field, value) => {
    setWorkoutExercises(prev => {
      const updated = [...prev];
      updated[index] = { ...updated[index], [field]: value };
      return updated;
    });
  }, []);

  const saveExerciseMutation = useMutation({
    mutationFn: async ({ exercise, index }) => {
      const traineeEmail = trainee?.user_email || user?.email;
      const sets = (exercise.performed_sets || []).filter(s => s.weight != null || s.reps != null);
      if (sets.length === 0) throw new Error('אין נתונים לשמירה');

      const saveRes = await base44.functions.invoke('saveExerciseProgress', {
        trainee_email: traineeEmail,
        date: today,
        source: 'program',
        session_id: executionSessionId || undefined,
        template_id: executionSessionId ? undefined : (activeWorkout?.id || null),
        exercise_name: exercise.exercise_name || null,
        exercise_id:   exercise.exercise_id   || null,
        sets: sets.map(s => ({ weight: parseFloat(s.weight) || 0, reps: parseInt(s.reps) || 0 })),
      });
      if (saveRes?.data?.success === false) {
        throw new Error(saveRes.data.error || 'שגיאה בשמירת התרגיל');
      }
      return index;
    },
    onSuccess: (index) => {
      setSavedExercises(prev => new Set([...prev, index]));
      toast.success('תרגיל נשמר ✅');
    },
    onError: (err) => toast.error(`שגיאה: ${err.message}`),
  });

  const completeWorkoutMutation = useMutation({
    mutationFn: async () => {
      const traineeEmail = trainee?.user_email || user?.email;
      const failed = [];

      for (const ex of workoutExercises) {
        const sets = (ex.performed_sets || []).filter(s => s.weight != null || s.reps != null);
        if (sets.length === 0) continue;
        try {
          const res = await base44.functions.invoke('saveExerciseProgress', {
            trainee_email: traineeEmail,
            date: today,
            source: 'program',
            session_id: executionSessionId || undefined,
            template_id: executionSessionId ? undefined : (activeWorkout?.id || null),
            exercise_name: ex.exercise_name || null,
            exercise_id:   ex.exercise_id   || null,
            sets: sets.map(s => ({ weight: parseFloat(s.weight) || 0, reps: parseInt(s.reps) || 0 })),
          });
          if (res?.data?.success === false) {
            failed.push(ex.exercise_name || 'תרגיל לא ידוע');
          }
        } catch {
          failed.push(ex.exercise_name || 'תרגיל לא ידוע');
        }
      }

      if (failed.length > 0) {
        throw new Error(`שמירת ${failed.length} תרגילים נכשלה: ${failed.join(', ')}. בדוק חיבור ונסה שוב.`);
      }

      if (executionSessionId) {
        const completeRes = await base44.functions.invoke('completeWorkoutSession', {
          trainee_email: traineeEmail,
          session_id: executionSessionId,
        });
        if (completeRes?.data?.success === false) {
          throw new Error(completeRes.data.error || 'שגיאה בסיום האימון');
        }
      }
    },
    onSuccess: () => {
      const draftKey = DRAFT_KEY(trainee?.user_email || user?.email, activeWorkout?.id);
      localStorage.removeItem(draftKey);

      queryClient.invalidateQueries({ queryKey: ['workoutHistory'] });
      toast.success('כל הכבוד! האימון הושלם 💪');
      setShowWorkout(false);
      setSavedExercises(new Set());
      setWorkoutExercises([]);
      setActiveWorkout(null);
      setExecutionSessionId(null);
    },
    onError: (err) => toast.error(err.message),
  });

  if (isLoading) {
    return (
      <div className="min-h-screen bg-slate-50 pb-20" dir="rtl">
        <div className="max-w-2xl mx-auto p-4">
          <TraineeCardSkeleton />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 pb-20" dir="rtl">
      <div className="max-w-2xl mx-auto p-4">

        {/* Header */}
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-slate-800">תוכנית האימונים שלי</h1>
          <p className="text-sm text-slate-500 mt-0.5">אימונים אישיים מהמאמן</p>
        </div>

        {programs.length === 0 ? (
          <Card className="p-12 text-center border-2 border-dashed border-slate-200">
            <Target className="w-12 h-12 text-slate-300 mx-auto mb-3" />
            <h3 className="font-semibold text-slate-600 mb-1">אין תוכנית אימונים</h3>
            <p className="text-sm text-slate-400 max-w-xs mx-auto">
              כשהמאמן שלך ישייך אותך לתוכנית, היא תופיע כאן
            </p>
          </Card>
        ) : (
          <div className="space-y-4">
            {programs.map(prog => {
              const isExpanded = expandedProgram === prog.id;
              const workouts = prog.workouts || [];

              return (
                <Card key={prog.id} className="overflow-hidden">
                  {/* Program header */}
                  <button
                    className="w-full flex items-center justify-between p-4 hover:bg-slate-50 transition-colors"
                    onClick={() => setExpandedProgram(isExpanded ? null : prog.id)}
                  >
                    <div className="text-right flex-1">
                      <h3 className="font-bold text-slate-800 text-base">{prog.name || 'תוכנית אימונים'}</h3>
                      <div className="flex items-center gap-2 text-xs text-slate-500 mt-0.5 flex-wrap">
                        {prog.duration_weeks && <span>{prog.duration_weeks} שבועות</span>}
                        {prog.frequency_week && <span>{prog.frequency_week}× בשבוע</span>}
                        <span>{workouts.length} אימונים</span>
                      </div>
                      {prog.objective && (
                        <p className="text-xs text-slate-400 mt-1 text-right">{prog.objective}</p>
                      )}
                    </div>
                    {isExpanded ? <ChevronUp className="w-5 h-5 text-slate-400 mr-3" /> : <ChevronDown className="w-5 h-5 text-slate-400 mr-3" />}
                  </button>

                  {/* Workouts list */}
                  {isExpanded && (
                    <div className="border-t border-slate-100 divide-y divide-slate-100">
                      {workouts.length === 0 ? (
                        <p className="p-4 text-sm text-slate-400 text-center">אין אימונים בתוכנית זו</p>
                      ) : (
                        workouts.map((wk, i) => {
                          const exCount = wk.exercises?.length || 0;
                          return (
                            <div key={wk.id || i} className="flex items-center justify-between p-4 hover:bg-slate-50">
                              <div className="flex items-center gap-3">
                                <div className="w-10 h-10 rounded-full bg-teal-100 text-teal-700 font-bold text-sm flex items-center justify-center shrink-0">
                                  {wk.label || String.fromCharCode(1488 + i)}
                                </div>
                                <div>
                                  <p className="font-semibold text-slate-800 text-sm">{wk.title || `אימון ${wk.label || String.fromCharCode(1488 + i)}`}</p>
                                  <p className="text-xs text-slate-400">{exCount} תרגילים</p>
                                </div>
                              </div>
                              <Button
                                size="sm"
                                className="bg-teal-600 hover:bg-teal-700 text-white"
                                onClick={() => openWorkout(wk)}
                              >
                                <Play className="w-3.5 h-3.5 ml-1" />
                                בצע
                              </Button>
                            </div>
                          );
                        })
                      )}
                    </div>
                  )}
                </Card>
              );
            })}
          </div>
        )}
      </div>

      {/* Workout Execution Dialog */}
      <Dialog open={showWorkout} onOpenChange={(o) => { if (!o) { setShowWorkout(false); setWorkoutExercises([]); setActiveWorkout(null); } }}>
        <DialogContent dir="rtl" className="max-w-2xl max-h-[95vh] flex flex-col p-0 m-2 rounded-2xl">
          <DialogHeader className="p-5 pb-3 border-b">
            <div className="flex items-center gap-3">
              <button onClick={() => setShowWorkout(false)} className="p-1 rounded-lg hover:bg-slate-100">
                <ChevronLeft className="w-5 h-5 text-slate-600" />
              </button>
              <div className="flex-1">
                <DialogTitle className="text-xl">
                  {activeWorkout?.title || `אימון ${activeWorkout?.label || ''}`}
                </DialogTitle>
                <p className="text-xs text-slate-400 mt-0.5">
                  {workoutExercises.length} תרגילים · {savedExercises.size} נשמרו
                </p>
              </div>
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

          <div className="p-4 border-t bg-white">
            <Button
              className="w-full bg-green-600 hover:bg-green-700 text-white h-14 text-base"
              onClick={() => completeWorkoutMutation.mutate()}
              disabled={completeWorkoutMutation.isPending}
            >
              <CheckCircle className="w-5 h-5 ml-2" />
              {completeWorkoutMutation.isPending ? 'שומר...' : '✅ סיימתי את האימון'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
