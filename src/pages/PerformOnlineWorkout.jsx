/**
 * PerformOnlineWorkout — stub; replaced by TraineeGroupWorkouts (Open Gym execution).
 */
import React, { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { createPageUrl } from '@/utils';

export default function PerformOnlineWorkout() {
  const navigate = useNavigate();
  useEffect(() => {
    navigate(createPageUrl('TraineeGroupWorkouts'), { replace: true });
  }, [navigate]);
  return null;
}
