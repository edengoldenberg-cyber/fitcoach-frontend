import React, { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Dumbbell, Plus, ChevronRight, ChevronLeft, Calendar, Trash2, Camera, Pencil, ArrowRight } from "lucide-react";
import { Link } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import { toast } from 'sonner';
import AddWorkoutDialog from '../components/trainee/AddWorkoutDialog';
import AddWorkoutFromPhoto from '../components/trainee/AddWorkoutFromPhoto';
import ExerciseCardV2 from '../components/trainee/ExerciseCardV2';
import WorkoutExerciseList from '../components/trainee/WorkoutExerciseList';
import ExercisePickerSheet from '../components/trainee/ExercisePickerSheet';
import WorkoutSessionBar from '../components/trainee/WorkoutSessionBar';
import DailyWorkoutSelector from '../components/trainee/DailyWorkoutSelector';
import RouteGuard from '../components/shared/RouteGuard';
import { format, subDays, addDays, startOfMonth, endOfMonth, eachDayOfInterval } from 'date-fns';
import { he } from 'date-fns/locale/he';
import { LineChart, Line, XAxis, YAxis, ResponsiveContainer, Tooltip } from 'recharts';
import { addLog } from '@/components/shared/diagnostics/logger';

export default function WorkoutLog() {
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [showWorkoutDialog, setShowWorkoutDialog] = useState(false);
  const [showPhotoDialog, setShowPhotoDialog] = useState(false);
  const [prefilledExercises, setPrefilledExercises] = useState([]);
  const [selectedExercise, setSelectedExercise] = useState(null);
  const [editingWorkout, setEditingWorkout] = useState(null);
  const [showExercisePicker, setShowExercisePicker] = useState(false);
  const [extraExercises, setExtraExercises] = useState([]);
  const [exerciseVolumes, setExerciseVolumes] = useState({});
  const [selectedTemplate, setSelectedTemplate] = useState(null); // for multi-workout selection
  
  const queryClient = useQueryClient();
  const dateStr = format(selectedDate, 'yyyy-MM-dd');

  const { data: user } = useQuery({
    queryKey: ['currentUser'],
    queryFn: () => base44.auth.me(),
  });

  const { data: trainee } = useQuery({
    queryKey: ['trainee', user?.email],
    queryFn: async () => {
      const trainees = await base44.entities.Trainee.filter({ user_email: user?.email });
      return trainees[0];
    },
    enabled: !!user?.email,
  });

  const { data: workouts = [] } = useQuery({
    queryKey: ['workouts', user?.email],
    queryFn: () => base44.entities.WorkoutSession.filter({ trainee_email: user?.email }),
    enabled: !!user?.email,
  });

  // Also fetch TraineeWorkout for copied exercises from daily workout
  const { data: traineeWorkouts = [], isLoading: traineeWorkoutsLoading } = useQuery({
    queryKey: ['traineeWorkouts', trainee?.user_email],
    queryFn: async () => {
      try {
        addLog('info', 'workout', 'LOAD_TRAINEE_WORKOUTS_START', {});
        const workouts = await base44.entities.TraineeWorkout.filter({ trainee_email: trainee?.user_email });
        addLog('success', 'workout', 'LOAD_TRAINEE_WORKOUTS_SUCCESS', { count: workouts.length });
        return workouts;
      } catch (error) {
        addLog('error', 'workout', 'LOAD_TRAINEE_WORKOUTS_ERROR', { error: error.message });
        return [];
      }
    },
    enabled: !!trainee?.user_email,
  });

  // Today's group workout (DailyWorkout - published by coach)
  const { data: todayDailyWorkout } = useQuery({
    queryKey: ['todayDailyWorkout', dateStr],
    queryFn: async () => {
      console.log('🔍 WORKOUT DEBUG: Searching for DailyWorkout');
      console.log('date:', dateStr);
      
      const workouts = await base44.entities.DailyWorkout.filter({ 
        date: dateStr, 
        status: 'published' 
      });
      
      console.log('Found DailyWorkouts:', workouts.length);
      
      if (workouts.length > 0) {
        console.log('✅ Found workout:', workouts[0].title_he, 'with', workouts[0].exercises?.length, 'exercises');
        return workouts[0];
      }
      
      return null;
    },
    enabled: !!user?.email,
  });

  // Today's assigned workout (from DailyWorkout → TraineeWorkout)
  const { data: todayAssignedWorkout, isLoading: assignedLoading } = useQuery({
    queryKey: ['todayAssignedWorkout', trainee?.user_email, dateStr],
    queryFn: async () => {
      try {
        addLog('info', 'workout', 'LOAD_TODAY_ASSIGNED_START', { date: dateStr });
        const workouts = await base44.entities.TraineeWorkout.filter({
          trainee_email: trainee?.user_email,
          date: dateStr
        });
        
        if (workouts.length > 0) {
          addLog('success', 'workout', 'LOAD_TODAY_ASSIGNED_SUCCESS', { workout_id: workouts[0].id });
          return workouts[0];
        }
        
        addLog('info', 'workout', 'LOAD_TODAY_ASSIGNED_EMPTY', {});
        return null;
      } catch (error) {
        addLog('error', 'workout', 'LOAD_TODAY_ASSIGNED_ERROR', { error: error.message });
        return null;
      }
    },
    enabled: !!trainee?.user_email,
  });

  // Fetch published multi-workout templates for today
  const { data: todayTemplates = [] } = useQuery({
    queryKey: ['dailyWorkoutTemplates', 'trainee', dateStr],
    queryFn: () => base44.entities.DailyWorkoutTemplate.filter({ date: dateStr, is_published: true }, '-created_date', 20),
    enabled: !!user?.email,
  });

  const { data: allTraineeExercises = [] } = useQuery({
    queryKey: ['allTraineeExercises', traineeWorkouts.map(w => w.id)],
    queryFn: async () => {
      if (!traineeWorkouts.length) return [];
      
      const exercisesPromises = traineeWorkouts.map(workout => 
        base44.entities.TraineeWorkoutExercise.filter({ trainee_workout_id: workout.id })
      );
      
      const exercisesArrays = await Promise.all(exercisesPromises);
      return exercisesArrays.flat();
    },
    enabled: traineeWorkouts.length > 0,
  });

  const { data: allTraineeSets = [] } = useQuery({
    queryKey: ['allTraineeSets', allTraineeExercises.map(e => e.id)],
    queryFn: async () => {
      if (!allTraineeExercises.length) return [];
      
      const setsPromises = allTraineeExercises.map(exercise => 
        base44.entities.TraineeWorkoutSet.filter({ trainee_workout_exercise_id: exercise.id })
      );
      
      const setsArrays = await Promise.all(setsPromises);
      return setsArrays.flat();
    },
    enabled: allTraineeExercises.length > 0,
  });

  const addWorkoutMutation = useMutation({
    mutationFn: async (data) => {
      try {
        console.log('[WorkoutLog] Saving workout via backend function');
        
        const payload = {
          title: data.workout_name || data.title,
          date: dateStr,
          notes: data.notes,
          exercises: data.exercises || [],
          trainee_email: user?.email
        };

        if (editingWorkout) {
          payload.workout_session_id = editingWorkout.id;
        }

        console.log('[WorkoutLog] Payload:', payload);

        const response = await base44.functions.invoke('saveWorkoutSession', payload);

        console.log('[WorkoutLog] Backend response:', response.data);
        
        if (!response.data.success && !response.data.ok) {
          throw new Error(response.data.message_he || response.data.error || 'שגיאה בשמירה');
        }

        return response.data;
      } catch (err) {
        console.error('[WorkoutLog] Save error:', err);
        throw err;
      }
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['workouts'] });
      queryClient.invalidateQueries({ queryKey: ['workoutDetails'] });
      setShowWorkoutDialog(false);
      setEditingWorkout(null);
      toast.success(`✅ האימון נשמר\n${result.exercises_saved} תרגילים, ${result.sets_saved} סטים`);
    },
    onError: (error) => {
      console.error('[WorkoutLog] Mutation error:', error);
      toast.error(`❌ ${error.message || 'שגיאה לא ידועה'}`);
    }
  });

  const deleteWorkoutMutation = useMutation({
    mutationFn: async ({ id, sourceType }) => {
      if (sourceType === 'trainee_workout') {
        return await base44.entities.TraineeWorkout.delete(id);
      } else {
        return await base44.entities.WorkoutSession.delete(id);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['workouts'] });
      queryClient.invalidateQueries({ queryKey: ['traineeWorkouts'] });
    },
  });

  const todayWorkouts = useMemo(() => {
    return workouts.filter(w => w.date === dateStr);
  }, [workouts, dateStr]);

  const todayTraineeWorkouts = useMemo(() => {
    return traineeWorkouts.filter(w => w.date === dateStr);
  }, [traineeWorkouts, dateStr]);

  // Combine both workout types for display
  const combinedTodayWorkouts = useMemo(() => {
    const combined = [...todayWorkouts];
    
    // Add TraineeWorkouts as well
    todayTraineeWorkouts.forEach(tw => {
      // Handle exercises from embedded JSON array
      let exercises = [];
      
      if (Array.isArray(tw.exercises)) {
        // New format: exercises stored as JSON array
        exercises = tw.exercises.map(ex => ({
          exercise_name: ex.name || ex.exercise_name || 'תרגיל',
          notes: ex.notes,
          sets: Array.isArray(ex.sets) ? ex.sets : []
        }));
      } else {
        // Old format: exercises from TraineeWorkoutExercise entity
        exercises = allTraineeExercises
          .filter(e => e.trainee_workout_id === tw.id)
          .map(exercise => {
            const sets = allTraineeSets
              .filter(s => s.trainee_workout_exercise_id === exercise.id)
              .map(set => ({
                weight: set.weight || 0,
                reps: set.reps || 0,
                completed: set.completed || false
              }));
            
            return {
              exercise_name: exercise.exercise_name,
              notes: exercise.notes,
              sets
            };
          });
      }
      
      if (exercises.length > 0) {
        combined.push({
          id: tw.id,
          date: tw.date,
          workout_name: tw.title || 'אימון יומי',
          title: tw.title,
          notes: tw.notes,
          exercises,
          source_type: 'trainee_workout'
        });
      }
    });
    
    return combined;
  }, [todayWorkouts, todayTraineeWorkouts, allTraineeExercises, allTraineeSets]);

  const allExercises = useMemo(() => {
    const exercises = new Set();
    workouts.forEach(w => {
      w.exercises?.forEach(e => exercises.add(e.exercise_name));
    });
    return Array.from(exercises);
  }, [workouts]);

  const uniqueWeeks = useMemo(() => {
    const weeks = new Set();
    workouts.forEach(w => {
      const date = new Date(w.date);
      const weekStart = new Date(date);
      weekStart.setDate(date.getDate() - date.getDay());
      weeks.add(format(weekStart, 'yyyy-MM-dd'));
    });
    return weeks.size;
  }, [workouts]);

  const { data: exerciseHistoryAll = [] } = useQuery({
    queryKey: ['exerciseHistoryAll', user?.email],
    queryFn: () => base44.entities.ExerciseHistory.filter({ trainee_email: user?.email }),
    enabled: !!user?.email,
  });

  const exerciseProgressData = useMemo(() => {
    if (!selectedExercise) return [];

    // Primary: ExerciseHistory records for this exercise
    const historyRecords = exerciseHistoryAll.filter(
      h => (h.exercise_name || '').toLowerCase() === selectedExercise.toLowerCase()
    );

    if (historyRecords.length > 0) {
      // Deduplicate by date (keep highest weight per date)
      const byDate = {};
      historyRecords.forEach(h => {
        const w = parseFloat(h.weight) || 0;
        if (!byDate[h.date] || w > byDate[h.date]) byDate[h.date] = w;
      });
      return Object.entries(byDate)
        .sort(([a], [b]) => new Date(a) - new Date(b))
        .slice(-10)
        .map(([date, weight]) => ({ date: format(new Date(date), 'd/M'), weight }));
    }

    // Fallback: WorkoutSession data
    return workouts
      .filter(w => w.exercises?.some(e => e.exercise_name === selectedExercise))
      .sort((a, b) => new Date(a.date) - new Date(b.date))
      .slice(-10)
      .map(w => {
        const exercise = w.exercises.find(e => e.exercise_name === selectedExercise);
        const maxWeight = Math.max(...(exercise?.sets?.map(s => s.weight) || [0]));
        return { date: format(new Date(w.date), 'd/M'), weight: maxWeight };
      });
  }, [exerciseHistoryAll, workouts, selectedExercise]);

  const monthStart = startOfMonth(selectedDate);
  const monthEnd = endOfMonth(selectedDate);
  const monthDays = eachDayOfInterval({ start: monthStart, end: monthEnd });

  const workoutDates = useMemo(() => {
    const dates = new Set(workouts.map(w => w.date));
    traineeWorkouts.forEach(tw => dates.add(tw.date));
    return dates;
  }, [workouts, traineeWorkouts]);

  // Show loading state
  if (traineeWorkoutsLoading || assignedLoading) {
    return (
      <RouteGuard moduleName="workouts" trainee={trainee}>
        <div className="min-h-screen bg-gradient-to-br from-green-50 to-emerald-100 pb-20 flex items-center justify-center" dir="rtl">
          <div className="text-center">
            <Dumbbell className="w-12 h-12 text-green-600 animate-pulse mx-auto mb-4" />
            <p className="text-slate-600">טוען אימון...</p>
          </div>
        </div>
      </RouteGuard>
    );
  }

  return (
    <RouteGuard moduleName="workouts" trainee={trainee}>
      <div className="min-h-screen bg-gradient-to-br from-green-50 to-emerald-100 pb-44" dir="rtl">
        <div className="max-w-lg mx-auto px-4 py-6">
        {/* Header */}
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-2xl font-bold text-green-800 flex items-center gap-2">
            <Dumbbell className="w-7 h-7 text-green-600" />
            אימון היום
          </h1>
          <div className="flex gap-2">
            <Link to={createPageUrl('TraineeDailyWorkout')}>
              <Button variant="outline" size="sm" className="border-green-500 text-green-600 hover:bg-green-50">
                היסטוריה
              </Button>
            </Link>
          </div>
        </div>

        {/* Multi-Workout Templates Section */}
        {todayTemplates.length > 0 && !selectedTemplate && (
          <div className="mb-4">
            <DailyWorkoutSelector
              workouts={todayTemplates}
              onSelect={(tmpl) => {
                setSelectedTemplate(tmpl);
                setExtraExercises([]);
                setExerciseVolumes({});
              }}
            />
          </div>
        )}

        {/* If a template is selected, show it */}
        {selectedTemplate && (
          <div className="space-y-4 mb-4">
            <div className="flex items-center gap-2 mb-1">
              <button
                onClick={() => { setSelectedTemplate(null); setExtraExercises([]); setExerciseVolumes({}); }}
                className="flex items-center gap-1 text-sm text-orange-600 hover:text-orange-700"
              >
                <ArrowRight className="w-4 h-4" />
                חזור לרשימה
              </button>
            </div>
            <Card className="p-4 bg-gradient-to-br from-orange-50 to-orange-100 border-2 border-orange-300 shadow-lg">
              <h2 className="text-xl font-bold text-orange-800">{selectedTemplate.title}</h2>
              {selectedTemplate.description && <p className="text-sm text-slate-600 mt-1">{selectedTemplate.description}</p>}
            </Card>
            {selectedTemplate.exercises?.length > 0 ? (
              <div className="space-y-3">
                {/* Debug info */}
                <div className="text-xs text-slate-400 bg-slate-50 border border-slate-100 rounded-lg px-3 py-2">
                  🔍 אימון: <strong>{selectedTemplate.title}</strong> · {selectedTemplate.exercises.length} תרגילים מהמאמן
                  {extraExercises.length > 0 && ` · +${extraExercises.length} שהוספת`}
                  <span className="mr-2 text-slate-300">· ID: {selectedTemplate.id?.slice(-6)}</span>
                </div>
                <WorkoutExerciseList
                  exercises={[...selectedTemplate.exercises, ...extraExercises]}
                  traineeEmail={trainee?.user_email}
                  traineeId={trainee?.id}
                  workoutDate={dateStr}
                  workoutId={selectedTemplate.id}
                  onVolumeChange={(key, vol) => setExerciseVolumes(v => ({ ...v, [key]: vol }))}
                  onSaveSuccess={() => queryClient.invalidateQueries({ queryKey: ['traineeWorkouts'] })}
                />
              </div>
            ) : (
              <Card className="p-6 text-center bg-amber-50 border-amber-200">
                <p className="text-amber-800">האימון עדיין לא מכיל תרגילים</p>
                <p className="text-xs text-slate-400 mt-1">ID: {selectedTemplate.id} · exercises: {JSON.stringify(selectedTemplate.exercises)?.slice(0, 80)}</p>
              </Card>
            )}
          </div>
        )}

        {/* Today's Group Workout (DailyWorkout) */}
        {!selectedTemplate && todayTemplates.length === 0 && todayDailyWorkout ? (
          <div className="space-y-4">
            <Card className="p-4 bg-gradient-to-br from-orange-50 to-orange-100 border-2 border-orange-300 shadow-lg">
              <div className="flex items-center justify-between mb-2">
                <h2 className="text-xl font-bold text-orange-800">{todayDailyWorkout.title_he || 'אימון קבוצתי'}</h2>
                <span className="text-xs bg-orange-500 text-white px-2 py-1 rounded-full">
                  אימון קבוצתי
                </span>
              </div>
              {todayDailyWorkout.description_he && (
                <p className="text-sm text-slate-600 mb-3">{todayDailyWorkout.description_he}</p>
              )}
              <div className="flex items-center gap-2 text-xs text-slate-500">
                <Calendar className="w-3 h-3" />
                <span>{format(new Date(dateStr), 'd בMMMM', { locale: he })}</span>
              </div>
            </Card>

            {/* Exercise Cards - V2 */}
            {todayDailyWorkout.exercises && todayDailyWorkout.exercises.length > 0 ? (
              <div className="space-y-3">
                <WorkoutExerciseList
                  exercises={[...todayDailyWorkout.exercises, ...extraExercises]}
                  traineeEmail={trainee?.user_email}
                  traineeId={trainee?.id}
                  workoutDate={dateStr}
                  workoutId={todayDailyWorkout.id}
                  onVolumeChange={(key, vol) => setExerciseVolumes(v => ({ ...v, [key]: vol }))}
                  onSaveSuccess={() => {
                    queryClient.invalidateQueries({ queryKey: ['traineeWorkouts'] });
                    queryClient.invalidateQueries({ queryKey: ['workouts'] });
                  }}
                />
              </div>
            ) : (
              <Card className="p-6 text-center bg-amber-50 border-amber-200">
                <p className="text-amber-800">האימון עדיין לא מכיל תרגילים</p>
              </Card>
            )}
          </div>
        ) : !selectedTemplate && todayTemplates.length === 0 && !todayDailyWorkout && todayAssignedWorkout ? (
          <div className="space-y-4">
            <Card className="p-4 bg-white border-2 border-green-300 shadow-lg">
              <h2 className="text-xl font-bold text-green-800 mb-2">{todayAssignedWorkout.title}</h2>
              {todayAssignedWorkout.notes && (
                <p className="text-sm text-slate-600 mb-3">{todayAssignedWorkout.notes}</p>
              )}
              <div className="flex items-center gap-2 text-xs text-slate-500">
                <Calendar className="w-3 h-3" />
                <span>{format(new Date(dateStr), 'd בMMMM', { locale: he })}</span>
              </div>
            </Card>

            {/* Exercise Cards - V2 */}
            {todayAssignedWorkout.exercises && todayAssignedWorkout.exercises.length > 0 ? (
              <WorkoutExerciseList
                exercises={[...todayAssignedWorkout.exercises, ...extraExercises]}
                traineeEmail={trainee?.user_email}
                traineeId={trainee?.id}
                workoutDate={dateStr}
                workoutId={todayAssignedWorkout.id}
                onVolumeChange={(key, vol) => setExerciseVolumes(v => ({ ...v, [key]: vol }))}
                onSaveSuccess={() => {
                  queryClient.invalidateQueries({ queryKey: ['traineeWorkouts'] });
                }}
              />
            ) : (
              <Card className="p-6 text-center bg-amber-50 border-amber-200">
                <p className="text-amber-800">האימון עדיין לא מכיל תרגילים</p>
              </Card>
            )}
          </div>
        ) : !selectedTemplate && todayTemplates.length === 0 && !todayDailyWorkout ? (
          <Card className="p-6 text-center bg-slate-50">
            <Dumbbell className="w-12 h-12 text-slate-300 mx-auto mb-3" />
            <p className="text-slate-600 mb-4">אין אימון מוקצה להיום</p>
            <div className="flex gap-2 justify-center">
              <Button onClick={() => setShowPhotoDialog(true)} variant="outline">
                <Camera className="w-4 h-4 ml-1" />
                צלם לוח
              </Button>
              <Button onClick={() => setShowWorkoutDialog(true)} className="bg-green-600 hover:bg-green-700">
                <Plus className="w-4 h-4 ml-1" />
                הוסף ידני
              </Button>
            </div>
          </Card>
        ) : null}

        {/* OLD DATE PICKER - Hidden by default */}
        <details className="mt-8">
          <summary className="text-sm text-slate-500 cursor-pointer hover:text-slate-700 mb-4">
            📅 צפה באימונים קודמים
          </summary>
        
          <div className="space-y-4 mt-4">
            {/* Stats */}
            <div className="grid grid-cols-3 gap-3">
              <Card className="p-4 text-center bg-white border-0 shadow-sm">
                <p className="text-2xl font-bold text-emerald-600">{allExercises.length}</p>
                <p className="text-xs text-slate-500">תרגילים שונים</p>
              </Card>
              <Card className="p-4 text-center bg-white border-0 shadow-sm">
                <p className="text-2xl font-bold text-blue-600">{uniqueWeeks}</p>
                <p className="text-xs text-slate-500">שבועות</p>
              </Card>
              <Card className="p-4 text-center bg-white border-0 shadow-sm">
                <p className="text-2xl font-bold text-orange-600">{workouts.length}</p>
                <p className="text-xs text-slate-500">סה״כ אימונים</p>
              </Card>
            </div>

            {/* Calendar Mini View */}
            <Card className="p-4 bg-white border-0 shadow-sm">
              <div className="flex items-center justify-between mb-3">
                <Button variant="ghost" size="icon" onClick={() => setSelectedDate(subDays(selectedDate, 30))}>
                  <ChevronRight className="w-5 h-5" />
                </Button>
                <h3 className="font-medium text-slate-700">
                  {format(selectedDate, 'MMMM yyyy', { locale: he })}
                </h3>
                <Button variant="ghost" size="icon" onClick={() => setSelectedDate(addDays(selectedDate, 30))}>
                  <ChevronLeft className="w-5 h-5" />
                </Button>
              </div>
              <div className="grid grid-cols-7 gap-1 text-center text-xs">
                {['א', 'ב', 'ג', 'ד', 'ה', 'ו', 'ש'].map(d => (
                  <div key={d} className="text-slate-400 py-1">{d}</div>
                ))}
                {Array(monthStart.getDay()).fill(null).map((_, i) => (
                  <div key={`empty-${i}`} />
                ))}
                {monthDays.map(day => {
                  const dayStr = format(day, 'yyyy-MM-dd');
                  const hasWorkout = workoutDates.has(dayStr);
                  const isSelected = dayStr === dateStr;
                  const isToday = dayStr === format(new Date(), 'yyyy-MM-dd');
                  return (
                    <button
                      key={dayStr}
                      onClick={() => setSelectedDate(day)}
                      className={`p-1.5 rounded-full text-xs transition-all ${
                        isSelected ? 'bg-orange-500 text-white' :
                        hasWorkout ? 'bg-emerald-100 text-emerald-700' :
                        isToday ? 'bg-blue-100 text-blue-700' :
                        'hover:bg-slate-100'
                      }`}
                    >
                      {format(day, 'd')}
                    </button>
                  );
                })}
              </div>
            </Card>

            {/* Exercise Progress Chart */}
            {allExercises.length > 0 && (
              <Card className="p-4 bg-white border-0 shadow-sm">
                <h3 className="font-medium text-slate-700 mb-3">התקדמות לפי תרגיל</h3>
                <div className="flex flex-wrap gap-2 mb-3">
                  {allExercises.map(ex => (
                    <Button
                      key={ex}
                      variant={selectedExercise === ex ? "default" : "outline"}
                      size="sm"
                      onClick={() => setSelectedExercise(selectedExercise === ex ? null : ex)}
                      className={selectedExercise === ex ? "bg-orange-500" : ""}
                    >
                      {ex}
                    </Button>
                  ))}
                </div>
                {selectedExercise && exerciseProgressData.length > 0 && (
                  <div className="h-40">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={exerciseProgressData}>
                        <XAxis dataKey="date" fontSize={10} />
                        <YAxis fontSize={10} />
                        <Tooltip />
                        <Line 
                          type="monotone" 
                          dataKey="weight" 
                          stroke="#F97316" 
                          strokeWidth={2}
                          dot={{ fill: '#F97316' }}
                        />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </Card>
            )}

            {/* Selected Day Workouts */}
            <Card className="p-4 bg-white border-0 shadow-sm">
              <h3 className="font-medium text-slate-700 mb-3">
                אימונים ב-{format(selectedDate, 'd בMMMM', { locale: he })}
              </h3>
              
              {combinedTodayWorkouts.length === 0 ? (
                <p className="text-center py-6 text-slate-400">לא בוצעו אימונים ביום זה</p>
              ) : (
                <div className="space-y-4">
                  {combinedTodayWorkouts.map(workout => (
                    <div key={workout.id} className="p-4 bg-orange-50 rounded-xl border border-orange-100">
                      <div className="flex justify-between items-start mb-3">
                        <div>
                          <h4 className="font-bold text-slate-800">{workout.workout_name || 'אימון כוח'}</h4>
                          {workout.notes && <p className="text-sm text-slate-500">{workout.notes}</p>}
                        </div>
                        <div className="flex gap-1">
                          <Button 
                            variant="ghost" 
                            size="icon"
                            className="text-slate-400 hover:text-orange-500"
                            onClick={() => {
                              setEditingWorkout(workout);
                              setShowWorkoutDialog(true);
                            }}
                          >
                            <Pencil className="w-4 h-4" />
                          </Button>
                          <Button 
                            variant="ghost" 
                            size="icon"
                            className="text-slate-400 hover:text-red-500"
                            onClick={() => deleteWorkoutMutation.mutate({ 
                              id: workout.id, 
                              sourceType: workout.source_type 
                            })}
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>
                      </div>
                      
                      <div className="space-y-2">
                        {Array.isArray(workout.exercises) && workout.exercises.map((ex, i) => (
                          <div key={i} className="p-2 bg-white rounded-lg">
                            <p className="font-medium text-slate-700 mb-1">{ex.exercise_name}</p>
                            <div className="flex flex-wrap gap-2 mb-2">
                              {Array.isArray(ex.sets) && ex.sets.map((set, j) => (
                                <span key={j} className="text-xs bg-slate-100 px-2 py-1 rounded">
                                  {set.weight}kg × {set.reps}
                                </span>
                              ))}
                            </div>
                            {ex.notes && (
                              <p className="text-xs text-amber-600 bg-amber-50 p-2 rounded mt-1">
                                💬 {ex.notes}
                              </p>
                            )}
                          </div>
                        ))}
                      </div>
                      
                      {workout.coach_rating && (
                        <div className="mt-3 pt-3 border-t">
                          <div className="flex items-center justify-between">
                            <span className="text-xs text-slate-500">דירוג מאמן:</span>
                            <div className="flex gap-0.5">
                              {Array.from({length: 5}).map((_, i) => (
                                <span key={i} className={i < workout.coach_rating ? 'text-amber-500' : 'text-slate-300'}>
                                  ★
                                </span>
                              ))}
                            </div>
                          </div>
                          {workout.coach_feedback && (
                            <div className="mt-2 p-2 bg-blue-50 rounded text-xs">
                              <p className="font-medium text-blue-900">משוב מאמן:</p>
                              <p className="text-blue-700">{workout.coach_feedback}</p>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </Card>
          </div>
        </details>

        <AddWorkoutDialog
          open={showWorkoutDialog}
          onClose={() => {
            setShowWorkoutDialog(false);
            setPrefilledExercises([]);
            setEditingWorkout(null);
          }}
          onSave={(data) => addWorkoutMutation.mutate(data)}
          traineeEmail={user?.email}
          previousWorkouts={workouts}
          prefilledExercises={prefilledExercises}
          editingWorkout={editingWorkout}
          workoutDate={dateStr}
        />

        <AddWorkoutFromPhoto
          open={showPhotoDialog}
          onClose={() => setShowPhotoDialog(false)}
          onWorkoutDetected={(exercises) => {
            setPrefilledExercises(exercises);
            setShowPhotoDialog(false);
            setShowWorkoutDialog(true);
          }}
        />
        </div>
      </div>

      {/* Floating Add Exercise Button */}
      {(selectedTemplate || todayDailyWorkout || todayAssignedWorkout) && (
        <button
          onClick={() => setShowExercisePicker(true)}
          className="fixed bottom-32 left-5 z-40 w-14 h-14 rounded-full shadow-2xl flex items-center justify-center text-white text-2xl"
          style={{ background: 'linear-gradient(135deg, #f97316, #ea580c)' }}
          title="הוסף תרגיל"
        >
          <Plus className="w-7 h-7" />
        </button>
      )}

      {/* Sticky Workout Session Bar */}
      {(selectedTemplate || todayDailyWorkout || todayAssignedWorkout) && (
        <WorkoutSessionBar
          exerciseCount={(selectedTemplate?.exercises?.length || todayDailyWorkout?.exercises?.length || todayAssignedWorkout?.exercises?.length || 0) + extraExercises.length}
          totalVolume={Object.values(exerciseVolumes).reduce((a, b) => a + b, 0)}
        />
      )}

      {/* Exercise Picker Bottom Sheet */}
      <ExercisePickerSheet
        open={showExercisePicker}
        onClose={() => setShowExercisePicker(false)}
        onAddExercise={(ex) => setExtraExercises(prev => [...prev, ex])}
        recentExercises={allExercises.slice(0, 10).map(name => ({ name }))}
        favoriteExercises={[]}
      />
    </RouteGuard>
  );
}