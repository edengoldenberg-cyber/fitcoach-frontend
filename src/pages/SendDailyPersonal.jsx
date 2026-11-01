/**
 * SendDailyPersonal — redirects to CoachTrainingPrograms.
 *
 * This page used RotationProgram, RotationCategory, RotationCategoryExercise,
 * RotationAssignment, RotationSessionInstance, and RotationExerciseLog — all of
 * which were absent from the Prisma schema and entity map. Every API call would
 * have failed with "Unknown entity" (HTTP 400). The feature was never operational.
 *
 * CoachTrainingPrograms is the working replacement for assigning personal programs.
 */
import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { createPageUrl } from '@/utils';

export default function SendDailyPersonal() {
  const navigate = useNavigate();
  useEffect(() => {
    navigate(createPageUrl('CoachTrainingPrograms'), { replace: true });
  }, [navigate]);
  return null;
}
