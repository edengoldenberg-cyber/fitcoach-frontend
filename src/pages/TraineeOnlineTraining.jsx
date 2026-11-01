/**
 * TraineeOnlineTraining — placeholder while Phase 5 (TrainingPrograms) is being built.
 * The old implementation used non-existent entities and is replaced.
 */
import React from 'react';
import { useNavigate } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import { Button } from '@/components/ui/button';
import { Dumbbell } from 'lucide-react';

export default function TraineeOnlineTraining() {
  const navigate = useNavigate();
  return (
    <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center gap-4 p-6 text-center" dir="rtl">
      <Dumbbell className="w-12 h-12 text-orange-400" />
      <h2 className="text-xl font-bold text-slate-800">אימונים אישיים</h2>
      <p className="text-slate-500 max-w-xs">
        המאמן שלך עדיין לא שלח לך תוכנית אימונים אישית. כשיהיה לך תוכנית, היא תופיע כאן.
      </p>
      <Button variant="outline" onClick={() => navigate(createPageUrl('TraineeGroupWorkouts'))}>
        עבור לאימוני סטודיו
      </Button>
    </div>
  );
}
