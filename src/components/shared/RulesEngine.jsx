import { subDays, format } from 'date-fns';
import { calculateWeeklyCompliance } from './ComplianceCalculator';

export async function runRulesEngine(trainee, meals, water, workouts, measurements, base44) {
  const insights = [];
  const today = new Date();

  // Rule 1: Low protein 3 days in a row
  const last3Days = [0, 1, 2].map(i => format(subDays(today, i), 'yyyy-MM-dd'));
  let lowProteinDays = 0;
  last3Days.forEach(day => {
    const dayMeals = meals.filter(m => m.date === day);
    const totalProtein = dayMeals.reduce((sum, m) => sum + (m.protein || 0), 0);
    if (totalProtein < (trainee.target_protein || 150) * 0.7) lowProteinDays++;
  });
  if (lowProteinDays >= 3) {
    insights.push({
      trainee_email: trainee.user_email,
      insight_type: 'low_protein',
      severity: 'medium',
      message: `חלבון נמוך 3 ימים רצוף - ממוצע ${Math.round(meals.slice(-10).reduce((sum, m) => sum + (m.protein || 0), 0) / 10)}ג׳ ביום`
    });
  }

  // Rule 2: Weight plateau (10 days, same weight)
  const last10Measurements = measurements
    .sort((a, b) => new Date(b.date) - new Date(a.date))
    .slice(0, 10);
  if (last10Measurements.length >= 3) {
    const weights = last10Measurements.map(m => m.weight_kg).filter(w => w);
    if (weights.length >= 3) {
      const maxDiff = Math.max(...weights) - Math.min(...weights);
      if (maxDiff < 0.5) {
        insights.push({
          trainee_email: trainee.user_email,
          insight_type: 'plateau',
          severity: 'medium',
          message: `משקל לא משתנה ${last10Measurements.length} מדידות - ${weights[0]}ק״ג`
        });
      }
    }
  }

  // Rule 3: No reporting for 7 days
  const last7Days = [0, 1, 2, 3, 4, 5, 6].map(i => format(subDays(today, i), 'yyyy-MM-dd'));
  const recentMeals = meals.filter(m => last7Days.includes(m.date));
  if (recentMeals.length < 5) {
    insights.push({
      trainee_email: trainee.user_email,
      insight_type: 'no_reporting',
      severity: 'high',
      message: `מילוי חלקי מאוד - רק ${recentMeals.length} ארוחות ב-7 ימים`
    });
  }

  // Rule 4: Low compliance score
  const compliance = calculateWeeklyCompliance(meals, water, workouts, measurements, trainee);
  if (compliance.totalScore < 50) {
    insights.push({
      trainee_email: trainee.user_email,
      insight_type: 'low_compliance',
      severity: 'high',
      message: `ציון התמדה נמוך: ${compliance.totalScore}% - דורש תשומת לב`
    });
  }

  // Rule 5: Workout stagnation (same weights 4 times)
  const recentWorkouts = workouts.slice(-4);
  if (recentWorkouts.length === 4) {
    const exerciseMap = {};
    recentWorkouts.forEach(w => {
      w.exercises?.forEach(ex => {
        if (!exerciseMap[ex.exercise_name]) exerciseMap[ex.exercise_name] = [];
        const maxWeight = Math.max(...(ex.sets?.map(s => s.weight) || [0]));
        exerciseMap[ex.exercise_name].push(maxWeight);
      });
    });
    
    Object.entries(exerciseMap).forEach(([name, weights]) => {
      if (weights.length >= 4 && weights.every(w => w === weights[0] && w > 0)) {
        insights.push({
          trainee_email: trainee.user_email,
          insight_type: 'workout_stagnation',
          severity: 'low',
          message: `תקיעות ב${name} - ${weights[0]}ק״ג 4 אימונים`
        });
      }
    });
  }

  // Save insights
  for (const insight of insights) {
    try {
      await base44.entities.CoachInsight.create(insight);
    } catch (err) {
      console.error('Failed to save insight:', err);
    }
  }

  return insights;
}