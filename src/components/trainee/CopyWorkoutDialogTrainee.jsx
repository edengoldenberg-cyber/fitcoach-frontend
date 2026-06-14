import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { toast } from 'sonner';
import { Copy, Loader2 } from 'lucide-react';

export default function CopyWorkoutDialogTrainee({ open, onClose, workout, traineeEmail }) {
  const queryClient = useQueryClient();
  const [targetDate, setTargetDate] = useState('');

  const copyMutation = useMutation({
    mutationFn: async () => {
      const startTime = Date.now();
      
      if (!targetDate) {
        throw new Error('יש לבחור תאריך יעד');
      }

      try {
        // Check if target workout exists
        const existing = await base44.entities.TraineeWorkout.filter({
          trainee_email: traineeEmail,
          date: targetDate
        });

        // Delete existing workout for the target date
        if (existing.length > 0) {
          for (const old of existing) {
            await base44.entities.TraineeWorkout.delete(old.id);
          }
        }

        // Normalize exercises array
        const sourceExercises = Array.isArray(workout.exercises) ? workout.exercises : [];

        // Create copy without performance data
        const newWorkout = {
          trainee_email: traineeEmail,
          date: targetDate,
          title: workout.title_he || workout.title || 'אימון מועתק',
          status: 'draft',
          source_daily_workout_id: workout.id || null,
          exercises: sourceExercises.map(ex => ({
            exercise_id: ex.exercise_id || null,
            name: ex.exercise_name || ex.name,
            notes: ex.notes || '',
            sets: Array.isArray(ex.sets) 
              ? ex.sets.map((s, idx) => ({
                  setIndex: idx + 1,
                  weight: 0,
                  reps: 0,
                  completed: false
                }))
              : Array.from({ length: ex.sets || 3 }, (_, idx) => ({
                  setIndex: idx + 1,
                  weight: 0,
                  reps: 0,
                  completed: false
                }))
          }))
        };

        const created = await base44.entities.TraineeWorkout.create(newWorkout);
        
        // Log success
        await base44.entities.CopyLog.create({
          action_type: 'copy_all',
          trainee_email: traineeEmail,
          target_date: targetDate,
          daily_workout_id: workout.id,
          payload_json: {
            exercises_count: sourceExercises.length,
            source_title: workout.title_he || workout.title
          },
          success: true,
          duration_ms: Date.now() - startTime
        });
        
        return created;
      } catch (error) {
        // Log failure
        await base44.entities.CopyLog.create({
          action_type: 'copy_all',
          trainee_email: traineeEmail,
          target_date: targetDate,
          daily_workout_id: workout.id,
          error_text: error.message,
          success: false,
          duration_ms: Date.now() - startTime
        });
        throw error;
      }
    },
    onSuccess: async (createdWorkout) => {
      queryClient.invalidateQueries({ queryKey: ['traineeWorkouts'] });
      queryClient.invalidateQueries({ queryKey: ['todayTraineeWorkout'] });
      queryClient.invalidateQueries({ queryKey: ['workouts'] });
      
      // Verify the workout was created
      try {
        const verification = await base44.entities.TraineeWorkout.filter({
          trainee_email: traineeEmail,
          date: targetDate
        });
        
        if (verification && verification.length > 0) {
          console.log('[CopyWorkout] ✓ Verified workout created:', verification[0].id);
          toast.success('✓ האימון הועתק בהצלחה!', {
            description: `${verification[0].exercises?.length || 0} תרגילים הועתקו`
          });
        } else {
          console.error('[CopyWorkout] ✗ Workout not found after creation');
          toast.warning('האימון נוצר אך לא נמצא. רענן את הדף');
        }
      } catch (verifyError) {
        console.error('[CopyWorkout] Verification error:', verifyError);
        toast.success('✓ האימון הועתק בהצלחה!');
      }
      
      onClose();
      setTargetDate('');
    },
    onError: (error) => {
      toast.error(`שגיאה: ${error.message}`);
    }
  });

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md" dir="rtl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Copy className="w-5 h-5 text-blue-600" />
            העתקת אימון
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="targetDate">תאריך יעד</Label>
            <Input
              id="targetDate"
              type="date"
              value={targetDate}
              onChange={(e) => setTargetDate(e.target.value)}
            />
          </div>

          <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-sm">
            <p className="text-blue-800">
              יועתק: מבנה האימון, תרגילים ומספר סטים
            </p>
            <p className="text-blue-600 mt-1">
              ⓘ ביצועים (משקלים/חזרות) לא יועתקו - תצטרך למלא אותם מחדש
            </p>
          </div>
        </div>

        <div className="flex gap-2">
          <Button
            variant="outline"
            onClick={onClose}
            className="flex-1"
            disabled={copyMutation.isPending}
          >
            ביטול
          </Button>
          <Button
            onClick={() => copyMutation.mutate()}
            disabled={copyMutation.isPending || !targetDate}
            className="flex-1 bg-blue-600 hover:bg-blue-700"
          >
            {copyMutation.isPending ? (
              <>
                <Loader2 className="w-4 h-4 ml-2 animate-spin" />
                מעתיק...
              </>
            ) : (
              <>
                <Copy className="w-4 h-4 ml-2" />
                העתק אימון
              </>
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}