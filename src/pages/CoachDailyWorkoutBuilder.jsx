import React, { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { createPageUrl } from '@/utils';

// This page was replaced by CoachGroupWorkouts which uses the proper
// GroupWorkoutSession entity. Redirect to avoid broken DailyWorkoutGroup calls.
export default function CoachDailyWorkoutBuilder() {
  const navigate = useNavigate();
  useEffect(() => {
    navigate(createPageUrl('CoachGroupWorkouts'), { replace: true });
  }, [navigate]);
  return null;
}
