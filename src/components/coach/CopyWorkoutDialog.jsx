import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { toast } from 'sonner';
import { Copy, Loader2, Users, Send } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useQuery } from '@tanstack/react-query';
import { addLog } from '@/components/shared/diagnostics/logger';

export default function CopyWorkoutDialog({ open, onClose, workout }) {
  const queryClient = useQueryClient();
  const [mode, setMode] = useState('date'); // 'date' | 'trainee'
  const [targetDate, setTargetDate] = useState('');
  const [selectedTrainee, setSelectedTrainee] = useState('');
  const [replaceExisting, setReplaceExisting] = useState(true);
  const [copyPerformance, setCopyPerformance] = useState(false);

  const { data: user } = useQuery({
    queryKey: ['currentUser'],
    queryFn: () => base44.auth.me(),
  });

  const { data: trainees = [] } = useQuery({
    queryKey: ['coachTrainees', user?.email],
    queryFn: () => base44.entities.Trainee.filter({ coach_email: user?.email, status: 'active' }),
    enabled: !!user?.email && mode === 'trainee',
  });

  const copyMutation = useMutation({
    mutationFn: async () => {
      if (mode === 'trainee') {
        // Copy to trainee
        if (!selectedTrainee || !targetDate) {
          throw new Error('יש לבחור מתאמן ותאריך');
        }

        addLog('info', 'workout', 'COPY_WORKOUT_START', { trainee: selectedTrainee, date: targetDate });

        const response = await base44.functions.invoke('copyWorkoutToTrainee', {
          trainee_email: selectedTrainee,
          daily_workout_id: workout.id || workout.source_daily_workout_id,
          target_date: targetDate
        });

        if (!response.data?.success) {
          throw new Error(response.data?.message || 'Copy failed');
        }

        addLog('success', 'workout', 'COPY_WORKOUT_SUCCESS', { workout_id: response.data.data?.workout_id });
        return response.data;
      } else {
        // Copy to another date (existing behavior)
        if (!targetDate) {
          throw new Error('יש לבחור תאריך יעד');
        }

        addLog('info', 'workout', 'COPY_WORKOUT_START', { target_date: targetDate });

        const existing = await base44.entities.DailyWorkout.filter({
          coach_email: workout.coach_email,
          date: targetDate
        });

        if (existing.length > 0 && !replaceExisting) {
          throw new Error('קיים אימון בתאריך זה. בחר "להחליף אימון קיים" כדי להמשיך');
        }

        if (existing.length > 0 && replaceExisting) {
          for (const old of existing) {
            await base44.entities.DailyWorkout.delete(old.id);
          }
        }

        const newWorkout = {
          coach_email: workout.coach_email,
          date: targetDate,
          title_he: workout.title_he,
          description_he: workout.description_he,
          status: 'draft',
          exercises: workout.exercises || []
        };

        if (!copyPerformance && newWorkout.exercises) {
          newWorkout.exercises = newWorkout.exercises.map(ex => {
            const setsCount = typeof ex.sets === 'number' ? ex.sets : (Array.isArray(ex.sets) ? ex.sets.length : 3);
            return {
              exercise_id: ex.exercise_id,
              exercise_name: ex.exercise_name,
              sets: setsCount,
              reps_min: ex.reps_min,
              reps_max: ex.reps_max,
              notes: ex.notes
            };
          });
        }

        const created = await base44.entities.DailyWorkout.create(newWorkout);
        addLog('success', 'workout', 'COPY_WORKOUT_SUCCESS', { workout_id: created.id });
        return created;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['dailyWorkouts'] });
      queryClient.invalidateQueries({ queryKey: ['traineeWorkouts'] });
      
      if (mode === 'trainee') {
        toast.success('✅ האימון הועתק למתאמן!');
      } else {
        toast.success('✅ האימון הועתק בהצלחה!');
      }
      
      onClose();
      setMode('date');
      setTargetDate('');
      setSelectedTrainee('');
      setReplaceExisting(true);
      setCopyPerformance(false);
    },
    onError: (error) => {
      addLog('error', 'workout', 'COPY_WORKOUT_ERROR', { error: error.message });
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
          {/* Mode Selection */}
          <div className="flex gap-2 p-1 bg-slate-100 rounded-lg">
            <Button
              variant={mode === 'date' ? 'default' : 'ghost'}
              size="sm"
              onClick={() => setMode('date')}
              className="flex-1"
            >
              העתק לתאריך אחר
            </Button>
            <Button
              variant={mode === 'trainee' ? 'default' : 'ghost'}
              size="sm"
              onClick={() => setMode('trainee')}
              className="flex-1"
            >
              <Users className="w-4 h-4 ml-1" />
              שלח למתאמן
            </Button>
          </div>

          {mode === 'trainee' && (
            <div className="space-y-2">
              <Label>בחר מתאמן</Label>
              <Select value={selectedTrainee} onValueChange={setSelectedTrainee}>
                <SelectTrigger>
                  <SelectValue placeholder="בחר מתאמן..." />
                </SelectTrigger>
                <SelectContent>
                  {trainees.map(t => (
                    <SelectItem key={t.user_email} value={t.user_email}>
                      {t.full_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="targetDate">תאריך</Label>
            <Input
              id="targetDate"
              type="date"
              value={targetDate}
              onChange={(e) => setTargetDate(e.target.value)}
              min={new Date().toISOString().split('T')[0]}
            />
          </div>

          <div className="flex items-center gap-2">
            <Checkbox
              id="replace"
              checked={replaceExisting}
              onCheckedChange={setReplaceExisting}
            />
            <Label htmlFor="replace" className="cursor-pointer text-sm">
              להחליף אימון קיים בתאריך זה (אם קיים)
            </Label>
          </div>

          <div className="flex items-center gap-2">
            <Checkbox
              id="copyPerf"
              checked={copyPerformance}
              onCheckedChange={setCopyPerformance}
            />
            <Label htmlFor="copyPerf" className="cursor-pointer text-sm">
              להעתיק גם ביצועים (משקלים/חזרות)
            </Label>
          </div>

          <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-sm">
            <p className="text-blue-800">
              יועתק: מבנה האימון, תרגילים, מספר סטים והערות
            </p>
            {!copyPerformance && (
              <p className="text-blue-600 mt-1">
                ⓘ ביצועים (משקלים/חזרות) לא יועתקו
              </p>
            )}
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
            disabled={copyMutation.isPending || !targetDate || (mode === 'trainee' && !selectedTrainee)}
            className="flex-1 bg-blue-600 hover:bg-blue-700"
          >
            {copyMutation.isPending ? (
              <>
                <Loader2 className="w-4 h-4 ml-2 animate-spin" />
                {mode === 'trainee' ? 'שולח...' : 'מעתיק...'}
              </>
            ) : (
              <>
                {mode === 'trainee' ? <Send className="w-4 h-4 ml-2" /> : <Copy className="w-4 h-4 ml-2" />}
                {mode === 'trainee' ? 'שלח למתאמן' : 'העתק אימון'}
              </>
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}