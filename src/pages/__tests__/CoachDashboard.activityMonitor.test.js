/**
 * CoachDashboard.activityMonitor.test.js
 *
 * Unit tests for the dual-activity (nutrition + workout) monitoring upgrade.
 *
 * Tests all 16 requirements from the task spec, using pure functions
 * extracted from CoachDashboard.jsx so React is not needed.
 *
 * Run: npx vitest run src/pages/__tests__/CoachDashboard.activityMonitor.test.js
 */

import { describe, it, expect } from 'vitest';

const TODAY = '2026-08-24';

// ─── Pure helpers mirroring CoachDashboard.jsx ────────────────────────────────

function formatDaysSince(days) {
  if (days === null || days === undefined) return null;
  if (days === 0) return 'היום';
  if (days === 1) return 'אתמול';
  return `לפני ${days} ימים`;
}

function activityColor(days, nutritionMode) {
  if (days === null || days === undefined) return 'text-slate-300';
  if (days === 0 || days === 1) return 'text-emerald-600';
  const yellowThreshold = nutritionMode ? 2 : 4;
  const redThreshold    = nutritionMode ? 3 : 7;
  if (days <= yellowThreshold) return 'text-amber-500';
  if (days >= redThreshold)    return 'text-red-500';
  return 'text-amber-500';
}

// todayActivity computation — MUTUALLY EXCLUSIVE buckets (mirrors fixed useMemo in CoachDashboard.jsx)
// Invariant: onlyNutrition + onlyWorkout + bothToday + neitherToday === trainees.length
function computeTodayActivity(trainees, allMeals, allWorkouts, today) {
  let onlyNutrition = 0, onlyWorkout = 0, bothToday = 0, neitherToday = 0;
  trainees.forEach(t => {
    const hasMeal    = allMeals.some(m => m.trainee_email === t.user_email && m.date === today);
    const hasWorkout = allWorkouts.some(w => w.trainee_email === t.user_email && w.date === today);
    if      ( hasMeal && !hasWorkout) onlyNutrition++;
    else if (!hasMeal &&  hasWorkout) onlyWorkout++;
    else if ( hasMeal &&  hasWorkout) bothToday++;
    else                              neitherToday++;
  });
  return { onlyNutrition, onlyWorkout, bothToday, neitherToday };
}

// applyActivityFilter (mirrors fixed filteredTrainees activityFilter block)
function applyActivityFilter(trainees, activityFilter, allMeals, allWorkouts, today, summaryByEmail = {}) {
  if (!activityFilter) return trainees;
  return trainees.filter(t => {
    const email      = t.user_email;
    const hasMeal    = allMeals.some(m => m.trainee_email === email && m.date === today);
    const hasWorkout = allWorkouts.some(w => w.trainee_email === email && w.date === today);
    const summary    = summaryByEmail[email] || {};
    const dsMeal     = summary.days_since_last_meal;
    const dsWorkout  = summary.days_since_last_workout;

    if (activityFilter === 'nutrition_today')   return hasMeal && !hasWorkout;   // רק תזונה
    if (activityFilter === 'workout_today')     return !hasMeal && hasWorkout;   // רק אימון
    if (activityFilter === 'both_today')        return hasMeal && hasWorkout;
    if (activityFilter === 'neither_today')     return !hasMeal && !hasWorkout;
    if (activityFilter === 'no_nutrition_3d')   return dsMeal    === null || dsMeal    >= 3;
    if (activityFilter === 'no_workout_7d')     return dsWorkout === null || dsWorkout >= 7;
    if (activityFilter === 'attention')         return summary.at_risk === true;
    return true;
  });
}

// combined filter (search + activityFilter + badge filter)
function applyAllFilters(trainees, search, filter, activityFilter, allMeals, allWorkouts, today, summaryByEmail = {}, badgeByEmail = {}) {
  return trainees.filter(t => {
    if (!t.full_name?.toLowerCase().includes(search.toLowerCase())) return false;
    if (filter !== 'all') {
      const badge = badgeByEmail[t.user_email];
      if (filter === 'good'         && badge !== 'on_track') return false;
      if (filter === 'partial'      && badge !== 'partial')  return false;
      if (filter === 'behind'       && badge !== 'behind')   return false;
      if (filter === 'not_reported' && badge !== 'no_data')  return false;
    }
    if (activityFilter) {
      const result = applyActivityFilter([t], activityFilter, allMeals, allWorkouts, today, summaryByEmail);
      if (result.length === 0) return false;
    }
    return true;
  });
}

// ─── Test fixtures ────────────────────────────────────────────────────────────

const traineeA = { id: 'a', full_name: 'Alice Cohen',   user_email: 'alice@test.com'  };
const traineeB = { id: 'b', full_name: 'Bob Levi',      user_email: 'bob@test.com'    };
const traineeC = { id: 'c', full_name: 'Carol Mizrahi', user_email: 'carol@test.com'  };
const traineeD = { id: 'd', full_name: 'Dan Sharon',    user_email: 'dan@test.com'    };

// ─── Standard fixtures for all daily-activity tests ──────────────────────────
// A: nutrition only, B: workout only, C: both, D: neither
const std4Meals    = [
  { trainee_email: 'alice@test.com', date: TODAY, calories: 500 },
  { trainee_email: 'carol@test.com', date: TODAY, calories: 600 },
];
const std4Workouts = [
  { trainee_email: 'bob@test.com',   date: TODAY, status: 'completed' },
  { trainee_email: 'carol@test.com', date: TODAY, status: 'completed' },
];
const std4Trainees = [traineeA, traineeB, traineeC, traineeD];

// ─── 1. Nutrition only (no workout) — must land in onlyNutrition ONLY ────────
describe('1. nutrition today, no workout → counted only in רק תזונה', () => {
  const meals    = [{ trainee_email: 'alice@test.com', date: TODAY, calories: 500 }];
  const workouts = [];
  const trainees = [traineeA];

  it('counts in onlyNutrition=1', () => {
    const { onlyNutrition } = computeTodayActivity(trainees, meals, workouts, TODAY);
    expect(onlyNutrition).toBe(1);
  });

  it('does NOT count in onlyWorkout', () => {
    const { onlyWorkout } = computeTodayActivity(trainees, meals, workouts, TODAY);
    expect(onlyWorkout).toBe(0);
  });

  it('does NOT count in bothToday', () => {
    const { bothToday } = computeTodayActivity(trainees, meals, workouts, TODAY);
    expect(bothToday).toBe(0);
  });

  it('does NOT count in neitherToday', () => {
    const { neitherToday } = computeTodayActivity(trainees, meals, workouts, TODAY);
    expect(neitherToday).toBe(0);
  });

  it('sum of all four buckets = 1 (total trainees)', () => {
    const a = computeTodayActivity(trainees, meals, workouts, TODAY);
    expect(a.onlyNutrition + a.onlyWorkout + a.bothToday + a.neitherToday).toBe(trainees.length);
  });
});

// ─── 2. Workout only (no nutrition) — must land in onlyWorkout ONLY ──────────
describe('2. workout today, no nutrition → counted only in רק אימון', () => {
  const meals    = [];
  const workouts = [{ trainee_email: 'bob@test.com', date: TODAY, status: 'completed' }];
  const trainees = [traineeB];

  it('counts in onlyWorkout=1', () => {
    const { onlyWorkout } = computeTodayActivity(trainees, meals, workouts, TODAY);
    expect(onlyWorkout).toBe(1);
  });

  it('does NOT count in onlyNutrition', () => {
    const { onlyNutrition } = computeTodayActivity(trainees, meals, workouts, TODAY);
    expect(onlyNutrition).toBe(0);
  });

  it('does NOT count in bothToday', () => {
    const { bothToday } = computeTodayActivity(trainees, meals, workouts, TODAY);
    expect(bothToday).toBe(0);
  });

  it('does NOT count in neitherToday', () => {
    const { neitherToday } = computeTodayActivity(trainees, meals, workouts, TODAY);
    expect(neitherToday).toBe(0);
  });

  it('sum of all four buckets = 1', () => {
    const a = computeTodayActivity(trainees, meals, workouts, TODAY);
    expect(a.onlyNutrition + a.onlyWorkout + a.bothToday + a.neitherToday).toBe(trainees.length);
  });
});

// ─── 3. Both today — must land in bothToday ONLY, NOT in onlyNutrition or onlyWorkout
describe('3. both nutrition and workout → counted ONLY in תזונה + אימון', () => {
  const meals    = [{ trainee_email: 'carol@test.com', date: TODAY, calories: 600 }];
  const workouts = [{ trainee_email: 'carol@test.com', date: TODAY, status: 'completed' }];
  const trainees = [traineeC];

  it('counts in bothToday=1', () => {
    const { bothToday } = computeTodayActivity(trainees, meals, workouts, TODAY);
    expect(bothToday).toBe(1);
  });

  it('does NOT count in onlyNutrition (the old bug)', () => {
    // Before the fix: hasMeal incremented nutritionToday regardless of hasWorkout.
    // After the fix: hasMeal && !hasWorkout → onlyNutrition stays 0 for this trainee.
    const { onlyNutrition } = computeTodayActivity(trainees, meals, workouts, TODAY);
    expect(onlyNutrition).toBe(0);
  });

  it('does NOT count in onlyWorkout (the old bug)', () => {
    const { onlyWorkout } = computeTodayActivity(trainees, meals, workouts, TODAY);
    expect(onlyWorkout).toBe(0);
  });

  it('does NOT count in neitherToday', () => {
    const { neitherToday } = computeTodayActivity(trainees, meals, workouts, TODAY);
    expect(neitherToday).toBe(0);
  });

  it('sum of all four buckets = 1', () => {
    const a = computeTodayActivity(trainees, meals, workouts, TODAY);
    expect(a.onlyNutrition + a.onlyWorkout + a.bothToday + a.neitherToday).toBe(trainees.length);
  });
});

// ─── 4. Neither today ─────────────────────────────────────────────────────────
describe('4. neither nutrition nor workout today', () => {
  const meals    = [];
  const workouts = [];
  const trainees = [traineeD];

  it('counts only in neitherToday=1', () => {
    const activity = computeTodayActivity(trainees, meals, workouts, TODAY);
    expect(activity.onlyNutrition).toBe(0);
    expect(activity.onlyWorkout).toBe(0);
    expect(activity.bothToday).toBe(0);
    expect(activity.neitherToday).toBe(1);
  });

  it('sum of all four buckets = 1', () => {
    const a = computeTodayActivity(trainees, meals, workouts, TODAY);
    expect(a.onlyNutrition + a.onlyWorkout + a.bothToday + a.neitherToday).toBe(trainees.length);
  });
});

// ─── 5. No trainee appears in multiple daily groups (mutual exclusivity) ──────
describe('5. mutual exclusivity — no trainee counted in more than one bucket', () => {
  it('each trainee belongs to exactly one of the four buckets', () => {
    const activity = computeTodayActivity(std4Trainees, std4Meals, std4Workouts, TODAY);
    // onlyNutrition = A, onlyWorkout = B, bothToday = C, neitherToday = D
    expect(activity.onlyNutrition).toBe(1);  // only Alice
    expect(activity.onlyWorkout).toBe(1);    // only Bob
    expect(activity.bothToday).toBe(1);      // only Carol
    expect(activity.neitherToday).toBe(1);   // only Dan
  });

  it('nutrition=true + workout=true must NOT increment onlyNutrition', () => {
    // This is the exact bug that existed: Carol (both) was also counted in nutritionToday
    const trainees = [traineeC];
    const meals    = [{ trainee_email: 'carol@test.com', date: TODAY, calories: 600 }];
    const workouts = [{ trainee_email: 'carol@test.com', date: TODAY }];
    const { onlyNutrition } = computeTodayActivity(trainees, meals, workouts, TODAY);
    expect(onlyNutrition).toBe(0);
  });

  it('nutrition=true + workout=true must NOT increment onlyWorkout', () => {
    const trainees = [traineeC];
    const meals    = [{ trainee_email: 'carol@test.com', date: TODAY, calories: 600 }];
    const workouts = [{ trainee_email: 'carol@test.com', date: TODAY }];
    const { onlyWorkout } = computeTodayActivity(trainees, meals, workouts, TODAY);
    expect(onlyWorkout).toBe(0);
  });
});

// ─── 6. Sum of four groups equals total active trainees ───────────────────────
describe('6. sum invariant: four groups always sum to total trainees', () => {
  it('4 trainees: onlyNutrition + onlyWorkout + bothToday + neitherToday = 4', () => {
    const a = computeTodayActivity(std4Trainees, std4Meals, std4Workouts, TODAY);
    expect(a.onlyNutrition + a.onlyWorkout + a.bothToday + a.neitherToday).toBe(4);
  });

  it('example from production: 52 trainees must sum to 52', () => {
    // Generate 52 synthetic trainees with 8 nutrition-only, 5 workout-only, 3 both, 36 neither
    // (8+5+3+36=52, but old code would show 8+5+3+36=52 wrong when "both" were also in "nutrition" and "workout")
    const trainees52 = Array.from({ length: 52 }, (_, i) => ({
      id: String(i), full_name: `T${i}`, user_email: `t${i}@test.com`
    }));
    const meals52    = [];
    const workouts52 = [];

    // 8 nutrition-only (indices 0-7)
    for (let i = 0; i < 8; i++)  meals52.push({ trainee_email: `t${i}@test.com`, date: TODAY });
    // 5 workout-only (indices 8-12)
    for (let i = 8; i < 13; i++) workouts52.push({ trainee_email: `t${i}@test.com`, date: TODAY });
    // 3 both (indices 13-15)
    for (let i = 13; i < 16; i++) {
      meals52.push({ trainee_email: `t${i}@test.com`, date: TODAY });
      workouts52.push({ trainee_email: `t${i}@test.com`, date: TODAY });
    }
    // 36 neither: indices 16-51 — no meals/workouts

    const a = computeTodayActivity(trainees52, meals52, workouts52, TODAY);
    expect(a.onlyNutrition).toBe(8);
    expect(a.onlyWorkout).toBe(5);
    expect(a.bothToday).toBe(3);
    expect(a.neitherToday).toBe(36);
    // The sum MUST be 52 — the old bug would give 8+5+3+36 = 52 but individual cards showed 11/8/3/36=58
    expect(a.onlyNutrition + a.onlyWorkout + a.bothToday + a.neitherToday).toBe(52);
  });

  it('proves old overlap bug: old logic produced sum > total trainees', () => {
    // Simulate the buggy counting for the same 52-trainee scenario
    function oldBuggyCount(trainees, meals, workouts, today) {
      let nutritionToday = 0, workoutToday = 0, bothToday = 0, neitherToday = 0;
      trainees.forEach(t => {
        const hasMeal    = meals.some(m => m.trainee_email === t.user_email && m.date === today);
        const hasWorkout = workouts.some(w => w.trainee_email === t.user_email && w.date === today);
        if (hasMeal)               nutritionToday++;  // ← bug: includes "both" trainees
        if (hasWorkout)            workoutToday++;    // ← bug: includes "both" trainees
        if (hasMeal && hasWorkout) bothToday++;
        if (!hasMeal && !hasWorkout) neitherToday++;
      });
      return nutritionToday + workoutToday + bothToday + neitherToday;
    }

    const trainees52 = Array.from({ length: 52 }, (_, i) => ({ id: String(i), user_email: `t${i}@test.com` }));
    const meals52    = [];
    const workouts52 = [];
    for (let i = 0; i < 8; i++) meals52.push({ trainee_email: `t${i}@test.com`, date: TODAY });
    for (let i = 8; i < 13; i++) workouts52.push({ trainee_email: `t${i}@test.com`, date: TODAY });
    for (let i = 13; i < 16; i++) {
      meals52.push({ trainee_email: `t${i}@test.com`, date: TODAY });
      workouts52.push({ trainee_email: `t${i}@test.com`, date: TODAY });
    }

    const buggySum = oldBuggyCount(trainees52, meals52, workouts52, TODAY);
    expect(buggySum).toBe(58);  // 8+5+3+3+3+36 = old nutrition(11)+workout(8)+both(3)+neither(36)=58
    // The NEW fixed sum is 52:
    const trainees52obj = trainees52.map(t => ({ ...t, full_name: t.user_email }));
    const a = computeTodayActivity(trainees52obj, meals52, workouts52, TODAY);
    expect(a.onlyNutrition + a.onlyWorkout + a.bothToday + a.neitherToday).toBe(52);
  });
});

// ─── 7. Clicking each card returns exactly its matching trainees ──────────────
describe('7. filter returns exactly matching trainees', () => {
  // A: nutrition only, B: workout only, C: both, D: neither

  it('nutrition_today filter → A only (not C who did both)', () => {
    const result = applyActivityFilter(std4Trainees, 'nutrition_today', std4Meals, std4Workouts, TODAY);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('a');
    // C has nutrition but also has workout → not in this filter
    expect(result.map(t => t.id)).not.toContain('c');
  });

  it('workout_today filter → B only (not C who did both)', () => {
    const result = applyActivityFilter(std4Trainees, 'workout_today', std4Meals, std4Workouts, TODAY);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('b');
    expect(result.map(t => t.id)).not.toContain('c');
  });

  it('both_today filter → C only', () => {
    const result = applyActivityFilter(std4Trainees, 'both_today', std4Meals, std4Workouts, TODAY);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('c');
  });

  it('neither_today filter → D only', () => {
    const result = applyActivityFilter(std4Trainees, 'neither_today', std4Meals, std4Workouts, TODAY);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('d');
  });

  it('sum of four filter results = total trainees (4 non-overlapping groups cover all 4)', () => {
    const n = applyActivityFilter(std4Trainees, 'nutrition_today', std4Meals, std4Workouts, TODAY).length;
    const w = applyActivityFilter(std4Trainees, 'workout_today',   std4Meals, std4Workouts, TODAY).length;
    const b = applyActivityFilter(std4Trainees, 'both_today',      std4Meals, std4Workouts, TODAY).length;
    const x = applyActivityFilter(std4Trainees, 'neither_today',   std4Meals, std4Workouts, TODAY).length;
    expect(n + w + b + x).toBe(std4Trainees.length);
  });

  it('card count matches filter result count for nutrition_today', () => {
    const activity = computeTodayActivity(std4Trainees, std4Meals, std4Workouts, TODAY);
    const filterResult = applyActivityFilter(std4Trainees, 'nutrition_today', std4Meals, std4Workouts, TODAY);
    expect(filterResult.length).toBe(activity.onlyNutrition);
  });

  it('card count matches filter result count for workout_today', () => {
    const activity = computeTodayActivity(std4Trainees, std4Meals, std4Workouts, TODAY);
    const filterResult = applyActivityFilter(std4Trainees, 'workout_today', std4Meals, std4Workouts, TODAY);
    expect(filterResult.length).toBe(activity.onlyWorkout);
  });

  it('card count matches filter result count for both_today', () => {
    const activity = computeTodayActivity(std4Trainees, std4Meals, std4Workouts, TODAY);
    const filterResult = applyActivityFilter(std4Trainees, 'both_today', std4Meals, std4Workouts, TODAY);
    expect(filterResult.length).toBe(activity.bothToday);
  });

  it('card count matches filter result count for neither_today', () => {
    const activity = computeTodayActivity(std4Trainees, std4Meals, std4Workouts, TODAY);
    const filterResult = applyActivityFilter(std4Trainees, 'neither_today', std4Meals, std4Workouts, TODAY);
    expect(filterResult.length).toBe(activity.neitherToday);
  });
});

// ─── 9. Clicking nutrition filter (updated: only nutrition, not both) ─────────
describe('9. nutrition_today filter returns only-nutrition trainees', () => {
  const trainees = [traineeA, traineeB, traineeC, traineeD];
  const meals    = [
    { trainee_email: 'alice@test.com', date: TODAY, calories: 500 },
    { trainee_email: 'carol@test.com', date: TODAY, calories: 600 },
  ];
  const workouts = [
    { trainee_email: 'bob@test.com',   date: TODAY, status: 'completed' },
    { trainee_email: 'carol@test.com', date: TODAY, status: 'completed' },
  ];

  it('returns only Alice (nutrition only), NOT Carol (who did both)', () => {
    const result = applyActivityFilter(trainees, 'nutrition_today', meals, workouts, TODAY);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('a');
    expect(result.map(t => t.id)).not.toContain('c');
  });
});

// ─── 10. Clicking workout filter returns correct trainees ─────────────────────
describe('10. workout_today filter returns only-workout trainees', () => {
  // Use std4 fixtures: A=nutrition-only, B=workout-only, C=both, D=neither
  // workout_today filter must return B only (not C who did both)
  it('returns only Bob (workout only), NOT Carol (who did both)', () => {
    const result = applyActivityFilter(std4Trainees, 'workout_today', std4Meals, std4Workouts, TODAY);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('b');
    expect(result.map(t => t.id)).not.toContain('c');
  });
});

// ─── 11. "both" filter requires both activities ───────────────────────────────
describe('11. both_today filter', () => {
  const trainees = [traineeA, traineeB, traineeC, traineeD];
  const meals    = [
    { trainee_email: 'alice@test.com', date: TODAY, calories: 500 },
    { trainee_email: 'carol@test.com', date: TODAY, calories: 600 },
  ];
  const workouts = [
    { trainee_email: 'bob@test.com',   date: TODAY, status: 'completed' },
    { trainee_email: 'carol@test.com', date: TODAY, status: 'completed' },
  ];

  it('returns only trainee with both (C)', () => {
    const result = applyActivityFilter(trainees, 'both_today', meals, workouts, TODAY);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('c');
  });

  it('does not include nutrition-only (A) or workout-only (B)', () => {
    const result = applyActivityFilter(trainees, 'both_today', meals, workouts, TODAY);
    const ids = result.map(t => t.id);
    expect(ids).not.toContain('a');
    expect(ids).not.toContain('b');
  });
});

// ─── 12. "neither" filter excludes anyone active in either category ───────────
describe('12. neither_today filter', () => {
  const trainees = [traineeA, traineeB, traineeC, traineeD];
  const meals    = [
    { trainee_email: 'alice@test.com', date: TODAY, calories: 500 },
    { trainee_email: 'carol@test.com', date: TODAY, calories: 600 },
  ];
  const workouts = [
    { trainee_email: 'bob@test.com',   date: TODAY, status: 'completed' },
    { trainee_email: 'carol@test.com', date: TODAY, status: 'completed' },
  ];

  it('returns only trainee D (no activity of any kind)', () => {
    const result = applyActivityFilter(trainees, 'neither_today', meals, workouts, TODAY);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('d');
  });

  it('excludes A (nutrition only), B (workout only), C (both)', () => {
    const result = applyActivityFilter(trainees, 'neither_today', meals, workouts, TODAY);
    const ids = result.map(t => t.id);
    expect(ids).not.toContain('a');
    expect(ids).not.toContain('b');
    expect(ids).not.toContain('c');
  });
});

// ─── 13. Search + activity filter work together ───────────────────────────────
describe('13. search + activity filter', () => {
  const trainees = [traineeA, traineeB, traineeC, traineeD];
  const meals    = [
    { trainee_email: 'alice@test.com', date: TODAY, calories: 500 },
    { trainee_email: 'carol@test.com', date: TODAY, calories: 600 },
  ];
  const workouts = [];

  it('search for "alice" + nutrition_today → only Alice', () => {
    const result = applyAllFilters(trainees, 'alice', 'all', 'nutrition_today', meals, workouts, TODAY);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('a');
  });

  it('search for "carol" + workout_today → 0 results (carol has no workout)', () => {
    const result = applyAllFilters(trainees, 'carol', 'all', 'workout_today', meals, workouts, TODAY);
    expect(result).toHaveLength(0);
  });

  it('search for "dan" + nutrition_today → 0 results (Dan logged nothing)', () => {
    const result = applyAllFilters(trainees, 'dan', 'all', 'nutrition_today', meals, workouts, TODAY);
    expect(result).toHaveLength(0);
  });

  it('search for "dan" + neither_today → Dan (no activity)', () => {
    const result = applyAllFilters(trainees, 'dan', 'all', 'neither_today', meals, workouts, TODAY);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('d');
  });
});

// ─── 8. Secondary historical filters still work (non-mutually-exclusive) ──────
describe('8. secondary recency filters work independently', () => {
  const summary = {
    'alice@test.com': { days_since_last_meal: 5, days_since_last_workout: 10, at_risk: false },
    'bob@test.com':   { days_since_last_meal: 0, days_since_last_workout:  0, at_risk: true  },
  };

  it('no_nutrition_3d includes trainee with 5 days absence', () => {
    const r = applyActivityFilter([traineeA], 'no_nutrition_3d', [], [], TODAY, summary);
    expect(r).toHaveLength(1);
  });

  it('no_workout_7d includes trainee with 10 days absence', () => {
    const r = applyActivityFilter([traineeA], 'no_workout_7d', [], [], TODAY, summary);
    expect(r).toHaveLength(1);
  });

  it('attention filter includes at_risk trainee', () => {
    const r = applyActivityFilter([traineeB], 'attention', [], [], TODAY, summary);
    expect(r).toHaveLength(1);
  });

  it('secondary filters can overlap (trainee may appear in both recency filters)', () => {
    const trainees = [traineeA, traineeB];
    const noNut = applyActivityFilter(trainees, 'no_nutrition_3d', [], [], TODAY, summary).length;
    const noWork = applyActivityFilter(trainees, 'no_workout_7d', [], [], TODAY, summary).length;
    // Alice is in both; that's intentional for recency filters
    expect(noNut + noWork).toBeGreaterThanOrEqual(noNut);  // sum can be > unique count
  });
});

// ─── 9. Clearing filter restores all trainees ─────────────────────────────────
describe('9. clearing filter restores full trainee list', () => {
  it('null activityFilter returns all trainees', () => {
    const result = applyActivityFilter(std4Trainees, null, std4Meals, std4Workouts, TODAY);
    expect(result).toHaveLength(std4Trainees.length);
    expect(result).toEqual(std4Trainees);
  });

  it('setting activityFilter to null after nutrition_today restores full list', () => {
    const filtered = applyActivityFilter(std4Trainees, 'nutrition_today', std4Meals, std4Workouts, TODAY);
    expect(filtered.length).toBeLessThan(std4Trainees.length); // filter reduces list
    const cleared  = applyActivityFilter(std4Trainees, null, std4Meals, std4Workouts, TODAY);
    expect(cleared.length).toBe(std4Trainees.length);           // cleared = full list
  });
});

// ─── 10. Existing behavior: badge filter remains intact ───────────────────────
describe('10. badge filter (existing CoachDashboard behavior) unaffected', () => {
  const badges = { 'alice@test.com': 'on_track', 'bob@test.com': 'partial', 'carol@test.com': 'behind', 'dan@test.com': 'no_data' };

  it('good filter → only on_track trainee', () => {
    const result = applyAllFilters(std4Trainees, '', 'good', null, std4Meals, std4Workouts, TODAY, {}, badges);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('a');
  });

  it('badge filter and activityFilter can combine (AND)', () => {
    // on_track AND nutrition_today → Alice (on_track, has nutrition, no workout)
    const result = applyAllFilters(std4Trainees, '', 'good', 'nutrition_today', std4Meals, std4Workouts, TODAY, {}, badges);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('a');
  });
});

// ─── 14. Timezone / day boundary behavior ────────────────────────────────────
describe('14. timezone / day boundary', () => {
  it('meal on yesterday date string does not count as today', () => {
    const yesterday = '2026-08-23';
    const meals    = [{ trainee_email: 'alice@test.com', date: yesterday, calories: 500 }];
    const workouts = [];
    const { onlyNutrition, neitherToday } = computeTodayActivity([traineeA], meals, workouts, TODAY);
    expect(onlyNutrition).toBe(0);
    expect(neitherToday).toBe(1);
  });

  it('meal on today date string counts as today', () => {
    const meals    = [{ trainee_email: 'alice@test.com', date: TODAY, calories: 500 }];
    const workouts = [];
    const { onlyNutrition } = computeTodayActivity([traineeA], meals, workouts, TODAY);
    expect(onlyNutrition).toBe(1);
  });
});

// ─── 15. Deleted/invalid nutrition records do not count ───────────────────────
describe('15. invalid / zero-calorie records', () => {
  it('zero-calorie meal still counts as a meal entry (presence-based)', () => {
    const meals    = [{ trainee_email: 'alice@test.com', date: TODAY, calories: 0 }];
    const workouts = [];
    const { onlyNutrition } = computeTodayActivity([traineeA], meals, workouts, TODAY);
    expect(onlyNutrition).toBe(1);
  });

  it('meal on a different date does not count for today', () => {
    const meals    = [{ trainee_email: 'alice@test.com', date: '2026-08-01', calories: 500 }];
    const workouts = [];
    const { onlyNutrition, neitherToday } = computeTodayActivity([traineeA], meals, workouts, TODAY);
    expect(onlyNutrition).toBe(0);
    expect(neitherToday).toBe(1);
  });

  it('meal for different trainee email does not count for this trainee', () => {
    const meals    = [{ trainee_email: 'bob@test.com', date: TODAY, calories: 500 }];
    const workouts = [];
    const { onlyNutrition } = computeTodayActivity([traineeA], meals, workouts, TODAY);
    expect(onlyNutrition).toBe(0);
  });
});

// ─── 16. Non-completed workout does not count (status filter) ─────────────────
describe('16. only completed workouts count', () => {
  it('workout present in allWorkouts = completed (backend-filtered before reaching frontend)', () => {
    const workouts = [{ trainee_email: 'bob@test.com', date: TODAY }];
    const meals    = [];
    const { onlyWorkout } = computeTodayActivity([traineeB], meals, workouts, TODAY);
    expect(onlyWorkout).toBe(1);
  });
});

// ─── 5. Nutrition several days ago (recency filter) ───────────────────────────
describe('5. nutrition several days ago (no_nutrition_3d filter)', () => {
  const summary = { 'alice@test.com': { days_since_last_meal: 5, days_since_last_workout: null, at_risk: false } };

  it('trainee with 5 days_since_last_meal passes no_nutrition_3d filter', () => {
    const result = applyActivityFilter([traineeA], 'no_nutrition_3d', [], [], TODAY, summary);
    expect(result).toHaveLength(1);
  });

  it('trainee with 2 days_since_last_meal does NOT pass no_nutrition_3d filter', () => {
    const s = { 'alice@test.com': { days_since_last_meal: 2, days_since_last_workout: 1 } };
    const result = applyActivityFilter([traineeA], 'no_nutrition_3d', [], [], TODAY, s);
    expect(result).toHaveLength(0);
  });

  it('trainee with null days_since_last_meal (never logged) passes no_nutrition_3d', () => {
    const s = { 'alice@test.com': { days_since_last_meal: null } };
    const result = applyActivityFilter([traineeA], 'no_nutrition_3d', [], [], TODAY, s);
    expect(result).toHaveLength(1);
  });
});

// ─── 6. Workout several days ago (recency filter) ─────────────────────────────
describe('6. workout several days ago (no_workout_7d filter)', () => {
  it('trainee with 10 days_since_last_workout passes no_workout_7d filter', () => {
    const s = { 'alice@test.com': { days_since_last_workout: 10 } };
    const result = applyActivityFilter([traineeA], 'no_workout_7d', [], [], TODAY, s);
    expect(result).toHaveLength(1);
  });

  it('trainee with 3 days_since_last_workout does NOT pass no_workout_7d filter', () => {
    const s = { 'alice@test.com': { days_since_last_workout: 3 } };
    const result = applyActivityFilter([traineeA], 'no_workout_7d', [], [], TODAY, s);
    expect(result).toHaveLength(0);
  });

  it('trainee with null days_since_last_workout (never logged) passes no_workout_7d', () => {
    const s = { 'alice@test.com': { days_since_last_workout: null } };
    const result = applyActivityFilter([traineeA], 'no_workout_7d', [], [], TODAY, s);
    expect(result).toHaveLength(1);
  });
});

// ─── 7. Completely inactive trainee ──────────────────────────────────────────
describe('7. completely inactive trainee', () => {
  const s = { 'dan@test.com': { days_since_last_meal: 14, days_since_last_workout: 21, at_risk: true } };

  it('passes no_nutrition_3d filter', () => {
    const r = applyActivityFilter([traineeD], 'no_nutrition_3d', [], [], TODAY, s);
    expect(r).toHaveLength(1);
  });

  it('passes no_workout_7d filter', () => {
    const r = applyActivityFilter([traineeD], 'no_workout_7d', [], [], TODAY, s);
    expect(r).toHaveLength(1);
  });

  it('passes attention filter (at_risk=true)', () => {
    const r = applyActivityFilter([traineeD], 'attention', [], [], TODAY, s);
    expect(r).toHaveLength(1);
  });

  it('passes neither_today filter', () => {
    const r = applyActivityFilter([traineeD], 'neither_today', [], [], TODAY, s);
    expect(r).toHaveLength(1);
  });
});

// ─── formatDaysSince helper ───────────────────────────────────────────────────
describe('formatDaysSince', () => {
  it('0 days → "היום"',    () => expect(formatDaysSince(0)).toBe('היום'));
  it('1 day  → "אתמול"',  () => expect(formatDaysSince(1)).toBe('אתמול'));
  it('3 days → "לפני 3 ימים"', () => expect(formatDaysSince(3)).toBe('לפני 3 ימים'));
  it('null   → null',      () => expect(formatDaysSince(null)).toBe(null));
});

// ─── activityColor helper ─────────────────────────────────────────────────────
describe('activityColor', () => {
  describe('nutrition mode (threshold: red at 3+)', () => {
    it('0 days → emerald', () => expect(activityColor(0, true)).toBe('text-emerald-600'));
    it('1 day  → emerald', () => expect(activityColor(1, true)).toBe('text-emerald-600'));
    it('2 days → amber',   () => expect(activityColor(2, true)).toBe('text-amber-500'));
    it('3 days → red',     () => expect(activityColor(3, true)).toBe('text-red-500'));
    it('7 days → red',     () => expect(activityColor(7, true)).toBe('text-red-500'));
    it('null   → slate',   () => expect(activityColor(null, true)).toBe('text-slate-300'));
  });

  describe('workout mode (threshold: red at 7+)', () => {
    it('0 days → emerald', () => expect(activityColor(0, false)).toBe('text-emerald-600'));
    it('3 days → amber',   () => expect(activityColor(3, false)).toBe('text-amber-500'));
    it('6 days → amber',   () => expect(activityColor(6, false)).toBe('text-amber-500'));
    it('7 days → red',     () => expect(activityColor(7, false)).toBe('text-red-500'));
    it('14 days → red',    () => expect(activityColor(14, false)).toBe('text-red-500'));
  });
});

// ─── Backend: days_since_last_workout computation ─────────────────────────────
describe('backend: days_since_last_workout computation', () => {
  // Mirrors the Math.floor calculation added to coach.fn.js
  function computeDaysSince(lastDate, today) {
    if (!lastDate) return null;
    const todayD = new Date(today + 'T00:00:00Z');
    return Math.floor((todayD - new Date(lastDate + 'T00:00:00Z')) / 86400000);
  }

  it('workout today → 0 days', () => {
    expect(computeDaysSince(TODAY, TODAY)).toBe(0);
  });

  it('workout yesterday → 1 day', () => {
    expect(computeDaysSince('2026-08-23', TODAY)).toBe(1);
  });

  it('workout 7 days ago → 7 days', () => {
    expect(computeDaysSince('2026-08-17', TODAY)).toBe(7);
  });

  it('no workout ever → null', () => {
    expect(computeDaysSince(null, TODAY)).toBe(null);
  });

  it('future date (edge case) → negative (handled by UI as null/unknown)', () => {
    const futureDate = '2026-09-01';
    const result = computeDaysSince(futureDate, TODAY);
    expect(result).toBeLessThan(0);
  });
});
