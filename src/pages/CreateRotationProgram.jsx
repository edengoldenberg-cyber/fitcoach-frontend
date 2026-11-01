/**
 * CreateRotationProgram — redirects to CoachTrainingPrograms.
 *
 * The rotation program system (RotationProgram, RotationAssignment, etc.) was
 * never implemented at the database level — those entities were absent from the
 * Prisma schema and entity map so every API call silently failed with 400 errors.
 * CoachTrainingPrograms is the working replacement for personalized program building.
 */
import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { createPageUrl } from '@/utils';

export default function CreateRotationProgram() {
  const navigate = useNavigate();
  useEffect(() => {
    navigate(createPageUrl('CoachTrainingPrograms'), { replace: true });
  }, [navigate]);
  return null;
}
