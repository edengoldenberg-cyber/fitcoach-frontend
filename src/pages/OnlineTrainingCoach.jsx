/**
 * OnlineTrainingCoach — stub pending Phase 5 (CoachTrainingPrograms).
 */
import React, { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { createPageUrl } from '@/utils';

export default function OnlineTrainingCoach() {
  const navigate = useNavigate();
  useEffect(() => {
    navigate(createPageUrl('CoachTrainingPrograms'), { replace: true });
  }, [navigate]);
  return null;
}
