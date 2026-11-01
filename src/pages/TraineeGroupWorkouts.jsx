import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Users, Clock, CheckCircle, Play, Dumbbell } from 'lucide-react';
import { toast } from 'sonner';
import TraineeExerciseCard from '../components/trainee/TraineeExerciseCard';
import { TraineeCardSkeleton } from '../components/shared/LoadingSkeleton';

export default function TraineeGroupWorkouts() {
  const queryClient = useQueryClient();
  const [showWorkout, setShowWorkout] = useState(false);
  const [currentSession, setCurrentSession] = useState(null);
  const [workoutExercises, setWorkoutExercises] = useState([]);

  const { data: user } = useQuery({
    queryKey: ['currentUser'],
    queryFn: () => base44.auth.me(),
  });

  const { data: trainee } = useQuery({
    queryKey: ['trainee', user?.email],
    queryFn: async () => {
      const trainees = await base44.entities.Trainee.filter({ user_email: user?.email });
      return trainees[0] || null;
    },
    enabled: !!user?.email,
  });

  const today = new Date().toISOString().split('T')[0];

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

  const openSession = async (session) => {
    setCurrentSession(session);

    // Use embedded exercises from buildInclude if available, otherwise fetch
    let exercises = Array.isArray(session.exercises) && session.exercises.length > 0
      ? session.exercises
      : await base44.entities.GroupWorkoutSessionExercise.filter({ session_id: session.id });

    exercises = exercises.sort((a, b) => (a.order_index || 0) - (b.order_index || 0));

    // Load last performance for each exercise using unified tracking
    const traineeEmail = trainee?.user_email || user?.email;
    const enriched = await Promise.all(
      exercises.map(async (ex) => {
        try {
          const res = await base44.functions.invoke('getLastExercisePerformance', {
            trainee_email: traineeEmail,
            exercise_id: ex.exercise_id || null,
            exercise_name: ex.exercise_name || null,
            date: today,
          });
          const perf = res?.data?.data;
          return {
            ...ex,
            current_sets: ex.sets || 3,
            current_reps: parseInt(ex.reps) || 10,
            current_weight: perf?.sets?.[0]?.weight || ex.weight_kg || 0,
            last_performance: perf?.date ? perf : null,
          };
        } catch {
          return {
            ...ex,
            current_sets: ex.sets || 3,
            current_reps: parseInt(ex.reps) || 10,
            current_weight: ex.weight_kg || 0,
            last_performance: null,
          };
        }
      })
    );

    setWorkoutExercises(enriched);
    setShowWorkout(true);
  };

  const updateExerciseData = (index, field, value) => {
    const updated = [...workoutExercises];
    updated[index] = { ...updated[index], [field]: value };
    setWorkoutExercises(updated);
  };

  const completeWorkoutMutation = useMutation({
    mutationFn: async () => {
      const traineeEmail = trainee?.user_email || user?.email;

      // Save each exercise's performance via unified tracking (WorkoutSession + WorkoutSet)
      for (const ex of workoutExercises) {
        await base44.functions.invoke('saveExerciseProgress', {
          trainee_email: traineeEmail,
          date: today,
          exercise_name: ex.exercise_name || null,
          exercise_id: ex.exercise_id || null,
          sets: Array.from({ length: ex.current_sets || 1 }, () => ({
            weight: ex.current_weight || 0,
            reps: ex.current_reps || 0,
          })),
        });
      }
    },
    onSuccess: () => {
      toast.success('כל הכבוד! האימון הושלם 💪');
      setShowWorkout(false);
      setWorkoutExercises([]);
      setCurrentSession(null);
      queryClient.invalidateQueries({ queryKey: ['exerciseHistory'] });
    },
    onError: (err) => {
      toast.error(`שגיאה בשמירה: ${err.message}`);
    },
  });

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 pb-20" dir="rtl">
        <div className="max-w-4xl mx-auto p-6">
          <TraineeCardSkeleton />
          <div className="mt-4"><TraineeCardSkeleton /></div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 pb-20" dir="rtl">
      <div className="max-w-4xl mx-auto p-6">
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-slate-800 mb-1">אימוני סטודיו</h1>
          <p className="text-sm text-slate-500">האימונים הקבוצתיים שלך להיום</p>
        </div>

        {todaySessions.length === 0 ? (
          <Card className="border-2 border-dashed border-slate-200 p-12 text-center">
            <Users className="w-10 h-10 text-slate-300 mx-auto mb-3" />
            <h3 className="font-semibold text-slate-600">אין אימונים קבוצתיים להיום</h3>
            <p className="text-sm text-slate-400 mt-1">המאמן טרם פרסם אימון להיום</p>
          </Card>
        ) : (
          <div className="space-y-4">
            {todaySessions.map(session => {
              const exCount = Array.isArray(session.exercises) ? session.exercises.length : '?';
              return (
                <Card key={session.id} className="bg-white border border-slate-200 p-5 hover:shadow-md transition-shadow">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex items-start gap-3 flex-1 min-w-0">
                      <div className="w-12 h-12 rounded-full bg-teal-100 flex items-center justify-center shrink-0">
                        <Dumbbell className="w-6 h-6 text-teal-600" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <h3 className="font-bold text-slate-800 text-lg">{session.title}</h3>
                          {session.group_tag && (
                            <Badge variant="outline" className="text-xs">
                              {session.group_tag}
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
                          <p className="text-sm text-slate-500 mt-1 line-clamp-2">{session.description}</p>
                        )}
                      </div>
                    </div>

                    <Button
                      onClick={() => openSession(session)}
                      className="bg-teal-600 hover:bg-teal-700 text-white shrink-0"
                    >
                      <Play className="w-4 h-4 ml-2" />
                      פתח
                    </Button>
                  </div>
                </Card>
              );
            })}
          </div>
        )}

        {/* Workout Execution Dialog */}
        <Dialog open={showWorkout} onOpenChange={(open) => {
          if (!open) { setShowWorkout(false); setWorkoutExercises([]); setCurrentSession(null); }
        }}>
          <DialogContent dir="rtl" className="max-w-2xl max-h-[90vh] flex flex-col p-0">
            <DialogHeader className="p-5 pb-4 border-b">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-teal-100 flex items-center justify-center">
                  <Dumbbell className="w-5 h-5 text-teal-600" />
                </div>
                <div>
                  <DialogTitle className="text-xl">{currentSession?.title}</DialogTitle>
                  <p className="text-xs text-slate-400 mt-0.5">{workoutExercises.length} תרגילים</p>
                </div>
              </div>
            </DialogHeader>

            <div className="flex-1 overflow-y-auto p-5 space-y-4">
              {workoutExercises.map((ex, i) => (
                <TraineeExerciseCard
                  key={i}
                  exercise={ex}
                  index={i}
                  onUpdate={updateExerciseData}
                  showActualPerformance={true}
                />
              ))}
            </div>

            <div className="p-5 border-t bg-white">
              <Button
                className="w-full bg-green-600 hover:bg-green-700 text-white h-14 text-base"
                onClick={() => completeWorkoutMutation.mutate()}
                disabled={completeWorkoutMutation.isPending}
              >
                <CheckCircle className="w-5 h-5 ml-2" />
                {completeWorkoutMutation.isPending ? 'שומר...' : '✅ סיימתי את האימון'}
              </Button>
              <p className="text-xs text-center text-slate-400 mt-2">
                הביצוע שלך ישמר והמאמן יוכל לעקוב
              </p>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}
