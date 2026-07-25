import React from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { ArrowLeft, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import TraineeAdvancedLearningDashboard from '../components/coach/TraineeAdvancedLearningDashboard';

export default function TraineeLearningAnalytics() {
  const { traineeId } = useParams();
  const navigate = useNavigate();

  const {
    data: trainee,
    isLoading: traineeLoading,
    isError: traineeError,
    error: traineeErr,
  } = useQuery({
    queryKey: ['trainee', traineeId],
    queryFn: () => base44.entities.Trainee.get(traineeId),
    retry: 1,
  });

  const {
    data: meals = [],
    isLoading: mealsLoading,
    isError: mealsError,
    error: mealsErr,
  } = useQuery({
    queryKey: ['analytics-meals', trainee?.user_email],
    queryFn: () => base44.entities.MealEntry.filter({ trainee_email: trainee.user_email }),
    enabled: !!trainee?.user_email,
    retry: 1,
  });

  const {
    data: workouts = [],
    isLoading: workoutsLoading,
    isError: workoutsError,
    error: workoutsErr,
  } = useQuery({
    queryKey: ['analytics-workouts', trainee?.user_email],
    queryFn: () => base44.entities.WorkoutSession.filter({ trainee_email: trainee.user_email }),
    enabled: !!trainee?.user_email,
    retry: 1,
  });

  const isDataLoading = traineeLoading || mealsLoading || workoutsLoading;
  const isDataError   = traineeError  || mealsError  || workoutsError;
  const firstError    = traineeErr    || mealsErr    || workoutsErr;

  // Trainee fetch failed or returned nothing — show a hard error, not "no data".
  if (!traineeLoading && (traineeError || (!trainee && !traineeLoading))) {
    return (
      <div className="p-6 text-center" dir="rtl">
        <p className="text-red-600 font-semibold mb-2">
          {traineeError ? `שגיאה בטעינת פרטי המתאמן: ${traineeErr?.message}` : 'מתאמן לא נמצא'}
        </p>
        <Button onClick={() => navigate(-1)} variant="outline">חזור</Button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 pb-20">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-white border-b shadow-sm">
        <div className="max-w-6xl mx-auto px-4 py-4 flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <div>
            {traineeLoading ? (
              <div className="flex items-center gap-2">
                <Loader2 className="w-4 h-4 animate-spin text-slate-400" />
                <span className="text-slate-400 text-sm">טוען...</span>
              </div>
            ) : (
              <>
                <h1 className="text-2xl font-bold text-slate-900">{trainee?.full_name}</h1>
                <p className="text-sm text-slate-500">ניתוח למידה מפורט</p>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Main content */}
      <div className="max-w-6xl mx-auto px-4 py-6">
        <TraineeAdvancedLearningDashboard
          trainee={trainee}
          meals={meals}
          workouts={workouts}
          isLoading={isDataLoading}
          isError={isDataError}
          error={firstError}
        />
      </div>
    </div>
  );
}
