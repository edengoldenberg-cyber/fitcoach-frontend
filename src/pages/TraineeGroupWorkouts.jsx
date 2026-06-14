import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Users, Clock, CheckCircle, Play } from 'lucide-react';
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
        status: 'published'
      });
      return sessions.sort((a, b) => (a.start_time || '').localeCompare(b.start_time || ''));
    },
    enabled: !!trainee?.coach_email,
  });

  const openSession = async (session) => {
    setCurrentSession(session);

    const exercises = await base44.entities.GroupWorkoutSessionExercise.filter({
      session_id: session.id
    });

    const sortedExercises = exercises.sort((a, b) => a.order_index - b.order_index);

    // Load last performance for each
    const enriched = await Promise.all(sortedExercises.map(async (ex) => {
      const history = await base44.entities.ExerciseHistory.filter({
        trainee_email: trainee.user_email,
        exercise_name: ex.exercise_name
      });
      const lastPerformance = history.sort((a, b) => new Date(b.date) - new Date(a.date))[0];

      return {
        ...ex,
        current_sets: ex.sets,
        current_reps: lastPerformance?.reps || parseInt(ex.reps) || 10,
        current_weight: lastPerformance?.weight || ex.weight_kg || 0,
        last_performance: lastPerformance ? {
          date: lastPerformance.date,
          sets: lastPerformance.sets,
          reps: lastPerformance.reps,
          weight: lastPerformance.weight
        } : null
      };
    }));

    setWorkoutExercises(enriched);
    setShowWorkout(true);
  };

  const updateExerciseData = (index, field, value) => {
    const updated = [...workoutExercises];
    updated[index][field] = value;
    setWorkoutExercises(updated);
  };

  const completeWorkoutMutation = useMutation({
    mutationFn: async () => {
      const today = new Date().toISOString().split('T')[0];

      // Save all exercises to history
      for (const ex of workoutExercises) {
        await base44.entities.ExerciseHistory.create({
          trainee_email: trainee.user_email,
          exercise_id: ex.exercise_id,
          exercise_name: ex.exercise_name,
          date: today,
          sets: ex.current_sets,
          reps: ex.current_reps,
          weight: ex.current_weight,
          rest_seconds: ex.rest_seconds,
          notes: ex.notes || '',
          source: 'STUDIO'
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
          <h1 className="title-large mb-2">אימוני סטודיו</h1>
          <p className="body-text text-slate-600">האימונים הקבוצתיים שלך להיום</p>
        </div>

        {todaySessions.length === 0 ? (
          <Card className="card-premium border-2 border-dashed border-slate-300">
            <div className="empty-state">
              <Users className="empty-state-icon" />
              <h3 className="empty-state-title">אין אימונים קבוצתיים</h3>
              <p className="empty-state-description">המאמן טרם פרסם אימון להיום</p>
            </div>
          </Card>
        ) : (
          <div className="space-y-4">
            {todaySessions.map(session => (
              <Card key={session.id} className="card-premium">
                <div className="flex items-start justify-between mb-4">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-2">
                      <div className="w-12 h-12 rounded-full bg-teal-100 flex items-center justify-center">
                        <Users className="w-6 h-6 text-teal-600" />
                      </div>
                      <div>
                        <h3 className="title-medium">{session.title}</h3>
                        {session.group_tag && (
                          <Badge variant="outline" className="mt-1">
                            {session.group_tag}
                          </Badge>
                        )}
                      </div>
                    </div>

                    {session.start_time && (
                      <div className="flex items-center gap-2 small-text text-slate-600 mb-2">
                        <Clock className="w-4 h-4" />
                        {session.start_time}
                        {session.end_time && ` - ${session.end_time}`}
                      </div>
                    )}

                    {session.description && (
                      <p className="small-text text-slate-600">{session.description}</p>
                    )}
                  </div>

                  <Button
                    onClick={() => openSession(session)}
                    className="btn-primary h-14 px-8"
                  >
                    <Play className="w-5 h-5 ml-2" />
                    פתח אימון
                  </Button>
                </div>
              </Card>
            ))}
          </div>
        )}

        {/* Workout Execution Dialog */}
        <Dialog open={showWorkout} onOpenChange={setShowWorkout}>
          <DialogContent dir="rtl" className="max-w-3xl max-h-[90vh] flex flex-col p-0">
            <DialogHeader className="p-6 pb-4 border-b">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-full bg-teal-100 flex items-center justify-center">
                  <Users className="w-6 h-6 text-teal-600" />
                </div>
                <div>
                  <DialogTitle className="text-2xl">{currentSession?.title}</DialogTitle>
                  <p className="small-text text-slate-500 mt-1">
                    {workoutExercises.length} תרגילים
                  </p>
                </div>
              </div>
            </DialogHeader>

            <div className="flex-1 overflow-y-auto p-6 space-y-4">
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

            <div className="p-6 pt-4 border-t bg-white sticky bottom-0">
              <Button
                className="btn-success w-full h-16 text-lg"
                onClick={() => completeWorkoutMutation.mutate()}
                disabled={completeWorkoutMutation.isPending}
              >
                <CheckCircle className="w-6 h-6 ml-2" />
                {completeWorkoutMutation.isPending ? 'שומר...' : '✅ סיימתי את האימון'}
              </Button>
              <p className="small-text text-center text-slate-500 mt-3">
                הביצוע שלך ישמר והמאמן יוכל לעקוב
              </p>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}