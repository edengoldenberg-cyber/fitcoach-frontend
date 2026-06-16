/**
 * healthScore.test.js
 *
 * Unit tests for src/utils/healthScore.js
 * Run: npx vitest run src/utils/healthScore.test.js
 */

import { describe, it, expect } from 'vitest';
import {
  // date helpers
  toIsraelDateString,
  getWeekBoundaries,
  getWeekDayStrings,
  getPriorWeekBoundaries,
  filterByDateRange,
  groupByDate,
  dailyCalories,
  dailyWater,
  // score components
  computeNutritionScore,
  computeWorkoutScore,
  computeWaterScore,
  computeReportingScore,
  computeHealthScore,
  // suppression
  hasMinimumData,
  // band
  getScoreBand,
  // full computation
  computeScoreForTrainee,
  // trends
  computeTrend,
  computeTrendsForTrainee,
  // constants
  WEIGHTS,
  DEFAULT_WORKOUT_TARGET,
  MIN_ACTIVE_DAYS,
} from './healthScore.js';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

// A fixed Sunday (start of a week) to use as reference in tests.
// 2026-06-14 = Sunday
const SUNDAY_REF   = new Date('2026-06-14T12:00:00Z');
const WEEK_START   = '2026-06-14';
const WEEK_END     = '2026-06-20';
const WEEK_DAYS    = ['2026-06-14','2026-06-15','2026-06-16','2026-06-17','2026-06-18','2026-06-19','2026-06-20'];

const TRAINEE = {
  target_calories:          2000,
  water_target_ml:          3000,
  target_sessions_per_week: 3,
};

/** Creates a minimal MealEntry on the given date with given calories. */
function meal(date, calories) {
  return { date, calories, trainee_email: 'test@test.com' };
}

/** Creates a minimal WaterEntry on the given date with given ml. */
function water(date, amount_ml) {
  return { date, amount_ml, trainee_email: 'test@test.com' };
}

/** Creates a WorkoutSession on the given date. */
function workout(date) {
  return { date, trainee_email: 'test@test.com' };
}

// ─── Date helpers ─────────────────────────────────────────────────────────────

describe('getWeekBoundaries', () => {
  it('starts on Sunday and ends on Saturday', () => {
    const { weekStart, weekEnd } = getWeekBoundaries(SUNDAY_REF);
    expect(weekStart).toBe(WEEK_START);
    expect(weekEnd).toBe(WEEK_END);
  });

  it('returns same week for a Wednesday in that week', () => {
    const wednesday = new Date('2026-06-17T12:00:00Z');
    const { weekStart, weekEnd } = getWeekBoundaries(wednesday);
    expect(weekStart).toBe(WEEK_START);
    expect(weekEnd).toBe(WEEK_END);
  });

  it('returns same week for Saturday (last day)', () => {
    const saturday = new Date('2026-06-20T12:00:00Z');
    const { weekStart, weekEnd } = getWeekBoundaries(saturday);
    expect(weekStart).toBe(WEEK_START);
    expect(weekEnd).toBe(WEEK_END);
  });

  it('rolls to next week for a day in the next week', () => {
    const nextSunday = new Date('2026-06-21T12:00:00Z');
    const { weekStart } = getWeekBoundaries(nextSunday);
    expect(weekStart).toBe('2026-06-21');
  });
});

describe('getWeekDayStrings', () => {
  it('returns exactly 7 consecutive days starting from weekStart', () => {
    const days = getWeekDayStrings(WEEK_START);
    expect(days).toHaveLength(7);
    expect(days[0]).toBe('2026-06-14');
    expect(days[6]).toBe('2026-06-20');
  });

  it('each day is in YYYY-MM-DD format', () => {
    const days = getWeekDayStrings(WEEK_START);
    days.forEach(d => expect(d).toMatch(/^\d{4}-\d{2}-\d{2}$/));
  });
});

describe('getPriorWeekBoundaries', () => {
  it('returns 3 prior weeks in ascending order', () => {
    // WEEK_START = 2026-06-14 (Sunday)
    // i=3 → 2026-06-14 − 21 days = 2026-05-24
    // i=2 → 2026-06-14 − 14 days = 2026-05-31
    // i=1 → 2026-06-14 −  7 days = 2026-06-07
    const weeks = getPriorWeekBoundaries(WEEK_START, 3);
    expect(weeks).toHaveLength(3);
    expect(weeks[0].weekStart).toBe('2026-05-24');
    expect(weeks[0].weekEnd).toBe('2026-05-30');
    expect(weeks[1].weekStart).toBe('2026-05-31');
    expect(weeks[1].weekEnd).toBe('2026-06-06');
    expect(weeks[2].weekStart).toBe('2026-06-07');
    expect(weeks[2].weekEnd).toBe('2026-06-13');
  });

  it('each week spans exactly 7 days', () => {
    const weeks = getPriorWeekBoundaries(WEEK_START, 3);
    weeks.forEach(({ weekStart: ws, weekEnd: we }) => {
      const s = new Date(ws + 'T00:00:00Z');
      const e = new Date(we + 'T00:00:00Z');
      const diff = (e - s) / (1000 * 60 * 60 * 24);
      expect(diff).toBe(6);
    });
  });
});

// ─── Data adapters ────────────────────────────────────────────────────────────

describe('filterByDateRange', () => {
  it('includes records on boundary dates', () => {
    const records = [meal('2026-06-14', 500), meal('2026-06-20', 500)];
    const result = filterByDateRange(records, '2026-06-14', '2026-06-20');
    expect(result).toHaveLength(2);
  });

  it('excludes records outside range', () => {
    const records = [meal('2026-06-13', 500), meal('2026-06-21', 500)];
    const result = filterByDateRange(records, '2026-06-14', '2026-06-20');
    expect(result).toHaveLength(0);
  });

  it('handles records with no date gracefully', () => {
    const records = [{ calories: 500 }, meal('2026-06-15', 400)];
    const result = filterByDateRange(records, '2026-06-14', '2026-06-20');
    expect(result).toHaveLength(1);
  });

  it('returns empty array for null/undefined input', () => {
    expect(filterByDateRange(null,      '2026-06-14', '2026-06-20')).toEqual([]);
    expect(filterByDateRange(undefined, '2026-06-14', '2026-06-20')).toEqual([]);
  });
});

describe('groupByDate', () => {
  it('groups multiple records on the same date', () => {
    const records = [meal('2026-06-15', 500), meal('2026-06-15', 300), meal('2026-06-16', 400)];
    const map = groupByDate(records);
    expect(map['2026-06-15']).toHaveLength(2);
    expect(map['2026-06-16']).toHaveLength(1);
  });

  it('ignores records without a date', () => {
    const records = [{ calories: 500 }, meal('2026-06-15', 300)];
    const map = groupByDate(records);
    expect(Object.keys(map)).toEqual(['2026-06-15']);
  });
});

// ─── Nutrition score ──────────────────────────────────────────────────────────

describe('computeNutritionScore', () => {
  it('returns 100 when trainee hits 100% target every day', () => {
    const meals = WEEK_DAYS.map(d => meal(d, 2000));
    expect(computeNutritionScore(meals, 2000, WEEK_DAYS)).toBe(100);
  });

  it('returns 0 when no meals logged', () => {
    expect(computeNutritionScore([], 2000, WEEK_DAYS)).toBe(0);
  });

  it('applies compound formula: days factor × avg pct factor', () => {
    // 5 days logged, all at 80% of 2000 = 1600 kcal
    const meals = WEEK_DAYS.slice(0, 5).map(d => meal(d, 1600));
    const score = computeNutritionScore(meals, 2000, WEEK_DAYS);
    // compound = (5/7) × 0.80 = 0.5714 → 57
    expect(score).toBe(57);
  });

  it('caps daily intake at 100% of target (no bonus for overeating)', () => {
    const meals = WEEK_DAYS.map(d => meal(d, 5000)); // way over target
    expect(computeNutritionScore(meals, 2000, WEEK_DAYS)).toBe(100);
  });

  it('uses default target 2000 when targetCalories is falsy', () => {
    const meals = WEEK_DAYS.map(d => meal(d, 2000));
    expect(computeNutritionScore(meals, null, WEEK_DAYS)).toBe(100);
    expect(computeNutritionScore(meals, 0,    WEEK_DAYS)).toBe(100);
  });

  it('handles multiple entries per day (sums them)', () => {
    // 2 entries per day: 1000 + 1000 = 2000 = 100% of 2000
    const meals = WEEK_DAYS.flatMap(d => [meal(d, 1000), meal(d, 1000)]);
    expect(computeNutritionScore(meals, 2000, WEEK_DAYS)).toBe(100);
  });

  it('partial week: 3 days at 90% target', () => {
    const meals = WEEK_DAYS.slice(0, 3).map(d => meal(d, 1800));
    const score = computeNutritionScore(meals, 2000, WEEK_DAYS);
    // compound = (3/7) × 0.90 = 0.3857 → 39
    expect(score).toBe(39);
  });
});

// ─── Workout score ────────────────────────────────────────────────────────────

describe('computeWorkoutScore', () => {
  it('returns 100 when sessions equal target', () => {
    const workouts = [workout('2026-06-14'), workout('2026-06-15'), workout('2026-06-16')];
    expect(computeWorkoutScore(workouts, 3, WEEK_DAYS)).toBe(100);
  });

  it('returns 100 when sessions exceed target (capped)', () => {
    const workouts = WEEK_DAYS.map(workout);
    expect(computeWorkoutScore(workouts, 3, WEEK_DAYS)).toBe(100);
  });

  it('returns 0 when no workouts', () => {
    expect(computeWorkoutScore([], 3, WEEK_DAYS)).toBe(0);
  });

  it('returns 67 for 2 sessions with target of 3', () => {
    const workouts = [workout('2026-06-14'), workout('2026-06-15')];
    expect(computeWorkoutScore(workouts, 3, WEEK_DAYS)).toBe(67);
  });

  it('uses default target 3 when targetSessions is falsy', () => {
    const workouts = [workout('2026-06-14'), workout('2026-06-15'), workout('2026-06-16')];
    expect(computeWorkoutScore(workouts, null,  WEEK_DAYS)).toBe(100);
    expect(computeWorkoutScore(workouts, 0,     WEEK_DAYS)).toBe(100);
  });

  it('excludes workouts outside the week', () => {
    const workouts = [workout('2026-06-13'), workout('2026-06-21')]; // outside range
    expect(computeWorkoutScore(workouts, 3, WEEK_DAYS)).toBe(0);
  });
});

// ─── Water score ──────────────────────────────────────────────────────────────

describe('computeWaterScore', () => {
  it('returns 100 when target hit every day', () => {
    const entries = WEEK_DAYS.map(d => water(d, 3000));
    expect(computeWaterScore(entries, 3000, WEEK_DAYS)).toBe(100);
  });

  it('returns 0 when no water logged', () => {
    expect(computeWaterScore([], 3000, WEEK_DAYS)).toBe(0);
  });

  it('returns 57 when target hit 4 of 7 days', () => {
    const entries = WEEK_DAYS.slice(0, 4).map(d => water(d, 3000));
    expect(computeWaterScore(entries, 3000, WEEK_DAYS)).toBe(57);
  });

  it('counts a day as hit only when total meets or exceeds target', () => {
    // 2500 ml < 3000 target: should NOT count
    const entries = [water('2026-06-14', 2500), water('2026-06-15', 3000)];
    expect(computeWaterScore(entries, 3000, WEEK_DAYS)).toBe(14); // 1/7
  });

  it('sums multiple water entries per day', () => {
    // 2 × 1500 = 3000 = target → should count
    const entries = [
      water('2026-06-14', 1500),
      water('2026-06-14', 1500),
    ];
    expect(computeWaterScore(entries, 3000, WEEK_DAYS)).toBe(14); // 1/7
  });

  it('uses default target 3000 when waterTargetMl is falsy', () => {
    const entries = WEEK_DAYS.map(d => water(d, 3000));
    expect(computeWaterScore(entries, null, WEEK_DAYS)).toBe(100);
  });
});

// ─── Reporting score ──────────────────────────────────────────────────────────

describe('computeReportingScore', () => {
  it('returns 100 when meal logged every day', () => {
    const meals = WEEK_DAYS.map(d => meal(d, 2000));
    expect(computeReportingScore(meals, WEEK_DAYS)).toBe(100);
  });

  it('returns 0 when no meals', () => {
    expect(computeReportingScore([], WEEK_DAYS)).toBe(0);
  });

  it('returns 57 for 4 days with entries', () => {
    const meals = WEEK_DAYS.slice(0, 4).map(d => meal(d, 2000));
    expect(computeReportingScore(meals, WEEK_DAYS)).toBe(57);
  });

  it('counts a day once even with multiple entries', () => {
    const meals = [meal('2026-06-14', 500), meal('2026-06-14', 500)];
    expect(computeReportingScore(meals, WEEK_DAYS)).toBe(14); // 1/7
  });
});

// ─── Combined health score ────────────────────────────────────────────────────

describe('computeHealthScore', () => {
  it('returns 100 when all components are 100', () => {
    expect(computeHealthScore({ nutrition: 100, workout: 100, water: 100, reporting: 100 })).toBe(100);
  });

  it('returns 0 when all components are 0', () => {
    expect(computeHealthScore({ nutrition: 0, workout: 0, water: 0, reporting: 0 })).toBe(0);
  });

  it('applies correct weights', () => {
    // nutrition=100, rest=0 → 100 × 0.35 = 35
    expect(computeHealthScore({ nutrition: 100, workout: 0, water: 0, reporting: 0 })).toBe(35);
    // workout=100, rest=0 → 100 × 0.35 = 35
    expect(computeHealthScore({ nutrition: 0, workout: 100, water: 0, reporting: 0 })).toBe(35);
    // water=100, rest=0 → 100 × 0.15 = 15
    expect(computeHealthScore({ nutrition: 0, workout: 0, water: 100, reporting: 0 })).toBe(15);
    // reporting=100, rest=0 → 100 × 0.15 = 15
    expect(computeHealthScore({ nutrition: 0, workout: 0, water: 0, reporting: 100 })).toBe(15);
  });

  it('weights sum to 100', () => {
    const sum = Object.values(WEIGHTS).reduce((s, w) => s + w, 0);
    expect(Math.round(sum * 100)).toBe(100);
  });

  it('typical trainee scenario', () => {
    // nutrition=70, workout=67, water=57, reporting=86
    const score = computeHealthScore({ nutrition: 70, workout: 67, water: 57, reporting: 86 });
    // 70×0.35 + 67×0.35 + 57×0.15 + 86×0.15
    // = 24.5 + 23.45 + 8.55 + 12.9 = 69.4 → 69
    expect(score).toBe(69);
  });
});

// ─── Score suppression ────────────────────────────────────────────────────────

describe('hasMinimumData', () => {
  it('returns true when ≥ 3 days have meal entries', () => {
    const meals = WEEK_DAYS.slice(0, 3).map(d => meal(d, 2000));
    expect(hasMinimumData(meals, [], WEEK_DAYS)).toBe(true);
  });

  it('returns true when ≥ 3 days have water entries (meals separate)', () => {
    const waterEntries = WEEK_DAYS.slice(0, 3).map(d => water(d, 3000));
    expect(hasMinimumData([], waterEntries, WEEK_DAYS)).toBe(true);
  });

  it('returns true when combined meal + water days total ≥ 3', () => {
    // 1 meal day + 2 water days = 3 unique active days
    const meals        = [meal('2026-06-14', 2000)];
    const waterEntries = [water('2026-06-15', 3000), water('2026-06-16', 3000)];
    expect(hasMinimumData(meals, waterEntries, WEEK_DAYS)).toBe(true);
  });

  it('returns false when only 2 active days', () => {
    const meals = WEEK_DAYS.slice(0, 2).map(d => meal(d, 2000));
    expect(hasMinimumData(meals, [], WEEK_DAYS)).toBe(false);
  });

  it('returns false when no data', () => {
    expect(hasMinimumData([], [], WEEK_DAYS)).toBe(false);
  });

  it('does not double-count a day that has both meal and water', () => {
    // same day in both arrays → still counts as 1 active day
    const meals        = [meal('2026-06-14', 2000)];
    const waterEntries = [water('2026-06-14', 3000)];
    expect(hasMinimumData(meals, waterEntries, WEEK_DAYS)).toBe(false); // only 1 unique day
  });
});

// ─── Score band ───────────────────────────────────────────────────────────────

describe('getScoreBand', () => {
  it('returns מצוין for 80–100', () => {
    expect(getScoreBand(100).label).toBe('מצוין');
    expect(getScoreBand(80).label).toBe('מצוין');
  });
  it('returns טוב for 60–79', () => {
    expect(getScoreBand(79).label).toBe('טוב');
    expect(getScoreBand(60).label).toBe('טוב');
  });
  it('returns בינוני for 40–59', () => {
    expect(getScoreBand(59).label).toBe('בינוני');
    expect(getScoreBand(40).label).toBe('בינוני');
  });
  it('returns נמוך for 20–39', () => {
    expect(getScoreBand(39).label).toBe('נמוך');
    expect(getScoreBand(20).label).toBe('נמוך');
  });
  it('returns קריטי for 0–19', () => {
    expect(getScoreBand(19).label).toBe('קריטי');
    expect(getScoreBand(0).label).toBe('קריטי');
  });
  it('returns null for null score', () => {
    expect(getScoreBand(null)).toBeNull();
    expect(getScoreBand(undefined)).toBeNull();
  });
});

// ─── Full trainee computation ─────────────────────────────────────────────────

describe('computeScoreForTrainee', () => {
  it('returns a suppressed result when fewer than 3 active days', () => {
    const meals = [meal('2026-06-14', 2000)];
    const result = computeScoreForTrainee(TRAINEE, { meals, waterEntries: [], workouts: [] }, SUNDAY_REF);
    expect(result.suppressed).toBe(true);
    expect(result.score).toBeNull();
    expect(result.band).toBeNull();
  });

  it('returns a score when trainee has enough data', () => {
    const meals = WEEK_DAYS.slice(0, 5).map(d => meal(d, 2000));
    const result = computeScoreForTrainee(TRAINEE, { meals, waterEntries: [], workouts: [] }, SUNDAY_REF);
    expect(result.suppressed).toBe(false);
    expect(result.score).toBeGreaterThanOrEqual(0);
    expect(result.score).toBeLessThanOrEqual(100);
    expect(result.band).not.toBeNull();
  });

  it('returns weekStart and weekEnd matching the reference date', () => {
    const result = computeScoreForTrainee(TRAINEE, { meals: [], waterEntries: [], workouts: [] }, SUNDAY_REF);
    expect(result.weekStart).toBe(WEEK_START);
    expect(result.weekEnd).toBe(WEEK_END);
  });

  it('filters meals outside the current week (safety net)', () => {
    // Meals in prior week should NOT count toward this week's score
    const priorMeals = ['2026-06-07','2026-06-08','2026-06-09','2026-06-10','2026-06-11'].map(d => meal(d, 2000));
    const result = computeScoreForTrainee(TRAINEE, { meals: priorMeals, waterEntries: [], workouts: [] }, SUNDAY_REF);
    expect(result.suppressed).toBe(true); // no data in current week
  });

  it('perfect week returns score of 100', () => {
    const meals    = WEEK_DAYS.map(d => meal(d, 2000));
    const waters   = WEEK_DAYS.map(d => water(d, 3000));
    const workouts = [workout('2026-06-14'), workout('2026-06-15'), workout('2026-06-16')];
    const result = computeScoreForTrainee(TRAINEE, { meals, waterEntries: waters, workouts }, SUNDAY_REF);
    expect(result.score).toBe(100);
    expect(result.band.label).toBe('מצוין');
  });

  it('zero calories + no water + no workouts: only reporting contributes', () => {
    // 3 entries logged with 0 kcal each.
    // Nutrition = 0 (0 kcal / target), Workout = 0, Water = 0.
    // Reporting = 3/7 × 100 = 43 (entries exist, calories irrelevant for reporting).
    // Score = 43 × 0.15 = 6.
    const meals = WEEK_DAYS.slice(0, 3).map(d => meal(d, 0));
    const result = computeScoreForTrainee(TRAINEE, { meals, waterEntries: [], workouts: [] }, SUNDAY_REF);
    expect(result.suppressed).toBe(false);
    expect(result.components.nutrition).toBe(0);
    expect(result.components.workout).toBe(0);
    expect(result.components.water).toBe(0);
    expect(result.components.reporting).toBe(43);
    expect(result.score).toBe(6);
  });

  it('uses default target_calories=2000 when not set on trainee', () => {
    const traineeNoTargets = {};
    const meals = WEEK_DAYS.map(d => meal(d, 2000));
    const result = computeScoreForTrainee(traineeNoTargets, { meals, waterEntries: [], workouts: [] }, SUNDAY_REF);
    expect(result.suppressed).toBe(false);
    expect(result.components.nutrition).toBeGreaterThan(0);
  });

  it('all four components present in result', () => {
    const meals = WEEK_DAYS.slice(0, 5).map(d => meal(d, 2000));
    const result = computeScoreForTrainee(TRAINEE, { meals, waterEntries: [], workouts: [] }, SUNDAY_REF);
    expect(result.components).toHaveProperty('nutrition');
    expect(result.components).toHaveProperty('workout');
    expect(result.components).toHaveProperty('water');
    expect(result.components).toHaveProperty('reporting');
  });
});

// ─── Trend computation ────────────────────────────────────────────────────────

describe('computeTrend', () => {
  it('returns up when current exceeds baseline by more than threshold', () => {
    const result = computeTrend(80, [60, 65, 70]);
    expect(result.direction).toBe('up');
    expect(result.delta).toBeGreaterThan(5);
  });

  it('returns down when current is below baseline by more than threshold', () => {
    const result = computeTrend(50, [70, 75, 80]);
    expect(result.direction).toBe('down');
    expect(result.delta).toBeLessThan(-5);
  });

  it('returns stable when within threshold', () => {
    const result = computeTrend(72, [70, 68, 74]);
    expect(result.direction).toBe('stable');
  });

  it('returns stable with no prior values', () => {
    const result = computeTrend(80, []);
    expect(result.direction).toBe('stable');
    expect(result.baseline).toBeNull();
  });

  it('returns stable when current is null', () => {
    const result = computeTrend(null, [70, 75]);
    expect(result.direction).toBe('stable');
    expect(result.delta).toBe(0);
  });

  it('ignores null prior values', () => {
    const result = computeTrend(80, [null, 60, null]);
    expect(result.baseline).toBe(60);
    expect(result.direction).toBe('up');
  });

  it('uses custom threshold for workout sessions', () => {
    // 0.3 threshold: 2.5 vs baseline 2.0 = delta 0.5 > 0.3 → up
    const result = computeTrend(2.5, [2.0, 2.1, 1.9], 0.3);
    expect(result.direction).toBe('up');
  });
});

describe('computeTrendsForTrainee', () => {
  // Build 4 weeks of data: 3 prior weeks + current week
  const buildWeeks = (weekStarts, mealsPerWeek) => {
    const allMeals = [];
    weekStarts.forEach((ws, i) => {
      const days = getWeekDayStrings(ws);
      days.forEach(d => allMeals.push(meal(d, mealsPerWeek[i])));
    });
    return allMeals;
  };

  it('detects improving nutrition trend', () => {
    const priorWeeks = getPriorWeekBoundaries(WEEK_START, 3);
    const weekStarts = [...priorWeeks.map(w => w.weekStart), WEEK_START];

    // Prior weeks: 1400 kcal/day (70% of 2000), current week: 2000 (100%)
    const allMeals = buildWeeks(weekStarts, [1400, 1400, 1400, 2000]);
    const waters   = WEEK_DAYS.map(d => water(d, 0)); // no water data

    const result = computeTrendsForTrainee(
      TRAINEE,
      { meals: allMeals, waterEntries: waters, workouts: [] },
      SUNDAY_REF
    );

    expect(result.nutrition.direction).toBe('up');
    expect(result.hasSufficientHistory).toBe(true);
  });

  it('detects declining nutrition trend', () => {
    const priorWeeks = getPriorWeekBoundaries(WEEK_START, 3);
    const weekStarts = [...priorWeeks.map(w => w.weekStart), WEEK_START];

    // Prior weeks: 2000 kcal/day (100%), current week: 1000 (50%)
    const allMeals = buildWeeks(weekStarts, [2000, 2000, 2000, 1000]);

    const result = computeTrendsForTrainee(
      TRAINEE,
      { meals: allMeals, waterEntries: [], workouts: [] },
      SUNDAY_REF
    );

    expect(result.nutrition.direction).toBe('down');
  });

  it('returns hasSufficientHistory=false with only 1 prior week of data', () => {
    // Only current week has data
    const meals = WEEK_DAYS.map(d => meal(d, 2000));

    const result = computeTrendsForTrainee(
      TRAINEE,
      { meals, waterEntries: [], workouts: [] },
      SUNDAY_REF
    );

    expect(result.hasSufficientHistory).toBe(false);
  });

  it('result includes all five trend keys', () => {
    const meals = WEEK_DAYS.map(d => meal(d, 2000));
    const result = computeTrendsForTrainee(
      TRAINEE,
      { meals, waterEntries: [], workouts: [] },
      SUNDAY_REF
    );
    expect(result).toHaveProperty('healthScore');
    expect(result).toHaveProperty('nutrition');
    expect(result).toHaveProperty('workout');
    expect(result).toHaveProperty('water');
    expect(result).toHaveProperty('reporting');
  });
});
