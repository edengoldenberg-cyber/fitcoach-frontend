import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';

/**
 * Canonical nutrition targets hook.
 * Reads directly from Trainee.target_calories/protein/carbs/fat —
 * the single source of truth written by EditPersonalInfo, NutritionQuestionnaireDialog,
 * and MealPlanWizard.
 */
export function useNutritionTargets(traineeEmail) {
  return useQuery({
    queryKey: ['nutritionTargets', traineeEmail],
    queryFn: async () => {
      if (!traineeEmail) return null;
      try {
        const trainees = await base44.entities.Trainee.filter({ user_email: traineeEmail });
        const trainee = trainees?.[0];
        if (!trainee?.target_calories) return null;
        return {
          daily_calories:  trainee.target_calories,
          daily_protein_g: trainee.target_protein,
          daily_carbs_g:   trainee.target_carbs,
          daily_fat_g:     trainee.target_fat,
          daily_water_ml:  trainee.target_water_ml || trainee.water_target_ml || 2500,
          source: 'trainee_profile',
          missing_questionnaire: false,
        };
      } catch (err) {
        console.error('[useNutritionTargets] Error fetching trainee:', err);
        return null;
      }
    },
    enabled: !!traineeEmail,
    staleTime: 5 * 60 * 1000,
  });
}

/**
 * Get targets with fallback to trainee profile defaults.
 * Water defaults: male=3000ml, female=2000ml.
 */
export function getNutritionTargetsWithFallback(targets, trainee) {
  if (!targets) {
    const waterDefault = trainee?.gender === 'male' ? 3000 : 2000;
    return {
      daily_calories:  trainee?.target_calories  || 2000,
      daily_protein_g: trainee?.target_protein   || 150,
      daily_carbs_g:   trainee?.target_carbs     || 200,
      daily_fat_g:     trainee?.target_fat       || 70,
      daily_water_ml:  trainee?.target_water_ml || trainee?.water_target_ml || waterDefault,
      source: 'default',
      missing_questionnaire: true,
    };
  }
  return {
    daily_calories:  targets.daily_calories,
    daily_protein_g: targets.daily_protein_g,
    daily_carbs_g:   targets.daily_carbs_g,
    daily_fat_g:     targets.daily_fat_g,
    daily_water_ml:  targets.daily_water_ml,
    source: targets.source || 'trainee_profile',
    missing_questionnaire: false,
  };
}
