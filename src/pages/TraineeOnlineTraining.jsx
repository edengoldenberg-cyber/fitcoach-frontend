import React, { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Play, CheckCircle, Dumbbell, Calendar, TrendingUp, Search } from 'lucide-react';
import { toast } from 'sonner';
import { useNavigate } from 'react-router-dom';
import TraineeExerciseCard from '../components/trainee/TraineeExerciseCard';
import { TraineeCardSkeleton } from '../components/shared/LoadingSkeleton';

export default function TraineeOnlineTraining() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [showWorkout, setShowWorkout] = useState(false);
  const [workoutData, setWorkoutData] = useState([]);
  const [currentAssignment, setCurrentAssignment] = useState(null);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [showExitWarning, setShowExitWarning] = useState(false);
  const [savedExercises, setSavedExercises] = useState(new Set());
  const [exerciseSearch, setExerciseSearch] = useState('');

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

  const { data: onlineAssignments = [] } = useQuery({
    queryKey: ['onlineAssignments', trainee?.user_email],
    queryFn: async () => {
      console.log('🔐 Privacy check: loading assignments for trainee_email:', trainee?.user_email);
      const all = await base44.entities.OnlineAssignment.filter({
        trainee_email: trainee?.user_email
      });
      const assignments = all.filter(a => a.status === 'SENT' || a.status === 'ACTIVE');
      console.log('✅ Found', assignments.length, 'assignments assigned to this trainee');
      return assignments;
    },
    enabled: !!trainee?.user_email,
  });

  const { data: rotationAssignments = [] } = useQuery({
    queryKey: ['rotationAssignments', trainee?.user_email],
    queryFn: async () => {
      console.log('🔍 Loading rotation assignments for:', trainee?.user_email);
      const assignments = await base44.entities.RotationAssignment.filter({
        trainee_email: trainee?.user_email,
        status: 'active'
      });
      console.log('✅ Found rotation assignments:', assignments.length);
      
      // Load today's sessions
      const today = new Date().toISOString().split('T')[0];
      const sessionsPromises = assignments.map(async (assignment) => {
        const sessions = await base44.entities.RotationSessionInstance.filter({
          assignment_id: assignment.id,
          date: today
        });
        
        if (sessions.length > 0) {
          const session = sessions[0];
          const exercises = await base44.entities.RotationCategoryExercise.filter({
            category_id: session.category_id
          });
          
          return {
            ...assignment,
            todaySession: {
              ...session,
              exercises: exercises.sort((a, b) => a.order_index - b.order_index)
            }
          };
        }
        
        return null;
      });
      
      const results = await Promise.all(sessionsPromises);
      return results.filter(Boolean);
    },
    enabled: !!trainee?.user_email,
  });

  const assignments = [...onlineAssignments, ...rotationAssignments];

  const startWorkout = async (assignment) => {
    setCurrentAssignment(assignment);

    // Check if it's a rotation assignment (from SendDailyPersonal)
    if (assignment.todaySession) {
      console.log('Starting rotation session workout');
      const session = assignment.todaySession;
      
      // Load last performance for each exercise
      const enrichedExercises = await Promise.all(session.exercises.map(async (ex) => {
        const history = await base44.entities.RotationExerciseLog.filter({
          trainee_email: trainee.user_email,
          exercise_name: ex.exercise_name
        });
        const lastPerformance = history.sort((a, b) => new Date(b.created_date) - new Date(a.created_date))[0];
        const lastSet = lastPerformance?.sets?.[lastPerformance.sets.length - 1];

        return {
          ...ex,
          current_sets: ex.target_sets,
          performed_sets: Array.from({ length: ex.target_sets }, (_, i) => ({
            set_number: i + 1,
            reps: lastSet?.reps || null,
            weight: lastSet?.weight || null
          })),
          last_performance: lastPerformance && lastSet ? {
            date: lastPerformance.created_date,
            sets: lastPerformance.sets.length,
            reps: lastSet.reps,
            weight: lastSet.weight
          } : null
        };
      }));

      setWorkoutData(enrichedExercises);
      setShowWorkout(true);
      return;
    }

    if (assignment.mode === 'DAILY') {
      // Load daily workout - filter by assignment_id to get the exact right workout
      const today = new Date().toISOString().split('T')[0];
      let workouts = await base44.entities.OnlineDailyWorkout.filter({
        assignment_id: assignment.id
      });
      // Fallback: try by trainee_email + date if assignment_id not stored
      if (!workouts || workouts.length === 0) {
        workouts = await base44.entities.OnlineDailyWorkout.filter({
          trainee_email: trainee.user_email,
          workout_date: today
        });
      }
      const workout = workouts[0];
      
      if (!workout) {
        toast.error('לא נמצא אימון להיום. פנה למאמן.');
        console.error('Debug: assignment exists but no workout found', { assignment_id: assignment.id, today, trainee_id: trainee.id });
        return;
      }

      const items = await base44.entities.OnlineDailyWorkoutItem.filter({
        daily_workout_id: workout.id
      });

      if (items.length === 0) {
        toast.error('האימון ריק - אין תרגילים. פנה למאמן.');
        console.error('Debug: workout found but no items', { workout_id: workout.id });
        return;
      }

      // Load last performance for each exercise
      const enrichedItems = await Promise.all(items.map(async (item) => {
        const history = await base44.entities.ExerciseHistory.filter({
          trainee_email: trainee.user_email,
          exercise_name: item.exercise_name
        });
        const lastPerformance = history.sort((a, b) => new Date(b.date) - new Date(a.date))[0];

        return {
          ...item,
          current_sets: item.sets,
          performed_sets: Array.from({ length: item.sets || 3 }, (_, i) => ({
            set_number: i + 1,
            reps: lastPerformance?.reps || null,
            weight: lastPerformance?.weight || null
          })),
          last_performance: lastPerformance ? {
            date: lastPerformance.date,
            sets: lastPerformance.sets,
            reps: lastPerformance.reps,
            weight: lastPerformance.weight
          } : null
        };
      }));

      setWorkoutData(enrichedItems);
      setShowWorkout(true);
    } else if (assignment.mode === 'ROTATION') {
      // Load rotation program exercises
      const programs = await base44.entities.OnlineProgram.filter({
        id: assignment.program_id
      });
      const program = programs[0];

      if (program) {
        const exercises = await base44.entities.OnlineProgramExercise.filter({
          program_id: program.id,
          slot: assignment.next_slot
        });

        // Load last performance for each exercise
        const enrichedExercises = await Promise.all(exercises.map(async (ex) => {
          const history = await base44.entities.ExerciseHistory.filter({
            trainee_email: trainee.user_email,
            exercise_name: ex.exercise_name
          });
          const lastPerformance = history.sort((a, b) => new Date(b.date) - new Date(a.date))[0];

          return {
            ...ex,
            current_sets: ex.sets_default,
            performed_sets: Array.from({ length: ex.sets_default || 3 }, (_, i) => ({
              set_number: i + 1,
              reps: lastPerformance?.reps || null,
              weight: lastPerformance?.weight || null
            })),
            rest_seconds: ex.rest_default_seconds,
            notes: ex.notes_default,
            video_url: ex.video_url_override,
            last_performance: lastPerformance ? {
              date: lastPerformance.date,
              sets: lastPerformance.sets,
              reps: lastPerformance.reps,
              weight: lastPerformance.weight
            } : null
          };
        }));

        setWorkoutData(enrichedExercises);
        setShowWorkout(true);
      }
    }
  };

  const updateExerciseData = (index, field, value) => {
    const updated = [...workoutData];
    updated[index][field] = value;
    setWorkoutData(updated);
    setHasUnsavedChanges(true);
    // Remove from saved list when edited
    setSavedExercises(prev => {
      const newSet = new Set(prev);
      newSet.delete(index);
      return newSet;
    });
  };

  const saveExerciseMutation = useMutation({
    mutationFn: async (exerciseIndex) => {
      const ex = workoutData[exerciseIndex];
      const today = new Date().toISOString().split('T')[0];
      
      const completedSets = (ex.performed_sets || []).filter(s => s.reps !== null && s.weight !== null);
      
      if (completedSets.length === 0) {
        throw new Error('חייב למלא לפחות סט אחד');
      }

      const avgReps = Math.round(completedSets.reduce((sum, s) => sum + s.reps, 0) / completedSets.length);
      const avgWeight = completedSets.reduce((sum, s) => sum + s.weight, 0) / completedSets.length;
      
      await base44.entities.ExerciseHistory.create({
        trainee_email: trainee.user_email,
        exercise_id: ex.exercise_id,
        exercise_name: ex.exercise_name,
        date: today,
        sets: completedSets.length,
        reps: avgReps,
        weight: avgWeight,
        rest_seconds: ex.rest_seconds,
        notes: ex.notes || '',
        source: 'ONLINE',
        assignment_id: currentAssignment.id,
        slot: currentAssignment.next_slot
      });

      return exerciseIndex;
    },
    onSuccess: (exerciseIndex) => {
      toast.success('✅ התרגיל נשמר בהצלחה');
      setSavedExercises(prev => new Set([...prev, exerciseIndex]));
      // Check if all exercises are saved
      if (savedExercises.size + 1 === workoutData.length) {
        setHasUnsavedChanges(false);
      }
    },
    onError: (err) => {
      toast.error('שגיאה: ' + err.message);
    }
  });

  const removeExerciseMutation = useMutation({
    mutationFn: async (exerciseIndex) => {
      const ex = workoutData[exerciseIndex];
      const today = new Date().toISOString().split('T')[0];
      
      // Mark as skipped in history
      await base44.entities.ExerciseHistory.create({
        trainee_email: trainee.user_email,
        exercise_id: ex.exercise_id,
        exercise_name: ex.exercise_name,
        date: today,
        sets: 0,
        reps: 0,
        weight: 0,
        rest_seconds: 0,
        notes: 'תרגיל הוסר מהאימון',
        source: 'ONLINE',
        assignment_id: currentAssignment.id,
        slot: currentAssignment.next_slot
      });

      return exerciseIndex;
    },
    onSuccess: (exerciseIndex) => {
      const updated = workoutData.filter((_, i) => i !== exerciseIndex);
      setWorkoutData(updated);
      toast.success('התרגיל הוסר מהאימון');
    },
    onError: (err) => {
      toast.error('שגיאה: ' + err.message);
    }
  });

  // Prevent accidental exit
  React.useEffect(() => {
    const handleBeforeUnload = (e) => {
      if (hasUnsavedChanges && showWorkout) {
        e.preventDefault();
        e.returnValue = '';
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [hasUnsavedChanges, showWorkout]);

  const handleCloseWorkout = () => {
    if (hasUnsavedChanges) {
      setShowExitWarning(true);
    } else {
      setShowWorkout(false);
      setWorkoutData([]);
      setCurrentAssignment(null);
      setSavedExercises(new Set());
    }
  };

  const saveAndExit = async () => {
    await completeWorkoutMutation.mutateAsync();
    setShowExitWarning(false);
    setShowWorkout(false);
    setWorkoutData([]);
    setCurrentAssignment(null);
    setSavedExercises(new Set());
    setHasUnsavedChanges(false);
  };

  const exitWithoutSaving = () => {
    setShowExitWarning(false);
    setShowWorkout(false);
    setWorkoutData([]);
    setCurrentAssignment(null);
    setSavedExercises(new Set());
    setHasUnsavedChanges(false);
    setExerciseSearch('');
  };

  const completeWorkoutMutation = useMutation({
    mutationFn: async () => {
      console.log('🏋️ submit_start:', { assignment_id: currentAssignment?.id, exercises: workoutData.length });
      const today = new Date().toISOString().split('T')[0];

      // Check if it's a rotation session (from SendDailyPersonal)
      if (currentAssignment.todaySession) {
        // Save to RotationExerciseLog with set-by-set data
        for (const ex of workoutData) {
          const completedSets = (ex.performed_sets || [])
            .filter(s => s.reps !== null && s.weight !== null)
            .map(s => ({
              set_number: s.set_number,
              reps: s.reps,
              weight: s.weight,
              completed: true
            }));
          
          if (completedSets.length > 0) {
            await base44.entities.RotationExerciseLog.create({
              trainee_email: trainee.user_email,
              assignment_id: currentAssignment.id,
              session_instance_id: currentAssignment.todaySession.id,
              category_letter: currentAssignment.todaySession.category_letter,
              exercise_name: ex.exercise_name,
              sets: completedSets
            });
          }
        }
        
        // Mark session as completed
        await base44.entities.RotationSessionInstance.update(currentAssignment.todaySession.id, {
          status: 'completed',
          completed_at: new Date().toISOString()
        });
        
        console.log('✅ submit_success: rotation session completed');
        return;
      }

      // Save all exercises to history with set-by-set data (for online assignments)
      for (const ex of workoutData) {
        const completedSets = (ex.performed_sets || []).filter(s => s.reps !== null && s.weight !== null);
        
        if (completedSets.length > 0) {
          // Calculate average for legacy fields
          const avgReps = Math.round(completedSets.reduce((sum, s) => sum + s.reps, 0) / completedSets.length);
          const avgWeight = completedSets.reduce((sum, s) => sum + s.weight, 0) / completedSets.length;
          
          await base44.entities.ExerciseHistory.create({
            trainee_email: trainee.user_email,
            exercise_id: ex.exercise_id,
            exercise_name: ex.exercise_name,
            date: today,
            sets: completedSets.length,
            reps: avgReps,
            weight: avgWeight,
            rest_seconds: ex.rest_seconds,
            notes: ex.notes || '',
            source: 'ONLINE',
            assignment_id: currentAssignment.id,
            slot: currentAssignment.next_slot
          });
        }
      }

      // Update assignment
      const updates = {
        last_completed_at: new Date().toISOString()
      };

      if (currentAssignment.mode === 'ROTATION') {
        // Rotate to next slot
        const slotOrder = ['A', 'B', 'C'];
        const currentIndex = slotOrder.indexOf(currentAssignment.next_slot);
        const nextIndex = (currentIndex + 1) % slotOrder.length;
        updates.next_slot = slotOrder[nextIndex];
      }

      await base44.entities.OnlineAssignment.update(currentAssignment.id, updates);
      console.log('✅ submit_success: online assignment completed');
    },
    onSuccess: () => {
      console.log('🎯 state_after_submit: triggering UI updates');
      toast.success('כל הכבוד! האימון הושלם בהצלחה 💪');
      setHasUnsavedChanges(false);
      
      // Invalidate queries BEFORE closing dialog to ensure fresh data
      queryClient.invalidateQueries({ queryKey: ['onlineAssignments'] });
      queryClient.invalidateQueries({ queryKey: ['rotationAssignments'] });
      
      // Auto-close and navigate after 1.5s
      setTimeout(() => {
        setShowWorkout(false);
        setWorkoutData([]);
        setCurrentAssignment(null);
        setSavedExercises(new Set());
        console.log('✅ state_cleanup: dialog closed');
      }, 1500);
    },
    onError: (err) => {
      console.error('❌ submit_error:', err);
      toast.error('שגיאה: ' + err.message);
    }
  });

  if (!user || !trainee) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 pb-20" dir="rtl">
        <div className="max-w-4xl mx-auto p-6">
          <div className="mb-8">
            <div className="h-10 w-56 bg-slate-200 rounded-xl animate-pulse mb-3" />
            <div className="h-5 w-40 bg-slate-200 rounded-xl animate-pulse" />
          </div>
          <TraineeCardSkeleton />
          <div className="mt-4"><TraineeCardSkeleton /></div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 pb-20" dir="rtl">
      <div className="max-w-4xl mx-auto p-6">
        {/* Header */}
        <div className="mb-8">
          <h1 className="title-large mb-2">אימונים אונליין</h1>
          <p className="body-text text-slate-600">האימונים שלך מהמאמן</p>
        </div>

        {assignments.length === 0 ? (
          <Card className="card-premium text-center border-2 border-dashed border-slate-300">
            <div className="empty-state">
              <Dumbbell className="empty-state-icon" />
              <h3 className="empty-state-title">אין אימונים פעילים</h3>
              <p className="empty-state-description mb-4">המאמן שלך ישלח לך אימון בקרוב</p>
              <Badge variant="outline" className="text-sm px-4 py-2">
                בינתיים אפשר לעבור לאימונים הרגילים 💪
              </Badge>
            </div>
          </Card>
        ) : (
          <div className="spacing-section">
            {assignments.map(assignment => (
              <Card key={assignment.id} className="card-premium mb-4">
                <div className="flex justify-between items-start mb-4">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-2">
                      {assignment.todaySession ? (
                        <div className="w-10 h-10 rounded-full bg-orange-100 flex items-center justify-center">
                          <Dumbbell className="w-5 h-5 text-orange-600" />
                        </div>
                      ) : assignment.mode === 'DAILY' ? (
                        <div className="w-10 h-10 rounded-full bg-teal-100 flex items-center justify-center">
                          <Calendar className="w-5 h-5 text-teal-600" />
                        </div>
                      ) : (
                        <div className="w-10 h-10 rounded-full bg-purple-100 flex items-center justify-center">
                          <TrendingUp className="w-5 h-5 text-purple-600" />
                        </div>
                      )}
                      <div>
                        <h3 className="text-xl font-bold text-slate-800">
                          {assignment.todaySession ? 'אימון פרטני מהמאמן' : assignment.mode === 'DAILY' ? 'אימון יומי פרטי' : 'תוכנית תקופתית'}
                        </h3>
                        {assignment.todaySession ? (
                          <p className="text-sm text-slate-600">
                            {assignment.todaySession.exercises?.length || 0} תרגילים • היום
                          </p>
                        ) : assignment.mode === 'ROTATION' && (
                          <p className="text-sm text-slate-600">
                            האימון הבא: <strong>אימון {assignment.next_slot}</strong>
                          </p>
                        )}
                      </div>
                    </div>
                    
                    {assignment.last_completed_at && (
                      <div className="flex items-center gap-2 text-xs text-slate-500 mt-2">
                        <CheckCircle className="w-3 h-3 text-green-500" />
                        אימון אחרון: {new Date(assignment.last_completed_at).toLocaleDateString('he-IL')}
                      </div>
                    )}
                  </div>
                  
                  <Button
                    className="btn-primary h-14 px-8"
                    onClick={() => startWorkout(assignment)}
                  >
                    <Play className="w-5 h-5 ml-2" />
                    התחל אימון
                  </Button>
                </div>
              </Card>
            ))}
          </div>
        )}

        {/* Workout Execution Dialog - Premium */}
        <Dialog open={showWorkout} onOpenChange={(open) => {
          if (!completeWorkoutMutation.isPending && !open) {
            handleCloseWorkout();
          } else if (open) {
            setShowWorkout(true);
          }
        }}>
          <DialogContent dir="rtl" className="max-w-3xl max-h-[90vh] flex flex-col p-0 overflow-hidden">
            <DialogHeader className="px-6 py-4 border-b flex-shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-full bg-teal-100 flex items-center justify-center flex-shrink-0">
                  <Dumbbell className="w-6 h-6 text-teal-600" />
                </div>
                <div className="flex-1 min-w-0">
                  <DialogTitle className="text-xl sm:text-2xl leading-tight">
                    {currentAssignment?.mode === 'ROTATION'
                      ? `אימון ${currentAssignment?.next_slot}`
                      : 'אימון יומי פרטי'}
                  </DialogTitle>
                  <p className="text-xs sm:text-sm text-slate-500 mt-0.5">
                    {workoutData.length} תרגילים
                  </p>
                </div>
              </div>
            </DialogHeader>

            {/* Search bar inside dialog */}
            {workoutData.length > 3 && (
              <div className="px-4 sm:px-6 py-2 border-b bg-slate-50 flex-shrink-0">
                <div className="relative">
                  <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <input
                    type="text"
                    placeholder="חפש תרגיל..."
                    value={exerciseSearch}
                    onChange={e => setExerciseSearch(e.target.value)}
                    className="w-full h-10 pr-10 pl-4 border border-slate-200 rounded-xl text-sm bg-white focus:outline-none focus:border-teal-400 focus:ring-2 focus:ring-teal-100"
                    dir="rtl"
                  />
                </div>
              </div>
            )}

            <div className="flex-1 overflow-y-auto px-4 py-4 sm:px-6 space-y-3">
              {workoutData.filter(ex =>
                !exerciseSearch.trim() ||
                (ex.exercise_name || '').toLowerCase().includes(exerciseSearch.toLowerCase())
              ).map((ex, i) => {
                const isSuperset = ex.block_type === 'superset' || ex.block_type === 'dropset';
                const isFirstInBlock = isSuperset && (i === 0 || workoutData[i - 1]?.block_id !== ex.block_id);
                const isLastInBlock = isSuperset && (i === workoutData.length - 1 || workoutData[i + 1]?.block_id !== ex.block_id);

                return (
                  <div key={i}>
                    {isFirstInBlock && (
                      <div className="bg-amber-100 border-2 border-amber-300 rounded-t-lg px-4 py-2 mb-0">
                        <Badge className="bg-amber-600 text-white font-bold text-sm">
                          🔗 {ex.block_type === 'superset' ? 'SUPERSET' : 'DROP SET'}
                        </Badge>
                        <p className="text-xs text-amber-800 mt-1">
                          {ex.block_type === 'superset' 
                            ? 'בצע את שני התרגילים זה אחרי זה ללא מנוחה' 
                            : 'הפחת משקל בכל סט'}
                        </p>
                      </div>
                    )}
                    <div className={isSuperset ? (isFirstInBlock ? 'rounded-t-none' : isLastInBlock ? 'mb-3' : '') : 'mb-3'}>
                      <TraineeExerciseCard
                        exercise={ex}
                        index={i}
                        onUpdate={updateExerciseData}
                        showActualPerformance={true}
                        onSave={() => saveExerciseMutation.mutate(i)}
                        onRemove={() => removeExerciseMutation.mutate(i)}
                        isSaving={saveExerciseMutation.isPending}
                        isRemoving={removeExerciseMutation.isPending}
                        isSaved={savedExercises.has(i)}
                      />
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="px-4 py-4 sm:px-6 border-t bg-white flex-shrink-0">
              {completeWorkoutMutation.isSuccess ? (
                <div className="text-center">
                  <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-green-100 mb-3">
                    <CheckCircle className="w-8 h-8 text-green-600" />
                  </div>
                  <p className="text-lg font-bold text-green-600">האימון הושלם! 💪</p>
                  <p className="text-sm text-slate-500 mt-1">סוגר אוטומטית...</p>
                </div>
              ) : (
                <>
                  <Button
                    className="btn-success w-full h-14 sm:h-16 text-base sm:text-lg shadow-lg"
                    onClick={() => completeWorkoutMutation.mutate()}
                    disabled={completeWorkoutMutation.isPending}
                  >
                    <CheckCircle className="w-5 h-5 sm:w-6 sm:h-6 ml-2 flex-shrink-0" />
                    {completeWorkoutMutation.isPending ? 'שומר...' : 'סיימתי את האימון ✅'}
                  </Button>
                  <p className="text-xs sm:text-sm text-center text-slate-500 mt-3">
                    הביצוע שלך ישמר והמאמן יוכל לעקוב אחרי ההתקדמות
                  </p>
                </>
              )}
            </div>
          </DialogContent>
        </Dialog>

        {/* Exit Warning Dialog */}
        <Dialog open={showExitWarning} onOpenChange={setShowExitWarning}>
          <DialogContent dir="rtl" className="max-w-md">
            <DialogHeader>
              <DialogTitle className="text-xl text-red-600">⚠️ יש שינויים שלא נשמרו</DialogTitle>
            </DialogHeader>
            <div className="py-4">
              <p className="text-slate-700 mb-4">
                יש לך שינויים שלא נשמרו באימון. מה תרצה לעשות?
              </p>
              <div className="space-y-2">
                <Button
                  className="w-full h-14 bg-green-600 hover:bg-green-700 text-white text-base font-bold"
                  onClick={saveAndExit}
                  disabled={completeWorkoutMutation.isPending}
                >
                  {completeWorkoutMutation.isPending ? 'שומר...' : 'שמור וצא'}
                </Button>
                <Button
                  className="w-full h-14 bg-red-600 hover:bg-red-700 text-white text-base font-bold"
                  onClick={exitWithoutSaving}
                >
                  צא בלי לשמור
                </Button>
                <Button
                  className="w-full h-14"
                  variant="outline"
                  onClick={() => setShowExitWarning(false)}
                >
                  ביטול
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}