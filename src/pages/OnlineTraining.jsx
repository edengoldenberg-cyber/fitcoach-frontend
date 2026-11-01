/**
 * OnlineTraining — coach-side stub; redirects to CoachGroupWorkouts.
 */
import React, { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { createPageUrl } from '@/utils';

export default function OnlineTraining() {
  const navigate = useNavigate();
  useEffect(() => {
    navigate(createPageUrl('CoachGroupWorkouts'), { replace: true });
  }, [navigate]);
  return null;
}
