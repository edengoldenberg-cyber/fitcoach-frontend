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

  const { data: trainee, isLoading: traineeLoading } = useQuery({
    queryKey: ['trainee', traineeId],
    queryFn: () => base44.entities.Trainee.get(traineeId),
  });

  const { data: meals = [] } = useQuery({
    queryKey: ['meals', trainee?.user_email],
    queryFn: () => base44.entities.MealEntry.filter({ trainee_email: trainee?.user_email }),
    enabled: !!trainee?.user_email,
  });

  const { data: workouts = [] } = useQuery({
    queryKey: ['workouts', trainee?.user_email],
    queryFn: () => base44.entities.WorkoutSession.filter({ trainee_email: trainee?.user_email }),
    enabled: !!trainee?.user_email,
  });

  if (traineeLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="w-8 h-8 animate-spin text-teal-600" />
      </div>
    );
  }

  if (!trainee) {
    return (
      <div className="p-6 text-center">
        <p className="text-slate-600 mb-4">מתאמן לא נמצא</p>
        <Button onClick={() => navigate(-1)} variant="outline">
          חזור
        </Button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 pb-20">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-white border-b shadow-sm">
        <div className="max-w-6xl mx-auto px-4 py-4 flex items-center gap-3">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => navigate(-1)}
          >
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold text-slate-900">{trainee.full_name}</h1>
            <p className="text-sm text-slate-500">ניתוח למידה מפורט</p>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-6xl mx-auto px-4 py-6">
        <TraineeAdvancedLearningDashboard trainee={trainee} meals={meals} workouts={workouts} />
      </div>
    </div>
  );
}