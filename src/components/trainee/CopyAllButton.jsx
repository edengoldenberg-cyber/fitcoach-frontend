import React from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Copy, CheckCircle, XCircle, AlertCircle } from 'lucide-react';
import { toast } from 'sonner';

export default function CopyAllButton({ dailyWorkoutId, targetDate, disabled }) {
  const queryClient = useQueryClient();
  const [showSummary, setShowSummary] = React.useState(false);
  const [summary, setSummary] = React.useState(null);

  const copyAllMutation = useMutation({
    mutationFn: async () => {
      const response = await base44.functions.invoke('copyAllExercises', {
        daily_workout_id: dailyWorkoutId,
        target_date: targetDate
      });

      if (!response.data?.ok) {
        throw new Error(response.data?.error || 'שגיאה בהעתקת האימון');
      }

      return response.data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['myTraineeWorkouts'] });
      queryClient.invalidateQueries({ queryKey: ['myTraineeExercises'] });
      queryClient.invalidateQueries({ queryKey: ['myWorkouts'] });
      
      setSummary(data.summary);
      setShowSummary(true);
      
      if (data.summary.failed === 0 && data.summary.skipped === 0) {
        toast.success(`✅ הועתקו ${data.summary.added} תרגילים בהצלחה`);
      }
    },
    onError: (error) => {
      toast.error(error.message || 'שגיאה בהעתקת האימון');
    }
  });

  return (
    <>
      <Button
        onClick={() => copyAllMutation.mutate()}
        disabled={disabled || copyAllMutation.isPending}
        className="w-full bg-orange-500 hover:bg-orange-600"
      >
        {copyAllMutation.isPending ? (
          <>
            <div className="w-4 h-4 ml-2 border-2 border-white border-t-transparent rounded-full animate-spin" />
            מעתיק את כל התרגילים...
          </>
        ) : (
          <>
            <Copy className="w-4 h-4 ml-2" />
            📋 העתק את כל האימון
          </>
        )}
      </Button>

      {/* Summary Dialog */}
      <Dialog open={showSummary} onOpenChange={setShowSummary}>
        <DialogContent dir="rtl" className="max-w-md">
          <DialogHeader>
            <DialogTitle>סיכום העתקה</DialogTitle>
          </DialogHeader>
          
          {summary && (
            <div className="space-y-4">
              {/* Summary Stats */}
              <div className="grid grid-cols-3 gap-3">
                <div className="p-3 bg-green-50 rounded-lg text-center">
                  <CheckCircle className="w-5 h-5 text-green-600 mx-auto mb-1" />
                  <div className="text-2xl font-bold text-green-600">{summary.added}</div>
                  <div className="text-xs text-green-700">נוספו</div>
                </div>
                <div className="p-3 bg-blue-50 rounded-lg text-center">
                  <AlertCircle className="w-5 h-5 text-blue-600 mx-auto mb-1" />
                  <div className="text-2xl font-bold text-blue-600">{summary.skipped}</div>
                  <div className="text-xs text-blue-700">דולגו</div>
                </div>
                <div className="p-3 bg-red-50 rounded-lg text-center">
                  <XCircle className="w-5 h-5 text-red-600 mx-auto mb-1" />
                  <div className="text-2xl font-bold text-red-600">{summary.failed}</div>
                  <div className="text-xs text-red-700">נכשלו</div>
                </div>
              </div>

              {/* Skipped Details */}
              {summary.skipped > 0 && summary.skipped_names.length > 0 && (
                <div className="p-3 bg-blue-50 rounded-lg">
                  <div className="font-medium text-blue-800 mb-2">תרגילים שדולגו (כבר קיימים):</div>
                  <div className="text-xs text-blue-700 space-y-1">
                    {summary.skipped_names.map((name, i) => (
                      <div key={i}>• {name}</div>
                    ))}
                  </div>
                </div>
              )}

              {/* Failed Details */}
              {summary.failed > 0 && summary.failed_details.length > 0 && (
                <div className="p-3 bg-red-50 rounded-lg">
                  <div className="font-medium text-red-800 mb-2">תרגילים שנכשלו:</div>
                  <div className="text-xs text-red-700 space-y-2">
                    {summary.failed_details.map((item, i) => (
                      <div key={i}>
                        <div className="font-medium">• {item.name}</div>
                        <div className="text-red-600">שגיאה: {item.error}</div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <Button 
                onClick={() => setShowSummary(false)}
                className="w-full"
              >
                סגור
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}