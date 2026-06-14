import React, { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { AlertCircle, CheckCircle, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

export default function MergeDuplicatesDialog({ open, onClose }) {
  const queryClient = useQueryClient();
  const [report, setReport] = useState(null);

  const mergeMutation = useMutation({
    mutationFn: async () => {
      const response = await base44.functions.invoke('mergeExerciseDuplicates');
      return response.data;
    },
    onSuccess: (data) => {
      setReport(data.report);
      queryClient.invalidateQueries({ queryKey: ['allExercises'] });
      
      if (data.report.exercisesMerged === 0) {
        toast.info('לא נמצאו כפילויות לאיחוד');
      } else {
        toast.success(`✅ אוחדו ${data.report.exercisesMerged} תרגילים כפולים`);
      }
    },
    onError: (err) => {
      toast.error(`❌ שגיאה: ${err.message}`);
      setReport({ step: 'error', error: err.message });
    },
  });

  const handleMerge = () => {
    setReport(null);
    mergeMutation.mutate();
  };

  const handleClose = () => {
    setReport(null);
    mergeMutation.reset();
    onClose();
  };

  const getStepLabel = (step) => {
    switch (step) {
      case 'scanning': return 'סורק תרגילים...';
      case 'grouping': return 'מזהה כפילויות...';
      case 'updating_references': return 'מעדכן התייחסויות...';
      case 'removing_duplicates': return 'מסיר כפילויות...';
      case 'completed': return 'הושלם!';
      case 'error': return 'שגיאה';
      default: return 'מעבד...';
    }
  };

  const getProgress = (step) => {
    switch (step) {
      case 'scanning': return 25;
      case 'grouping': return 50;
      case 'updating_references': return 75;
      case 'removing_duplicates': return 90;
      case 'completed': return 100;
      default: return 0;
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-md" dir="rtl">
        <DialogHeader>
          <DialogTitle>איחוד תרגילים כפולים</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {!mergeMutation.isPending && !report && (
            <div className="space-y-4">
              <p className="text-sm text-slate-600">
                הכלי יאתר תרגילים כפולים לפי שם, קבוצת שריר וציוד, ויאחד אותם לתרגיל אחד.
              </p>
              <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3">
                <div className="flex gap-2">
                  <AlertCircle className="w-5 h-5 text-yellow-600 flex-shrink-0 mt-0.5" />
                  <div className="text-sm text-yellow-800">
                    <p className="font-medium mb-1">שים לב:</p>
                    <ul className="list-disc list-inside space-y-1">
                      <li>תרגילים עם ציוד שונה לא יאוחדו</li>
                      <li>כל ההפניות לתרגילים כפולים יעודכנו אוטומטית</li>
                      <li>הפעולה בטוחה ולא תשבש נתונים קיימים</li>
                    </ul>
                  </div>
                </div>
              </div>
              <Button 
                onClick={handleMerge}
                className="w-full bg-teal-600 hover:bg-teal-700"
              >
                התחל איחוד
              </Button>
            </div>
          )}

          {mergeMutation.isPending && (
            <div className="space-y-4">
              <div className="flex items-center gap-3">
                <Loader2 className="w-5 h-5 animate-spin text-teal-600" />
                <span className="font-medium">{getStepLabel(report?.step || 'scanning')}</span>
              </div>
              <Progress value={getProgress(report?.step || 'scanning')} className="h-2" />
              <p className="text-xs text-slate-500 text-center">
                אנא המתן, זה עשוי לקחת מספר שניות...
              </p>
            </div>
          )}

          {report && report.step === 'completed' && (
            <div className="space-y-4">
              <div className="flex items-center gap-2 text-green-600">
                <CheckCircle className="w-5 h-5" />
                <span className="font-bold">האיחוד הושלם בהצלחה!</span>
              </div>

              <div className="bg-slate-50 rounded-lg p-4 space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-slate-600">סה"כ תרגילים שנסרקו:</span>
                  <span className="font-bold">{report.totalExercises}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-600">קבוצות כפילויות שנמצאו:</span>
                  <span className="font-bold">{report.duplicateGroups}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-600">תרגילים שאוחדו (הוסרו):</span>
                  <span className="font-bold text-teal-600">{report.exercisesMerged}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-600">סה"כ תרגילים לאחר איחוד:</span>
                  <span className="font-bold">{report.finalCount}</span>
                </div>
                <div className="flex justify-between pt-2 border-t">
                  <span className="text-slate-600">משך זמן:</span>
                  <span className="font-medium">{(report.duration / 1000).toFixed(1)} שניות</span>
                </div>
              </div>

              {report.errors && report.errors.length > 0 && (
                <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3">
                  <p className="text-sm font-medium text-yellow-800 mb-2">
                    שגיאות ({report.errors.length}):
                  </p>
                  <div className="space-y-1 text-xs text-yellow-700">
                    {report.errors.slice(0, 3).map((err, idx) => (
                      <p key={idx}>• {err.group}: {err.error}</p>
                    ))}
                  </div>
                </div>
              )}

              <Button onClick={handleClose} className="w-full">
                סגור
              </Button>
            </div>
          )}

          {report && report.step === 'error' && (
            <div className="space-y-4">
              <div className="flex items-center gap-2 text-red-600">
                <AlertCircle className="w-5 h-5" />
                <span className="font-bold">אירעה שגיאה</span>
              </div>
              <p className="text-sm text-slate-600">{report.error}</p>
              <Button onClick={handleClose} variant="outline" className="w-full">
                סגור
              </Button>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}