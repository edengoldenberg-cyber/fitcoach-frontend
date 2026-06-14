import { startOfWeek, endOfWeek, eachDayOfInterval, format } from 'date-fns';

function getIsraelDateString(date = new Date()) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Jerusalem',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).format(date);
}

export function calculateWeeklyCompliance(meals, water, workouts, measurements, trainee, weekDate = new Date()) {
  const weekStart = startOfWeek(weekDate, { weekStartsOn: 0 });
  const weekEnd = endOfWeek(weekDate, { weekStartsOn: 0 });
  const daysInWeek = eachDayOfInterval({ start: weekStart, end: weekEnd });

  // Nutrition compliance
  let nutritionDays = 0;
  daysInWeek.forEach(day => {
    const dayStr = getIsraelDateString(day);
    const dayMeals = meals.filter(m => m.date === dayStr);
    if (dayMeals.length >= 2) nutritionDays++; // At least 2 meals reported
  });
  const nutritionScore = (nutritionDays / 7) * 100;

  // Water compliance
  let waterDays = 0;
  const waterTarget = trainee?.target_water_ml || 3000;
  daysInWeek.forEach(day => {
    const dayStr = getIsraelDateString(day);
    const dayWater = water.filter(w => w.date === dayStr);
    const total = dayWater.reduce((sum, w) => sum + (w.amount_ml || 0), 0);
    if (total >= waterTarget * 0.8) waterDays++; // 80% of target
  });
  const waterScore = (waterDays / 7) * 100;

  // Workout compliance (expect 3-4 per week)
  const weekWorkouts = workouts.filter(w => {
    const date = new Date(w.date);
    return date >= weekStart && date <= weekEnd;
  });
  const workoutScore = Math.min((weekWorkouts.length / 3) * 100, 100);

  // Measurements compliance (at least 1 per week)
  const weekMeasurements = measurements.filter(m => {
    const date = new Date(m.date);
    return date >= weekStart && date <= weekEnd;
  });
  const measurementScore = weekMeasurements.length > 0 ? 100 : 0;

  // Weighted average
  const totalScore = Math.round(
    (nutritionScore * 0.4) + 
    (waterScore * 0.3) + 
    (workoutScore * 0.2) + 
    (measurementScore * 0.1)
  );

  const status = totalScore >= 80 ? 'good' : totalScore >= 50 ? 'partial' : 'bad';
  const color = status === 'good' ? 'emerald' : status === 'partial' ? 'amber' : 'red';

  // Generate explanation
  let explanation = '';
  const parts = [];
  if (nutritionScore >= 70) parts.push('תזונה מצוינת');
  else if (nutritionScore >= 40) parts.push('תזונה חלקית');
  else parts.push('חסרה תזונה');
  
  if (waterScore >= 70) parts.push('מים מצוין');
  else if (waterScore >= 40) parts.push('מים חלקי');
  else parts.push('חסרים מים');
  
  if (workoutScore >= 70) parts.push('אימונים טובים');
  else if (workoutScore > 0) parts.push('חסרים אימונים');
  
  explanation = `${totalScore}% – ${parts.join(', ')}.`;

  return {
    totalScore,
    status,
    color,
    breakdown: {
      nutrition: Math.round(nutritionScore),
      water: Math.round(waterScore),
      workout: Math.round(workoutScore),
      measurement: Math.round(measurementScore)
    },
    explanation
  };
}

export function getDailyStatus(meals, water, workouts, trainee, date = new Date()) {
  const dateStr = getIsraelDateString(date);
  
  const dayMeals = meals.filter(m => m.date === dateStr);
  const dayWater = water.filter(w => w.date === dateStr);
  const dayWorkouts = workouts.filter(w => w.date === dateStr);

  const totalCalories = dayMeals.reduce((sum, m) => sum + (m.calories || 0), 0);
  const totalWater = dayWater.reduce((sum, w) => sum + (w.amount_ml || 0), 0);

  const calorieTarget = trainee?.target_calories || 2000;
  const waterTarget = trainee?.target_water_ml || 3000;

  let score = 0;
  const reasons = [];

  // Check nutrition
  if (totalCalories >= calorieTarget * 0.8 && totalCalories <= calorieTarget * 1.2) {
    score += 40;
    reasons.push('תזונה טובה');
  } else if (totalCalories >= calorieTarget * 0.5) {
    score += 20;
    reasons.push('תזונה חלקית');
  } else if (dayMeals.length === 0) {
    reasons.push('לא מולאה תזונה');
  } else {
    reasons.push('תזונה חסרה');
  }

  // Check water
  if (totalWater >= waterTarget * 0.8) {
    score += 30;
    reasons.push('שתיית מים מצוינת');
  } else if (totalWater >= waterTarget * 0.5) {
    score += 15;
    reasons.push('מים חלקי');
  } else {
    reasons.push('מים חסרים');
  }

  // Check workout
  if (dayWorkouts.length > 0) {
    score += 30;
    reasons.push('אימון בוצע');
  }

  const status = score >= 70 ? 'good' : score >= 40 ? 'partial' : 'bad';
  const color = status === 'good' ? 'emerald' : status === 'partial' ? 'amber' : 'red';
  const emoji = status === 'good' ? '🟢' : status === 'partial' ? '🟠' : '🔴';
  
  let message = '';
  if (status === 'good') {
    message = `יום ${emoji} מעולה! ${reasons.filter(r => !r.includes('חסר')).join(', ')}`;
  } else if (status === 'partial') {
    message = `יום ${emoji} סביר - ${reasons.join(', ')}`;
  } else {
    message = `יום ${emoji} חלש - ${reasons.join(', ')}`;
  }

  return { status, color, message, score, emoji };
}