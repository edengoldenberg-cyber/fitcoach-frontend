/**
 * CALCULATE WORKOUT EFFORT SCORE
 *
 * Auto-calculate effort score 1-10 based on:
 * - Duration
 * - Number of exercises/rounds
 * - Work/rest ratio
 * - Exercise complexity
 * - Cardio component
 * - Weights/load
 * - Target level
 */

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

function calculateEffortScore(workout) {
  try {
    let score = 0;

    // 1. Duration factor (0-3)
    const duration = workout.duration_minutes || 30;
    if (duration <= 20) score += 1;
    else if (duration <= 40) score += 2;
    else score += 3;

    // 2. Exercise count / density (0-2)
    const exerciseCount = (workout.exercises || []).length;
    if (exerciseCount <= 5) score += 0.5;
    else if (exerciseCount <= 10) score += 1;
    else score += 2;

    // 3. Cardio / intensity component (0-2)
    const description = (workout.notes || '').toLowerCase();
    const hasCardio = description.includes('cardio') || description.includes('running') || description.includes('jumping');
    const isHighIntensity = description.includes('hiit') || description.includes('amrap') || description.includes('emom');

    if (hasCardio) score += 1;
    if (isHighIntensity) score += 1;

    // 4. Load / complexity (0-2)
    const hasWeights = (workout.equipment || []).some(e =>
      e.toLowerCase().includes('dumbbell') || e.toLowerCase().includes('barbell') || e.toLowerCase().includes('kettlebell')
    );
    const isFunctional = workout.type === 'functional';

    if (hasWeights) score += 1;
    if (isFunctional && exerciseCount > 8) score += 1;

    // 5. Level adjustment (multiplier)
    const levelMultipliers = {
      beginner: 0.8,
      intermediate: 1.0,
      advanced: 1.3
    };

    const multiplier = levelMultipliers[workout.level] || 1.0;
    score = score * multiplier;

    // Clamp 1-10
    score = Math.max(1, Math.min(10, Math.round(score * 10) / 10));

    // Generate label
    let label = 'קל';
    if (score > 8) label = 'עצים מאוד';
    else if (score > 6) label = 'קשה';
    else if (score > 3) label = 'בינוני';

    return {
      effort_score: score,
      effort_label: label
    };
  } catch (err) {
    console.error('[calculateEffortScore] Error:', err.message);
    return {
      effort_score: 5,
      effort_label: 'בינוני'
    };
  }
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const { workout } = await req.json();

    if (!workout) {
      return Response.json({ ok: false, error: 'Missing workout' }, { status: 400 });
    }

    const { effort_score, effort_label } = calculateEffortScore(workout);

    return Response.json({
      ok: true,
      effort_score,
      effort_label,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    return Response.json({ ok: false, error: error.message }, { status: 500 });
  }
});

export { calculateEffortScore };