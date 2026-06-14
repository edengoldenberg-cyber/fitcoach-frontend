import React from 'react';
import { useMutation, useQueryClient, useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Plus, Check } from 'lucide-react';
import { toast } from 'sonner';
import CopyProgressModal from './CopyProgressModal';

export default function ExerciseLineButton({ exercise, dailyWorkoutId, targetDate, isAdded }) {
  const queryClient = useQueryClient();
  const [pending, setPending] = React.useState(false);
  const [showProgressModal, setShowProgressModal] = React.useState(false);
  const [copyReport, setCopyReport] = React.useState(null);

  const { data: user } = useQuery({
    queryKey: ['currentUser'],
    queryFn: () => base44.auth.me(),
  });

  const isAdmin = user?.role === 'admin';

  const addMutation = useMutation({
    mutationFn: async () => {
      // Show progress modal immediately
      setShowProgressModal(true);
      
      const payload = {
        dailyWorkoutId,
        exercise,
        targetDate
      };

      const response = await base44.functions.invoke('copyExerciseToTrainee', payload);
      
      const report = response.data;
      setCopyReport(report);

      if (!report.ok && !report.skipped) {
        throw new Error(report.error?.message || 'שגיאה בהעתקת התרגיל');
      }

      return report;
    },
    onSuccess: (report) => {
      console.log('✅ Exercise added successfully:', exercise.exercise_name);
      queryClient.invalidateQueries({ queryKey: ['myTraineeWorkouts'] });
      queryClient.invalidateQueries({ queryKey: ['myTraineeExercises'] });
      
      if (report.skipped) {
        toast.success(`✅ ${exercise.exercise_name} כבר קיים באימון`, { id: 'exercise-action' });
      } else {
        toast.success(`✅ ${exercise.exercise_name} נוסף לאימון בתאריך ${targetDate}`, { id: 'exercise-action' });
      }
      
      // Auto-close modal after 2s on success
      setTimeout(() => {
        setShowProgressModal(false);
      }, 2000);
    },
    onError: (error) => {
      console.error('❌ Add mutation error:', error);
      toast.error(`❌ לא הצלחנו להוסיף תרגיל`, { id: 'exercise-action' });
      // Modal stays open to show error details
    }
  });

  const removeMutation = useMutation({
    mutationFn: async () => {
      const response = await base44.functions.invoke('removeExerciseLine', {
        exercise_name: exercise.exercise_name,
        target_date: targetDate
      });

      if (!response.data?.ok) {
        throw new Error(response.data?.error || 'שגיאה בהסרה');
      }

      return response.data;
    },
    onSuccess: () => {
      console.log('✅ Exercise removed successfully:', exercise.exercise_name);
      queryClient.invalidateQueries({ queryKey: ['myTraineeWorkouts'] });
      queryClient.invalidateQueries({ queryKey: ['myTraineeExercises'] });
      toast.success(`🗑️ ${exercise.exercise_name} הוסר מהאימון`, { id: 'exercise-action' });
    },
    onError: (error) => {
      console.error('❌ Remove mutation error:', error);
      toast.error(`❌ ${error.message || 'שגיאה בהסרת התרגיל'}`, { id: 'exercise-action' });
    }
  });

  const handleClick = async () => {
    console.log('🔘 CLICK +', { 
      exercise: exercise?.exercise_name, 
      dailyWorkoutId, 
      targetDate,
      userEmail: user?.email 
    });

    if (pending) {
      console.warn('⏳ Already pending, ignoring click');
      return;
    }

    // Hard pre-validation
    if (!exercise?.exercise_name) {
      toast.error('❌ שגיאה: אין שם תרגיל');
      console.error('❌ Missing exercise name');
      return;
    }

    if (!user?.email) {
      toast.error('❌ שגיאה: משתמש לא מחובר');
      console.error('❌ User not authenticated');
      return;
    }

    if (!targetDate) {
      toast.error('❌ שגיאה: אין תאריך נבחר');
      console.error('❌ Missing target date');
      return;
    }

    if (!dailyWorkoutId) {
      toast.error('❌ שגיאה: אין מזהה אימון יומי');
      console.error('❌ Missing daily workout ID');
      return;
    }

    // Show immediate feedback
    toast.loading(isAdded ? 'מסיר תרגיל...' : 'מוסיף תרגיל...', { id: 'exercise-action' });
    
    setPending(true);
    try {
      if (isAdded) {
        await removeMutation.mutateAsync();
      } else {
        await addMutation.mutateAsync();
      }
    } catch (error) {
      console.error('❌ Exercise action failed:', error);
      toast.error(`❌ שגיאה: ${error.message || 'פעולה נכשלה'}`, { id: 'exercise-action' });
    } finally {
      setTimeout(() => setPending(false), 500);
    }
  };

  if (isAdded) {
    return (
      <Button
        size="sm"
        variant="outline"
        onClick={handleClick}
        disabled={pending || removeMutation.isPending}
        className="text-green-600 border-green-300 hover:bg-green-50"
      >
        {pending || removeMutation.isPending ? (
          <div className="w-3 h-3 border-2 border-green-600 border-t-transparent rounded-full animate-spin" />
        ) : (
          <>
            <Check className="w-3 h-3 ml-1" />
            נוסף
          </>
        )}
      </Button>
    );
  }

  return (
    <>
      {isAdded ? (
        <Button
          size="sm"
          variant="outline"
          onClick={handleClick}
          disabled={pending || removeMutation.isPending}
          className="text-green-600 border-green-300 hover:bg-green-50"
        >
          {pending || removeMutation.isPending ? (
            <div className="w-3 h-3 border-2 border-green-600 border-t-transparent rounded-full animate-spin" />
          ) : (
            <>
              <Check className="w-3 h-3 ml-1" />
              נוסף
            </>
          )}
        </Button>
      ) : (
        <Button
          size="sm"
          variant="outline"
          onClick={handleClick}
          disabled={pending || addMutation.isPending}
          className="text-orange-600 border-orange-300 hover:bg-orange-50"
        >
          {pending || addMutation.isPending ? (
            <div className="w-3 h-3 border-2 border-orange-600 border-t-transparent rounded-full animate-spin" />
          ) : (
            <>
              <Plus className="w-3 h-3 ml-1" />
              הוסף
            </>
          )}
        </Button>
      )}

      <CopyProgressModal 
        open={showProgressModal}
        onClose={() => {
          setShowProgressModal(false);
          setCopyReport(null);
        }}
        copyReport={copyReport}
        isAdmin={isAdmin}
      />
    </>
  );
}