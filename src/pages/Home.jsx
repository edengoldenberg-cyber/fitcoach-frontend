import React, { useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { useNavigate } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import { Loader2 } from 'lucide-react';

export default function Home() {
  const navigate = useNavigate();

  const { data: user, isLoading: userLoading } = useQuery({
    queryKey: ['currentUser'],
    queryFn: () => base44.auth.me(),
  });

  const { data: traineeProfile, isLoading: traineeLoading } = useQuery({
    queryKey: ['traineeProfile', user?.email],
    queryFn: () => base44.entities.Trainee.filter({ user_email: user?.email }),
    enabled: !!user?.email,
  });

  const { data: coachTrainees, isLoading: coachLoading } = useQuery({
    queryKey: ['coachTrainees', user?.email],
    queryFn: () => base44.entities.Trainee.filter({ coach_email: user?.email }),
    enabled: !!user?.email,
  });

  useEffect(() => {
    if (userLoading || traineeLoading || coachLoading) return;

    // Coach role or has trainees → CoachDashboard
    if (user?.role === 'coach' || user?.role === 'admin' || (coachTrainees && coachTrainees.length > 0)) {
      navigate(createPageUrl('CoachDashboard'));
      return;
    }

    // Check if user is a trainee
    if (traineeProfile && traineeProfile.length > 0) {
      navigate(createPageUrl('TraineeHome'));
      return;
    }

    // Default to trainee home for new users
    navigate(createPageUrl('TraineeHome'));
  }, [user, traineeProfile, coachTrainees, userLoading, traineeLoading, coachLoading, navigate]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 flex items-center justify-center" dir="rtl">
      <div className="text-center">
        <Loader2 className="w-10 h-10 animate-spin text-emerald-500 mx-auto mb-4" />
        <p className="text-slate-500">טוען...</p>
      </div>
    </div>
  );
}