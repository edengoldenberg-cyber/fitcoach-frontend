/**
 * healthScore.js
 *
 * Pure computation module for trainee Health Score (0–100).
 *
 * Weights (locked in spec v4):
 *   Nutrition  35%  — compound adherence (days logged × avg % of calorie target)
 *   Workouts   35%  — sessions this week vs. target (default 3)
 *   Water      15%  — days hitting water target
 *   Reporting  15%  — days with ≥1 meal entry
 *
 * Rules (locked):
 *   - Score suppressed (null) when trainee has < 3 days of any entry this week
 *   - Week boundary: Sunday 00:00 → Saturday 23:59, Israel time
 *   - All date strings are YYYY-MM-DD in Israel timezone
 *   - Default workout target: 3 sessions/week
 *   - 30-day trend: current week vs. average of prior 3 weeks
 *   - Trend threshold: ±5 percentage points (or ±0.3 sessions for workouts)
 *
 * No side effects. No React. No API calls. Safe to import anywhere.
 */

// ─── Constants ────────────────────────────────────────────────────────────────

export const WEIGHTS = {
  nutrition: 0.35,
  workout:   0.35,
  water:     0.15,
  reporting: 0.15,
};

export const DEFAULT_WORKOUT_TARGET = 3;
export const MIN_ACTIVE_DAYS = 3;       // below this → score suppressed
export const TREND_THRESHOLD_PP = 5;    // percentage-point delta to show ↑ or ↓
export const TREND_THRESHOLD_SESSIONS = 0.3;

export const SCORE_BANDS = [
  { min: 80,  label: 'מצוין',         color: 'green'  },
  { min: 60,  label: 'טוב',           color: 'blue'   },
  { min: 40,  label: 'בינוני',        color: 'amber'  },
  { min: 20,  label: 'נמוך',          color: 'orange' },
  { min: 0,   label: 'קריטי',         color: 'red'    },
];

// ─── Date helpers (Israel timezone, no external dependency) ───────────────────

/**
 * Returns a YYYY-MM-DD string in Israel timezone for the given Date.
 * Duplicates nutritionSync.getIsraelDateString to keep this module dependency-free.
 */
export function toIsraelDateString(date = new Date()) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Jerusalem',
    year:     'numeric',
    month:    '2-digit',
    day:      '2-digit',
  }).format(date);
}

/**
 * Returns the Sunday–Saturday week boundaries (as YYYY-MM-DD strings in
 * Israel time) that contain `referenceDate`.
 */
export function getWeekBoundaries(referenceDate = new Date()) {
  const israelStr = toIsraelDateString(referenceDate);
  const base = new Date(israelStr + 'T00:00:00Z'); // treat as UTC midnight

  // day-of-week for the Israel date string
  const dow = base.getUTCDay(); // 0 = Sunday

  const sunday = new Date(base);
  sunday.setUTCDate(base.getUTCDate() - dow);

  const saturday = new Date(sunday);
  saturday.setUTCDate(sunday.getUTCDate() + 6);

  return {
    weekStart: sunday.toISOString().slice(0, 10),
    weekEnd:   saturday.toISOString().slice(0, 10),
  };
}

/**
 * Returns an array of 7 YYYY-MM-DD strings from weekStart to weekStart+6.
 */
export function getWeekDayStrings(weekStart) {
  const days = [];
  const base = new Date(weekStart + 'T00:00:00Z');
  for (let i = 0; i < 7; i++) {
    const d = new Date(base);
    d.setUTCDate(base.getUTCDate() + i);
    days.push(d.toISOString().slice(0, 10));
  }
  return days;
}

/**
 * Returns all YYYY-MM-DD strings in [start, end] inclusive.
 */
export function dateRange(start, end) {
  const days = [];
  const s = new Date(start + 'T00:00:00Z');
  const e = new Date(end   + 'T00:00:00Z');
  for (const d = new Date(s); d <= e; d.setUTCDate(d.getUTCDate() + 1)) {
    days.push(d.toISOString().slice(0, 10));
  }
  return days;
}

/**
 * Returns the boundaries for N complete weeks ending just before `weekStart`.
 * Used for 30-day trend baseline (3 prior weeks).
 */
export function getPriorWeekBoundaries(weekStart, count = 3) {
  const weeks = [];
  const base = new Date(weekStart + 'T00:00:00Z');
  for (let i = count; i >= 1; i--) {
    const sun = new Date(base);
    sun.setUTCDate(base.getUTCDate() - i * 7);
    const sat = new Date(sun);
    sat.setUTCDate(sun.getUTCDate() + 6);
    weeks.push({
      weekStart: sun.toISOString().slice(0, 10),
      weekEnd:   sat.toISOString().slice(0, 10),
    });
  }
  return weeks;
}

// ─── Data adapters ────────────────────────────────────────────────────────────

/**
 * Filters records to those whose `.date` field falls in [start, end] inclusive.
 * Records without a `.date` are excluded.
 */
export function filterByDateRange(records, start, end) {
  if (!Array.isArray(records)) return [];
  return records.filter(r => {
    const d = r?.date ? String(r.date).slice(0, 10) : null;
    return d && d >= start && d <= end;
  });
}

/**
 * Groups records by their `.date` field.
 * Returns a plain object: { 'YYYY-MM-DD': record[] }
 */
export function groupByDate(records) {
  const map = {};
  for (const r of (records || [])) {
    const d = r?.date ? String(r.date).slice(0, 10) : null;
    if (!d) continue;
    if (!map[d]) map[d] = [];
    map[d].push(r);
  }
  return map;
}

/**
 * Returns total calories logged on a given day from a pre-grouped map.
 */
export function dailyCalories(dayMap, dateStr) {
  const entries = dayMap[dateStr] || [];
  return entries.reduce((sum, m) => sum + (Number(m.calories) || 0), 0);
}

/**
 * Returns total water logged on a given day from a pre-grouped map.
 */
export function dailyWater(dayMap, dateStr) {
  const entries = dayMap[dateStr] || [];
  return entries.reduce((sum, w) => sum + (Number(w.amount_ml) || 0), 0);
}

// ─── Score components ─────────────────────────────────────────────────────────

/**
 * Nutrition score (0–100).
 *
 * Compound: (days with any entry / 7) × (avg % of calorie target on those days)
 * The second factor is the average of (day_calories / targetCalories) capped at 1.0,
 * computed only over days that have at least one meal entry.
 *
 * @param {object[]} meals         MealEntry records for the week
 * @param {number}   targetCalories  trainee.target_calories (default 2000)
 * @param {string[]} weekDays      7 YYYY-MM-DD strings (Sun–Sat)
 * @returns {number} 0–100
 */
export function computeNutritionScore(meals, targetCalories, weekDays) {
  const target = Math.max(1, Number(targetCalories) || 2000);
  const byDay  = groupByDate(meals);
  const daysWithEntry = weekDays.filter(d => (byDay[d] || []).length > 0);

  if (daysWithEntry.length === 0) return 0;

  const avgPct = daysWithEntry.reduce((sum, d) => {
    const pct = Math.min(dailyCalories(byDay, d) / target, 1.0);
    return sum + pct;
  }, 0) / daysWithEntry.length;

  const compound = (daysWithEntry.length / weekDays.length) * avgPct;
  return Math.round(Math.min(compound * 100, 100));
}

/**
 * Workout score (0–100).
 *
 * sessions_this_week / target_sessions_per_week, capped at 1.0, × 100.
 *
 * @param {object[]} workouts           WorkoutSession records for the week
 * @param {number}   targetSessions     default 3
 * @param {string[]} weekDays           used only for consistency; workouts filtered by date
 * @returns {number} 0–100
 */
export function computeWorkoutScore(workouts, targetSessions, weekDays) {
  const target   = Math.max(1, Number(targetSessions) || DEFAULT_WORKOUT_TARGET);
  const weekSet  = new Set(weekDays);
  const sessions = (workouts || []).filter(w => {
    const d = w?.date ? String(w.date).slice(0, 10) : null;
    return d && weekSet.has(d);
  }).length;

  return Math.round(Math.min(sessions / target, 1.0) * 100);
}

/**
 * Water score (0–100).
 *
 * Days this week where total water_logged_ml ≥ water_target_ml / 7 × 100.
 *
 * @param {object[]} waterEntries    WaterEntry records for the week
 * @param {number}   waterTargetMl  trainee.water_target_ml (default 3000)
 * @param {string[]} weekDays
 * @returns {number} 0–100
 */
export function computeWaterScore(waterEntries, waterTargetMl, weekDays) {
  const target = Math.max(1, Number(waterTargetMl) || 3000);
  const byDay  = groupByDate(waterEntries);
  const daysHit = weekDays.filter(d => dailyWater(byDay, d) >= target).length;
  return Math.round((daysHit / weekDays.length) * 100);
}

/**
 * Reporting score (0–100).
 *
 * Days with ≥1 meal entry / 7 × 100.
 *
 * @param {object[]} meals    MealEntry records for the week
 * @param {string[]} weekDays
 * @returns {number} 0–100
 */
export function computeReportingScore(meals, weekDays) {
  const byDay = groupByDate(meals);
  const daysReported = weekDays.filter(d => (byDay[d] || []).length > 0).length;
  return Math.round((daysReported / weekDays.length) * 100);
}

/**
 * Combines the four component scores into a single Health Score.
 *
 * @param {{ nutrition, workout, water, reporting }} components — each 0–100
 * @returns {number} 0–100
 */
export function computeHealthScore({ nutrition, workout, water, reporting }) {
  return Math.round(
    nutrition  * WEIGHTS.nutrition +
    workout    * WEIGHTS.workout   +
    water      * WEIGHTS.water     +
    reporting  * WEIGHTS.reporting
  );
}

// ─── Suppression check ────────────────────────────────────────────────────────

/**
 * Returns true when the trainee has enough data for a meaningful score.
 * Rule: ≥ MIN_ACTIVE_DAYS days with any entry (meal OR water) in weekDays.
 */
export function hasMinimumData(meals, waterEntries, weekDays) {
  const mealDays  = new Set(
    (meals || []).map(m => m?.date ? String(m.date).slice(0, 10) : null).filter(Boolean)
  );
  const waterDays = new Set(
    (waterEntries || []).map(w => w?.date ? String(w.date).slice(0, 10) : null).filter(Boolean)
  );
  const activeDays = weekDays.filter(d => mealDays.has(d) || waterDays.has(d));
  return activeDays.length >= MIN_ACTIVE_DAYS;
}

// ─── Score band ───────────────────────────────────────────────────────────────

/**
 * Returns the label and color for a given score.
 * Returns null when score is null (suppressed).
 */
export function getScoreBand(score) {
  if (score === null || score === undefined) return null;
  for (const band of SCORE_BANDS) {
    if (score >= band.min) return { label: band.label, color: band.color };
  }
  return SCORE_BANDS[SCORE_BANDS.length - 1];
}

// ─── Full trainee computation ─────────────────────────────────────────────────

/**
 * Computes the full Health Score result for one trainee.
 *
 * @param {object} trainee
 *   { target_calories, water_target_ml, target_sessions_per_week }
 * @param {object} data
 *   { meals: MealEntry[], waterEntries: WaterEntry[], workouts: WorkoutSession[] }
 *   All records should already be for the relevant week; this function filters
 *   by weekDays as a safety net.
 * @param {Date} [referenceDate=new Date()]
 *
 * @returns {{
 *   score:       number | null,
 *   suppressed:  boolean,
 *   components:  { nutrition, workout, water, reporting },
 *   band:        { label, color } | null,
 *   weekStart:   string,
 *   weekEnd:     string,
 * }}
 */
export function computeScoreForTrainee(trainee, { meals = [], waterEntries = [], workouts = [] }, referenceDate = new Date()) {
  const { weekStart, weekEnd } = getWeekBoundaries(referenceDate);
  const weekDays = getWeekDayStrings(weekStart);

  const weekMeals    = filterByDateRange(meals,        weekStart, weekEnd);
  const weekWater    = filterByDateRange(waterEntries, weekStart, weekEnd);
  const weekWorkouts = filterByDateRange(workouts,     weekStart, weekEnd);

  const suppressed = !hasMinimumData(weekMeals, weekWater, weekDays);

  if (suppressed) {
    return {
      score:      null,
      suppressed: true,
      components: { nutrition: null, workout: null, water: null, reporting: null },
      band:       null,
      weekStart,
      weekEnd,
    };
  }

  const components = {
    nutrition:  computeNutritionScore(weekMeals,    trainee?.target_calories,          weekDays),
    workout:    computeWorkoutScore(weekWorkouts,    trainee?.target_sessions_per_week, weekDays),
    water:      computeWaterScore(weekWater,         trainee?.water_target_ml,          weekDays),
    reporting:  computeReportingScore(weekMeals,                                        weekDays),
  };

  const score = computeHealthScore(components);

  return {
    score,
    suppressed: false,
    components,
    band: getScoreBand(score),
    weekStart,
    weekEnd,
  };
}

// ─── 30-day trend ─────────────────────────────────────────────────────────────

/**
 * Computes the trend direction for a single numeric metric.
 *
 * @param {number|null} current        — this week's value (0–100 or session count)
 * @param {number[]}    priorValues    — values from prior weeks (empty = no history)
 * @param {number}      [threshold]    — default TREND_THRESHOLD_PP
 *
 * @returns {{ direction: 'up'|'stable'|'down', delta: number, baseline: number|null }}
 */
export function computeTrend(current, priorValues, threshold = TREND_THRESHOLD_PP) {
  if (current === null || current === undefined) {
    return { direction: 'stable', delta: 0, baseline: null };
  }

  const validPriors = (priorValues || []).filter(v => v !== null && v !== undefined);

  if (validPriors.length === 0) {
    return { direction: 'stable', delta: 0, baseline: null };
  }

  const baseline = validPriors.reduce((s, v) => s + v, 0) / validPriors.length;
  const delta    = current - baseline;

  let direction;
  if (delta > threshold)       direction = 'up';
  else if (delta < -threshold) direction = 'down';
  else                         direction = 'stable';

  return { direction, delta: Math.round(delta * 10) / 10, baseline: Math.round(baseline * 10) / 10 };
}

/**
 * Computes 30-day trends for all score components and overall Health Score.
 *
 * Splits history into 4 × 7-day windows (current week + 3 prior weeks),
 * computes component scores for each prior week, then calls computeTrend.
 *
 * @param {object} trainee
 * @param {object} data     { meals, waterEntries, workouts } — all records from last 30 days
 * @param {Date}   [referenceDate=new Date()]
 *
 * @returns {{
 *   healthScore: TrendResult,
 *   nutrition:   TrendResult,
 *   workout:     TrendResult,
 *   water:       TrendResult,
 *   reporting:   TrendResult,
 *   hasSufficientHistory: boolean,   — true when ≥2 prior weeks have data
 * }}
 */
export function computeTrendsForTrainee(trainee, { meals = [], waterEntries = [], workouts = [] }, referenceDate = new Date()) {
  const { weekStart, weekEnd } = getWeekBoundaries(referenceDate);
  const weekDays = getWeekDayStrings(weekStart);
  const priorWeeks = getPriorWeekBoundaries(weekStart, 3);

  // Current week scores
  const current = computeScoreForTrainee(
    trainee,
    { meals, waterEntries, workouts },
    referenceDate
  );

  // Prior weeks: compute component scores for each
  const priorScores = priorWeeks.map(({ weekStart: ws, weekEnd: we }) => {
    const days    = getWeekDayStrings(ws);
    const wMeals  = filterByDateRange(meals,        ws, we);
    const wWater  = filterByDateRange(waterEntries, ws, we);
    const wWork   = filterByDateRange(workouts,     ws, we);
    const suppressed = !hasMinimumData(wMeals, wWater, days);
    if (suppressed) return null;
    const components = {
      nutrition:  computeNutritionScore(wMeals,  trainee?.target_calories,          days),
      workout:    computeWorkoutScore(wWork,      trainee?.target_sessions_per_week, days),
      water:      computeWaterScore(wWater,       trainee?.water_target_ml,          days),
      reporting:  computeReportingScore(wMeals,                                       days),
    };
    return {
      ...components,
      healthScore: computeHealthScore(components),
    };
  });

  const validPriors = priorScores.filter(Boolean);
  const hasSufficientHistory = validPriors.length >= 2;

  const extract = key => validPriors.map(p => p[key]);

  return {
    healthScore: computeTrend(current.score,               extract('healthScore')),
    nutrition:   computeTrend(current.components.nutrition, extract('nutrition')),
    workout:     computeTrend(current.components.workout,   extract('workout'),   TREND_THRESHOLD_SESSIONS),
    water:       computeTrend(current.components.water,     extract('water')),
    reporting:   computeTrend(current.components.reporting, extract('reporting')),
    hasSufficientHistory,
  };
}
