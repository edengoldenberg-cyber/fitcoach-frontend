import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useMutation } from '@tanstack/react-query';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { toast } from 'sonner';

export default function WorkoutFeedbackModal({
  open,
  onClose,
  workoutGroup,
  selectedWorkout,
  startTime,
  traineeId
}) {
  const [rpe, setRpe] = useState(5);
  const [completed, setCompleted] = useState(true);
  const [notes, setNotes] = useState('');
  const [painDiscomfort, setPainDiscomfort] = useState(false);
  const [painNotes, setPainNotes] = useState('');

  const submitFeedbackMutation = useMutation({
    mutationFn: async () => {
      const result = await base44.functions.invoke('submitWorkoutFeedback', {
        date: workoutGroup.date,
        daily_workout_group_id: workoutGroup.id,
        selected_option_id: selectedWorkout.id,
        selected_option_title: selectedWorkout.title,
        planned_effort_score: selectedWorkout.effort_score,
        actual_rpe: rpe,
        completed: completed,
        completion_notes: notes,
        pain_discomfort: painDiscomfort,
        pain_notes: painNotes,
        start_time: startTime,
        end_time: new Date().toISOString()
      });
      return result;
    },
    onSuccess: () => {
      toast.success('תודה על ההחזר. נקלט! 💪');
      onClose();
    },
    onError: (err) => {
      toast.error('שגיאה בשמירת ההחזר');
      console.error('Feedback submit failed:', err);
    }
  });

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-md" dir="rtl">
        <DialogHeader>
          <DialogTitle>איך היה האימון?</DialogTitle>
          <DialogDescription>
            {selectedWorkout?.title}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* RPE */}
          <div>
            <Label className="text-base font-semibold mb-3 block">
              RPE (עוצמה מתחושה) - {rpe}
            </Label>
            <Slider
              min={1}
              max={10}
              step={1}
              value={[rpe]}
              onValueChange={(val) => setRpe(val[0])}
              className="w-full"
            />
            <div className="flex justify-between text-xs text-slate-500 mt-2">
              <span>קל</span>
              <span>קשה מאוד</span>
            </div>
          </div>

          {/* Completed */}
          <div className="flex items-center gap-3">
            <Checkbox
              id="completed"
              checked={completed}
              onCheckedChange={setCompleted}
            />
            <Label htmlFor="completed" className="cursor-pointer font-medium">
              סיימתי את כל האימון
            </Label>
          </div>

          {/* Notes */}
          <div>
            <Label className="text-sm mb-2 block">הערות (אופציונלי)</Label>
            <Textarea
              placeholder="איך הרגשת? מה היה קשה? מה היה קל?"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="input-premium h-20"
            />
          </div>

          {/* Pain */}
          <div className="space-y-2">
            <div className="flex items-center gap-3">
              <Checkbox
                id="pain"
                checked={painDiscomfort}
                onCheckedChange={setPainDiscomfort}
              />
              <Label htmlFor="pain" className="cursor-pointer font-medium">
                חוויתי כאב או אי נוחות
              </Label>
            </div>

            {painDiscomfort && (
              <Textarea
                placeholder="איפה, איזה סוג כאב, מתי התחיל?"
                value={painNotes}
                onChange={(e) => setPainNotes(e.target.value)}
                className="input-premium h-16 mr-6"
              />
            )}
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button
            variant="outline"
            onClick={onClose}
            disabled={submitFeedbackMutation.isPending}
          >
            ביטול
          </Button>
          <Button
            className="btn-primary"
            onClick={() => submitFeedbackMutation.mutate()}
            disabled={submitFeedbackMutation.isPending}
          >
            {submitFeedbackMutation.isPending ? 'שומר...' : 'שלח'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}