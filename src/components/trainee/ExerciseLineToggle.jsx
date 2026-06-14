import React, { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Button } from "@/components/ui/button";
import { Plus, Minus, Loader2 } from "lucide-react";

export default function ExerciseLineToggle({ 
  dailyExercise, 
  traineeEmail, 
  targetDate, 
  isAdded = false 
}) {
  const queryClient = useQueryClient();
  const [lastClickTime, setLastClickTime] = useState(0);

  const addMutation = useMutation({
    mutationFn: async () => {
      // Debounce: prevent rapid clicks
      const now = Date.now();
      if (now - lastClickTime < 1000) {
        throw new Error('נא להמתין שנייה');
      }
      setLastClickTime(now);

      console.log('[ExerciseLineToggle] Adding exercise:', dailyExercise.exercise_name);

      // Step 1: Find or create TraineeWorkout for today
      let traineeWorkouts = await base44.entities.TraineeWorkout.filter({
        trainee_email: traineeEmail,
        date: targetDate
      });

      let traineeWorkout;
      if (traineeWorkouts.length === 0) {
        // Create new trainee workout
        traineeWorkout = await base44.entities.TraineeWorkout.create({
          trainee_email: traineeEmail,
          date: targetDate,
          title: 'האימון שלי להיום',
          status: 'in_progress'
        });
        console.log('[ExerciseLineToggle] Created trainee workout:', traineeWorkout.id);
      } else {
        traineeWorkout = traineeWorkouts[0];
        console.log('[ExerciseLineToggle] Using existing workout:', traineeWorkout.id);
      }

      // Step 2: Check if exercise already exists (idempotent)
      const existingExercises = await base44.entities.TraineeWorkoutExercise.filter({
        trainee_workout_id: traineeWorkout.id,
        exercise_name: dailyExercise.exercise_name
      });

      if (existingExercises.length > 0) {
        console.log('[ExerciseLineToggle] Exercise already exists');
        return { alreadyExists: true };
      }

      // Step 3: Get current max order_index
      const allExercises = await base44.entities.TraineeWorkoutExercise.filter({
        trainee_workout_id: traineeWorkout.id
      });
      const maxOrder = allExercises.length > 0 
        ? Math.max(...allExercises.map(e => e.order_index || 0))
        : -1;

      // Step 4: Create trainee exercise
      const traineeExercise = await base44.entities.TraineeWorkoutExercise.create({
        trainee_workout_id: traineeWorkout.id,
        order_index: maxOrder + 1,
        exercise_name: dailyExercise.exercise_name,
        notes: dailyExercise.notes_he || null
      });

      console.log('[ExerciseLineToggle] Created exercise:', traineeExercise.id);

      // Step 5: Get sets from daily workout
      const dailySets = await base44.entities.DailyWorkoutSet.filter({
        daily_workout_exercise_id: dailyExercise.id
      });

      // Step 6: Create trainee sets
      const setsCount = dailySets.length > 0 ? dailySets.length : (dailyExercise.default_sets_count || 4);
      const setsData = [];

      if (dailySets.length > 0) {
        dailySets.sort((a, b) => a.set_index - b.set_index).forEach(set => {
          setsData.push({
            trainee_workout_exercise_id: traineeExercise.id,
            set_index: set.set_index,
            reps_min: set.target_reps_min || null,
            reps_max: set.target_reps_max || null,
            target_reps: set.target_reps_min || null,
            completed: false
          });
        });
      } else {
        // Create default sets
        for (let i = 0; i < setsCount; i++) {
          setsData.push({
            trainee_workout_exercise_id: traineeExercise.id,
            set_index: i + 1,
            reps_min: null,
            reps_max: null,
            completed: false
          });
        }
      }

      await base44.entities.TraineeWorkoutSet.bulkCreate(setsData);
      console.log('[ExerciseLineToggle] Created', setsData.length, 'sets');

      return { 
        success: true, 
        exercise_id: traineeExercise.id,
        sets_count: setsData.length 
      };
    },
    onSuccess: (data) => {
      if (data.alreadyExists) {
        alert('התרגיל כבר קיים באימון שלך');
      }
      queryClient.invalidateQueries({ queryKey: ['myWorkouts'] });
      queryClient.invalidateQueries({ queryKey: ['traineeWorkouts'] });
    },
    onError: (error) => {
      console.error('[ExerciseLineToggle] Add error:', error);
      alert(`❌ שגיאה בהוספת תרגיל:\n\n${error.message}`);
    }
  });

  const removeMutation = useMutation({
    mutationFn: async () => {
      // Debounce
      const now = Date.now();
      if (now - lastClickTime < 1000) {
        throw new Error('נא להמתין שנייה');
      }
      setLastClickTime(now);

      console.log('[ExerciseLineToggle] Removing exercise:', dailyExercise.exercise_name);

      // Step 1: Find trainee workout
      const traineeWorkouts = await base44.entities.TraineeWorkout.filter({
        trainee_email: traineeEmail,
        date: targetDate
      });

      if (traineeWorkouts.length === 0) {
        return { alreadyRemoved: true };
      }

      const traineeWorkout = traineeWorkouts[0];

      // Step 2: Find exercise
      const exercises = await base44.entities.TraineeWorkoutExercise.filter({
        trainee_workout_id: traineeWorkout.id,
        exercise_name: dailyExercise.exercise_name
      });

      if (exercises.length === 0) {
        return { alreadyRemoved: true };
      }

      const exercise = exercises[0];

      // Step 3: Delete sets first
      const sets = await base44.entities.TraineeWorkoutSet.filter({
        trainee_workout_exercise_id: exercise.id
      });

      await Promise.all(sets.map(s => base44.entities.TraineeWorkoutSet.delete(s.id)));
      console.log('[ExerciseLineToggle] Deleted', sets.length, 'sets');

      // Step 4: Delete exercise
      await base44.entities.TraineeWorkoutExercise.delete(exercise.id);
      console.log('[ExerciseLineToggle] Deleted exercise');

      return { success: true };
    },
    onSuccess: (data) => {
      if (data.alreadyRemoved) {
        alert('התרגיל כבר הוסר מהאימון שלך');
      }
      queryClient.invalidateQueries({ queryKey: ['myWorkouts'] });
      queryClient.invalidateQueries({ queryKey: ['traineeWorkouts'] });
    },
    onError: (error) => {
      console.error('[ExerciseLineToggle] Remove error:', error);
      alert(`❌ שגיאה בהסרת תרגיל:\n\n${error.message}`);
    }
  });

  const isPending = addMutation.isPending || removeMutation.isPending;

  if (isAdded) {
    return (
      <Button
        size="sm"
        variant="outline"
        onClick={() => removeMutation.mutate()}
        disabled={isPending}
        className="border-red-200 text-red-600 hover:bg-red-50"
      >
        {isPending ? (
          <Loader2 className="w-3 h-3 animate-spin ml-1" />
        ) : (
          <Minus className="w-3 h-3 ml-1" />
        )}
        הסר
      </Button>
    );
  }

  return (
    <Button
      size="sm"
      onClick={() => addMutation.mutate()}
      disabled={isPending}
      className="bg-green-600 hover:bg-green-700 text-white"
    >
      {isPending ? (
        <Loader2 className="w-3 h-3 animate-spin ml-1" />
      ) : (
        <Plus className="w-3 h-3 ml-1" />
      )}
      הוסף לאימון
    </Button>
  );
}