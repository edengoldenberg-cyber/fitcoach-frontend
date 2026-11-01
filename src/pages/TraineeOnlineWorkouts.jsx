/**
 * TraineeOnlineWorkouts — stub; replaced by TraineeGroupWorkouts (Open Gym).
 */
import React, { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { createPageUrl } from '@/utils';

export default function TraineeOnlineWorkouts() {
  const navigate = useNavigate();
  useEffect(() => {
    navigate(createPageUrl('TraineeGroupWorkouts'), { replace: true });
  }, [navigate]);
  return null;
}
