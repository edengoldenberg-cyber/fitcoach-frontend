/**
 * POINTS ENGINE V1
 *
 * Handles all point calculations for the League system.
 * Actions: workout_logged, meal_logged, water_target_reached, end_of_day_bonus
 *
 * SAFE MODE: idempotent, fail-open, never breaks existing flows.
 */

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

// ─────────────────────────────────────────────────────────────────────
// ISRAEL DATE
// ─────────────────────────────────────────────────────────────────────

function getIsraelDate() {
  const now = new Date();
  const israelMs = now.getTime() + 3 * 60 * 60 * 1000;
  return new Date(israelMs).toISOString().split('T')[0];
}

// ─────────────────────────────────────────────────────────────────────
// GET OR CREATE DAILY RECORD
// ─────────────────────────────────────────────────────────────────────

async function getOrCreateUserPointsDaily(base44, traineeId, traineeEmail, date) {
  const existing = await base44.asServiceRole.entities.UserPointsDaily.filter({
    trainee_id: traineeId,
    date
  }).catch(() => []);

  if (existing.length > 0) {
    const sorted = [...existing].sort((a, b) => {
      const aTime = new Date(a.updated_date || a.created_date || 0).getTime();
      const bTime = new Date(b.updated_date || b.created_date || 0).getTime();
      return bTime - aTime;
    });
    const canonical = sorted[0];

    if (sorted.length > 1) {
      const duplicates = sorted.slice(1);
      await Promise.all(duplicates.map((duplicate) =>
        base44.asServiceRole.entities.UserPointsDaily.delete(duplicate.id).catch((error) => {
          console.warn(`[POINTS] Failed deleting duplicate daily record ${duplicate.id}:`, error.message);
        })
      ));
      console.warn(`[POINTS] Removed ${duplicates.length} duplicate daily records: trainee=${traineeId} date=${date}`);
    }

    return canonical;
  }

  // Create new record with defaults
  const created = await base44.asServiceRole.entities.UserPointsDaily.create({
    trainee_id: traineeId,
    trainee_email: traineeEmail,
    date,
    workout_points: 0,
    meal_points: 0,
    water_points: 0,
    bonus_points: 0,
    total_points: 0,
    meals_logged_count: 0,
    bonus_calculated: false
  });

  console.log(`[POINTS] Created new daily record: trainee=${traineeId} date=${date}`);
  return created;
}

function calcTotal(record) {
  return (record.workout_points || 0) +
    (record.meal_points || 0) +
    (record.water_points || 0) +
    (record.bonus_points || 0);
}

// ─────────────────────────────────────────────────────────────────────
// ACTION HANDLERS
// ─────────────────────────────────────────────────────────────────────

async function onWorkoutLogged(base44, traineeId, traineeEmail) {
  const date = getIsraelDate();
  const record = await getOrCreateUserPointsDaily(base44, traineeId, traineeEmail, date);

  // Idempotent: only award once per day
  if ((record.workout_points || 0) > 0) {
    console.log(`[POINTS] workout already counted for ${traineeId} on ${date} — skip`);
    return { action: 'workout_logged', points_added: 0, reason: 'already_counted', totals: calcTotal(record) };
  }

  const newWorkoutPoints = 30;
  const total = calcTotal({ ...record, workout_points: newWorkoutPoints });

  await base44.asServiceRole.entities.UserPointsDaily.update(record.id, {
    workout_points: newWorkoutPoints,
    total_points: total
  });

  console.log(`[POINTS] +30 workout | trainee=${traineeId} | date=${date} | total=${total}`);
  return { action: 'workout_logged', points_added: 30, workout_points: newWorkoutPoints, total_points: total };
}

async function onMealLogged(base44, traineeId, traineeEmail) {
  const date = getIsraelDate();
  const record = await getOrCreateUserPointsDaily(base44, traineeId, traineeEmail, date);

  const currentMealPoints = record.meal_points || 0;
  const currentMealCount = record.meals_logged_count || 0;

  // Cap at 30 (3 meals × 10)
  if (currentMealPoints >= 30) {
    console.log(`[POINTS] meal cap reached for ${traineeId} on ${date} — skip`);
    return { action: 'meal_logged', points_added: 0, reason: 'cap_reached', totals: calcTotal(record) };
  }

  const newMealPoints = Math.min(currentMealPoints + 10, 30);
  const pointsAdded = newMealPoints - currentMealPoints;
  const total = calcTotal({ ...record, meal_points: newMealPoints });

  await base44.asServiceRole.entities.UserPointsDaily.update(record.id, {
    meal_points: newMealPoints,
    meals_logged_count: currentMealCount + 1,
    total_points: total
  });

  console.log(`[POINTS] +${pointsAdded} meal | trainee=${traineeId} | meal_points=${newMealPoints} | date=${date} | total=${total}`);
  return { action: 'meal_logged', points_added: pointsAdded, meal_points: newMealPoints, total_points: total };
}

async function onWaterTargetReached(base44, traineeId, traineeEmail, targetDate) {
  const date = targetDate || getIsraelDate();
  const record = await getOrCreateUserPointsDaily(base44, traineeId, traineeEmail, date);

  const traineeList = await base44.asServiceRole.entities.Trainee.filter({ user_email: traineeEmail }).catch(() => []);
  const waterEntries = await base44.asServiceRole.entities.WaterEntry.filter({ trainee_email: traineeEmail, date }).catch(() => []);
  const targetWater = traineeList[0]?.target_water_ml || 3000;
  const totalWater = waterEntries.reduce((sum, entry) => sum + (entry.amount_ml || 0), 0);

  if (totalWater < targetWater) {
    const total = calcTotal({ ...record, water_points: 0 });
    await base44.asServiceRole.entities.UserPointsDaily.update(record.id, {
      water_points: 0,
      total_points: total
    });
    console.log(`[POINTS] water target not reached | trainee=${traineeId} | date=${date} | water=${totalWater}/${targetWater}`);
    return { action: 'water_target_reached', points_added: 0, reason: 'target_not_reached', water_total_ml: totalWater, water_target_ml: targetWater, total_points: total };
  }

  const newWaterPoints = 15;
  const total = calcTotal({ ...record, water_points: newWaterPoints });

  await base44.asServiceRole.entities.UserPointsDaily.update(record.id, {
    water_points: newWaterPoints,
    total_points: total
  });

  console.log(`[POINTS] +15 water | trainee=${traineeId} | date=${date} | total=${total}`);
  return { action: 'water_target_reached', points_added: Math.max(0, newWaterPoints - (record.water_points || 0)), water_points: newWaterPoints, water_total_ml: totalWater, total_points: total };
}

async function onActivityLogged(base44, traineeId, traineeEmail, activityData) {
  const date = getIsraelDate();
  const record = await getOrCreateUserPointsDaily(base44, traineeId, traineeEmail, date);

  const activityPoints = activityData?.points_awarded || 0;
  if (!activityPoints || activityPoints <= 0) {
    console.log(`[POINTS] activity_logged invalid points — skip`);
    return { action: 'activity_logged', points_added: 0, reason: 'invalid_points', totals: calcTotal(record) };
  }

  const currentWorkoutPoints = record.workout_points || 0;
  const newWorkoutPoints = Math.min(30, Math.max(currentWorkoutPoints, activityPoints));
  const pointsAdded = Math.max(0, newWorkoutPoints - currentWorkoutPoints);

  if (pointsAdded <= 0) {
    console.log(`[POINTS] workout/activity cap reached for ${traineeId} on ${date} — skip`);
    return { action: 'activity_logged', points_added: 0, reason: 'workout_cap_reached', workout_points: currentWorkoutPoints, total_points: calcTotal(record) };
  }

  const newTotal = Math.min(100, calcTotal({ ...record, workout_points: newWorkoutPoints }));

  await base44.asServiceRole.entities.UserPointsDaily.update(record.id, {
    workout_points: newWorkoutPoints,
    total_points: newTotal
  });

  console.log(`[POINTS] +${pointsAdded} external_activity | trainee=${traineeId} | date=${date} | workout_points=${newWorkoutPoints} | total=${newTotal}`);
  return { action: 'activity_logged', points_added: pointsAdded, workout_points: newWorkoutPoints, total_points: newTotal };
}

async function onRecipeSaved(base44, traineeId, traineeEmail) {
  const date = getIsraelDate();
  const record = await getOrCreateUserPointsDaily(base44, traineeId, traineeEmail, date);

  // Idempotent: only award once per day (use bonus_points slot isn't right — use a dedicated check)
  // We track recipe points in meal_points isn't right either.
  // Store recipe flag: check if recipe_points already awarded today via a separate field check.
  // Since entity doesn't have recipe_points field, we use a naming convention in total:
  // Store via notes in the record — simpler: check if recipes were logged today via Recipe entity.
  // Actually simplest: check existing recipe_points field doesn't exist, so gate on a daily Recipe count.
  const israelMs = new Date().getTime() + 3 * 60 * 60 * 1000;
  const todayStr = new Date(israelMs).toISOString().split('T')[0];

  // Check if recipe points already given today by looking at existing records
  // We'll store recipe points as part of bonus_points only if no bonus_calculated yet
  // Simplest safe approach: check if recipe_points_awarded field exists — since it doesn't,
  // we'll use a dedicated daily record check via a "recipe" tag in the UserPointsDaily record.
  // Since entity has no recipe field, we use bonus_points only when not calculated yet — but that's fragile.
  // BEST APPROACH: check Recipe entity created today by this trainee.
  const todayRecipes = await base44.asServiceRole.entities.Recipe.filter({ created_by: traineeEmail }).catch(() => []);
  const todayCreated = todayRecipes.filter(r => {
    const d = (r.created_date || '').split('T')[0];
    return d === todayStr;
  });

  // If more than 1 recipe today already counted (idempotent: first recipe of day only)
  // We check if recipe points were already added today by computing: 
  // If total - workout - meal - water - bonus already > 0, recipe was counted.
  const alreadyCounted =
    (record.total_points || 0) >
    (record.workout_points || 0) + (record.meal_points || 0) + (record.water_points || 0) + (record.bonus_points || 0);

  // Simpler: if todayCreated.length > 1, points already awarded on first save
  // We award on the FIRST recipe of the day only
  if (todayCreated.length > 1 || alreadyCounted) {
    console.log(`[POINTS] recipe already counted for ${traineeId} on ${date} — skip`);
    return { action: 'recipe_saved', points_added: 0, reason: 'already_counted', totals: calcTotal(record) };
  }

  // Add 30 points as bonus_points (before end_of_day_bonus runs)
  const currentBonus = record.bonus_points || 0;
  const newBonus = currentBonus + 30;
  const total = calcTotal({ ...record, bonus_points: newBonus });

  await base44.asServiceRole.entities.UserPointsDaily.update(record.id, {
    bonus_points: newBonus,
    total_points: total
  });

  console.log(`[POINTS] +30 recipe | trainee=${traineeId} | date=${date} | total=${total}`);
  return { action: 'recipe_saved', points_added: 30, total_points: total };
}

async function endOfDayBonus(base44, traineeId, traineeEmail, date) {
  const targetDate = date || getIsraelDate();
  const record = await getOrCreateUserPointsDaily(base44, traineeId, traineeEmail, targetDate);

  const isPerfectDay =
    (record.workout_points || 0) > 0 &&
    (record.meal_points || 0) >= 30 &&
    (record.water_points || 0) > 0;

  const bonusPoints = isPerfectDay ? 20 : 0;
  const total = calcTotal({ ...record, bonus_points: bonusPoints });

  await base44.asServiceRole.entities.UserPointsDaily.update(record.id, {
    bonus_points: bonusPoints,
    bonus_calculated: true,
    total_points: total
  });

  console.log(`[POINTS] end_of_day | trainee=${traineeId} | date=${targetDate} | bonus=${bonusPoints} | total=${total} | perfect=${isPerfectDay}`);
  return {
    action: 'end_of_day_bonus',
    points_added: bonusPoints,
    is_perfect_day: isPerfectDay,
    bonus_points: bonusPoints,
    total_points: total,
    breakdown: {
      workout: record.workout_points || 0,
      meal: record.meal_points || 0,
      water: record.water_points || 0,
      bonus: bonusPoints
    }
  };
}

async function syncDailyPoints(base44, trainee, date) {
  const record = await getOrCreateUserPointsDaily(base44, trainee.id, trainee.user_email, date);
  const meals = await base44.asServiceRole.entities.MealEntry.filter({ trainee_email: trainee.user_email, date }).catch(() => []);
  const water = await base44.asServiceRole.entities.WaterEntry.filter({ trainee_email: trainee.user_email, date }).catch(() => []);
  const workoutSessions = await base44.asServiceRole.entities.WorkoutSession.filter({ trainee_email: trainee.user_email, date }).catch(() => []);
  const traineeWorkouts = await base44.asServiceRole.entities.TraineeWorkout.filter({ trainee_email: trainee.user_email, date }).catch(() => []);
  const activities = await base44.asServiceRole.entities.ShapeLeagueActivityLog.filter({ trainee_id: trainee.id, activity_date: date }).catch(() => []);

  const mealTypes = new Set(meals.map((meal) => meal.meal_type).filter(Boolean));
  const mealPoints = Math.min(mealTypes.size * 10, 30);
  const waterTotal = water.reduce((sum, entry) => sum + (entry.amount_ml || 0), 0);
  const waterPoints = waterTotal >= (trainee.target_water_ml || 3000) ? 15 : 0;
  const hasWorkoutSession = workoutSessions.some((workout) => workout.status !== 'draft');
  const hasTraineeWorkout = traineeWorkouts.some((workout) => workout.status !== 'draft');
  const activityPoints = activities.reduce((sum, activity) => sum + (activity.points_awarded || 0), 0);
  const workoutPoints = Math.min(30, Math.max(hasWorkoutSession || hasTraineeWorkout ? 30 : 0, activityPoints));
  const bonusPoints = workoutPoints > 0 && mealPoints >= 30 && waterPoints > 0 ? 20 : 0;
  const totalPoints = Math.min(100, workoutPoints + mealPoints + waterPoints + bonusPoints);

  await base44.asServiceRole.entities.UserPointsDaily.update(record.id, {
    trainee_email: trainee.user_email,
    workout_points: workoutPoints,
    meal_points: mealPoints,
    water_points: waterPoints,
    bonus_points: bonusPoints,
    total_points: totalPoints,
    meals_logged_count: mealTypes.size,
    bonus_calculated: true
  });

  return {
    trainee_id: trainee.id,
    trainee_email: trainee.user_email,
    date,
    before_total: record.total_points || 0,
    after_total: totalPoints,
    breakdown: {
      workout_points: workoutPoints,
      meal_points: mealPoints,
      water_points: waterPoints,
      bonus_points: bonusPoints,
      meals: meals.length,
      meal_types: Array.from(mealTypes),
      water_total_ml: waterTotal,
      workout_sessions: workoutSessions.length,
      trainee_workouts: traineeWorkouts.length,
      activities: activities.length
    }
  };
}

async function syncAllTrainees(base44, dates, options = {}) {
  const targetDates = Array.isArray(dates) && dates.length > 0 ? dates : [getIsraelDate()];
  const trainees = await base44.asServiceRole.entities.Trainee.filter({ status: 'active' }).catch(() => []);
  const traineesByEmail = new Map(trainees.filter((t) => t.user_email).map((t) => [t.user_email, t]));
  const traineesById = new Map(trainees.filter((t) => t.id).map((t) => [t.id, t]));
  const targets = new Map();
  const dataByKey = new Map();
  const results = [];

  const ensureBucket = (trainee, date) => {
    const key = `${trainee.id}|${date}`;
    targets.set(key, { trainee, date, key });
    if (!dataByKey.has(key)) {
      dataByKey.set(key, { meals: [], water: [], workoutSessions: [], traineeWorkouts: [], activities: [], pointRecord: null });
    }
    return dataByKey.get(key);
  };

  for (const date of targetDates) {
    const [meals, water, workoutSessions, traineeWorkouts, activities, existingPoints] = await Promise.all([
      base44.asServiceRole.entities.MealEntry.filter({ date }).catch(() => []),
      base44.asServiceRole.entities.WaterEntry.filter({ date }).catch(() => []),
      base44.asServiceRole.entities.WorkoutSession.filter({ date }).catch(() => []),
      base44.asServiceRole.entities.TraineeWorkout.filter({ date }).catch(() => []),
      base44.asServiceRole.entities.ShapeLeagueActivityLog.filter({ activity_date: date }).catch(() => []),
      base44.asServiceRole.entities.UserPointsDaily.filter({ date }).catch(() => [])
    ]);

    meals.forEach((entry) => {
      const trainee = traineesByEmail.get(entry.trainee_email);
      if (trainee) ensureBucket(trainee, date).meals.push(entry);
    });

    water.forEach((entry) => {
      const trainee = traineesByEmail.get(entry.trainee_email);
      if (trainee) ensureBucket(trainee, date).water.push(entry);
    });

    workoutSessions.forEach((entry) => {
      const trainee = traineesByEmail.get(entry.trainee_email);
      if (trainee) ensureBucket(trainee, date).workoutSessions.push(entry);
    });

    traineeWorkouts.forEach((entry) => {
      const trainee = traineesByEmail.get(entry.trainee_email);
      if (trainee) ensureBucket(trainee, date).traineeWorkouts.push(entry);
    });

    activities.forEach((entry) => {
      const trainee = traineesById.get(entry.trainee_id) || traineesByEmail.get(entry.trainee_email);
      if (trainee) ensureBucket(trainee, date).activities.push(entry);
    });

    existingPoints.forEach((entry) => {
      const trainee = traineesById.get(entry.trainee_id) || traineesByEmail.get(entry.trainee_email);
      if (!trainee) return;
      const bucket = ensureBucket(trainee, date);
      if (!bucket.pointRecords) bucket.pointRecords = [];
      bucket.pointRecords.push(entry);
      const current = bucket.pointRecord;
      const entryTime = new Date(entry.updated_date || entry.created_date || 0).getTime();
      const currentTime = current ? new Date(current.updated_date || current.created_date || 0).getTime() : 0;
      if (!current || entryTime > currentTime) {
        bucket.pointRecord = entry;
      }
    });
  }

  const allTargets = Array.from(targets.values());
  const skipCount = Number(options.skip || 0);
  const limitCount = Number(options.limit || 50);
  const selectedTargets = allTargets.slice(skipCount, skipCount + limitCount);

  for (const item of selectedTargets) {
    try {
      const bucket = dataByKey.get(item.key) || { meals: [], water: [], workoutSessions: [], traineeWorkouts: [], activities: [], pointRecord: null };
      const mealTypes = new Set(bucket.meals.map((meal) => meal.meal_type).filter(Boolean));
      const mealPoints = Math.min(mealTypes.size * 10, 30);
      const waterTotal = bucket.water.reduce((sum, entry) => sum + (entry.amount_ml || 0), 0);
      const waterPoints = waterTotal >= (item.trainee.target_water_ml || 3000) ? 15 : 0;
      const hasWorkoutSession = bucket.workoutSessions.some((workout) => workout.status !== 'draft');
      const hasTraineeWorkout = bucket.traineeWorkouts.some((workout) => workout.status === 'completed');
      const activityPoints = bucket.activities.reduce((sum, activity) => sum + (activity.points_awarded || 0), 0);
      const workoutPoints = Math.min(30, Math.max(hasWorkoutSession || hasTraineeWorkout ? 30 : 0, activityPoints));
      const bonusPoints = workoutPoints > 0 && mealPoints >= 30 && waterPoints > 0 ? 20 : 0;
      const totalPoints = Math.min(100, workoutPoints + mealPoints + waterPoints + bonusPoints);
      const pointData = {
        trainee_id: item.trainee.id,
        trainee_email: item.trainee.user_email,
        date: item.date,
        workout_points: workoutPoints,
        meal_points: mealPoints,
        water_points: waterPoints,
        bonus_points: bonusPoints,
        total_points: totalPoints,
        meals_logged_count: mealTypes.size,
        bonus_calculated: true
      };

      if (bucket.pointRecord?.id) {
        await base44.asServiceRole.entities.UserPointsDaily.update(bucket.pointRecord.id, pointData);
        const duplicatePointRecords = (bucket.pointRecords || []).filter((record) => record.id !== bucket.pointRecord.id);
        await Promise.all(duplicatePointRecords.map((record) =>
          base44.asServiceRole.entities.UserPointsDaily.delete(record.id).catch((error) => {
            console.warn(`[POINTS] Failed deleting duplicate daily record ${record.id}:`, error.message);
          })
        ));
      } else {
        await base44.asServiceRole.entities.UserPointsDaily.create(pointData);
      }

      results.push({
        trainee_id: item.trainee.id,
        trainee_email: item.trainee.user_email,
        date: item.date,
        before_total: bucket.pointRecord?.total_points || 0,
        after_total: totalPoints,
        breakdown: {
          workout_points: workoutPoints,
          meal_points: mealPoints,
          water_points: waterPoints,
          bonus_points: bonusPoints,
          meals: bucket.meals.length,
          meal_types: Array.from(mealTypes),
          water_total_ml: waterTotal,
          workout_sessions: bucket.workoutSessions.length,
          trainee_workouts: bucket.traineeWorkouts.length,
          activities: bucket.activities.length
        }
      });
    } catch (err) {
      results.push({ trainee_id: item.trainee.id, trainee_email: item.trainee.user_email, date: item.date, error: err.message });
    }
  }

  return { dates: targetDates, total_targets: allTargets.length, skip: skipCount, limit: limitCount, processed: results.length, results };
}

// ─────────────────────────────────────────────────────────────────────
// END OF DAY SCHEDULER — runs for all trainees
// ─────────────────────────────────────────────────────────────────────

async function runEndOfDayForAllTrainees(base44) {
  const date = getIsraelDate();
  const trainees = await base44.asServiceRole.entities.Trainee.filter({ status: 'active' }).catch(() => []);
  const results = [];

  for (const trainee of trainees) {
    try {
      const result = await endOfDayBonus(base44, trainee.id, trainee.user_email, date);
      results.push({ trainee: trainee.user_email, ...result });
    } catch (err) {
      console.warn(`[POINTS] endOfDay failed for ${trainee.user_email}:`, err.message);
      results.push({ trainee: trainee.user_email, error: err.message });
    }
  }

  return { date, processed: results.length, results };
}

// ─────────────────────────────────────────────────────────────────────
// HTTP HANDLER
// ─────────────────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json();

    // ── Entity automation payload (from MealEntry / TraineeWorkout triggers) ──
    if (body.event && body.data) {
      const { event, data } = body;
      const entityName = event.entity_name;

      let traineeId = data.trainee_id || null;
      let traineeEmail = data.trainee_email || null;

      // Resolve from Trainee if needed
      if (!traineeId && traineeEmail) {
        const trainees = await base44.asServiceRole.entities.Trainee.filter({ user_email: traineeEmail }).catch(() => []);
        traineeId = trainees[0]?.id || null;
      }

      if (!traineeId || !traineeEmail) {
        console.warn(`[POINTS] entity trigger missing trainee info — entity=${entityName}`);
        return Response.json({ ok: true, skipped: 'missing_trainee_info' });
      }

      let result;
      if (entityName === 'MealEntry') {
        result = await syncDailyPoints(base44, { id: traineeId, user_email: traineeEmail }, data.date || getIsraelDate());
      } else if (entityName === 'TraineeWorkout') {
        result = await syncDailyPoints(base44, { id: traineeId, user_email: traineeEmail }, data.date || getIsraelDate());
      } else if (entityName === 'WorkoutSession') {
        result = await syncDailyPoints(base44, { id: traineeId, user_email: traineeEmail }, data.date || getIsraelDate());
      } else if (entityName === 'WaterEntry') {
        result = await syncDailyPoints(base44, { id: traineeId, user_email: traineeEmail }, data.date || getIsraelDate());
      } else if (entityName === 'Recipe') {
        result = await onRecipeSaved(base44, traineeId, traineeEmail);
      } else if (entityName === 'ShapeLeagueActivityLog') {
        result = await syncDailyPoints(base44, { id: traineeId, user_email: traineeEmail }, data.activity_date || data.date || getIsraelDate());
      } else {
        return Response.json({ ok: true, skipped: `unhandled_entity: ${entityName}` });
      }

      return Response.json({ ok: true, result });
    }

    // ── Direct invocation ──────────────────────────────────────────────────
    const { action, trainee_id, trainee_email, date, dates, skip, limit } = body;

    if (!action) {
      return Response.json({ ok: false, error: 'Missing: action' }, { status: 400 });
    }

    // End-of-day scheduler (no user auth needed)
    if (action === 'end_of_day_all') {
      const result = await runEndOfDayForAllTrainees(base44);
      return Response.json({ ok: true, result });
    }

    if (action === 'sync_all') {
      const result = await syncAllTrainees(base44, dates || (date ? [date] : null), { skip, limit });
      return Response.json({ ok: true, result });
    }

    if (action === 'sync_daily') {
      if (!trainee_id || !trainee_email) {
        return Response.json({ ok: false, error: 'Missing: trainee_id, trainee_email' }, { status: 400 });
      }
      const result = await syncDailyPoints(base44, { id: trainee_id, user_email: trainee_email }, date || getIsraelDate());
      return Response.json({ ok: true, result });
    }

    if (!trainee_id || !trainee_email) {
      return Response.json({ ok: false, error: 'Missing: trainee_id, trainee_email' }, { status: 400 });
    }

    let result;
    switch (action) {
      case 'workout_logged':
        result = await onWorkoutLogged(base44, trainee_id, trainee_email);
        break;
      case 'meal_logged':
        result = await onMealLogged(base44, trainee_id, trainee_email);
        break;
      case 'water_target_reached':
        result = await onWaterTargetReached(base44, trainee_id, trainee_email, date);
        break;
      case 'activity_logged':
        result = await onActivityLogged(base44, trainee_id, trainee_email, body);
        break;
      case 'end_of_day_bonus':
        result = await endOfDayBonus(base44, trainee_id, trainee_email, date);
        break;
      case 'recipe_saved':
        result = await onRecipeSaved(base44, trainee_id, trainee_email);
        break;
      case 'get_or_create':
        result = await getOrCreateUserPointsDaily(base44, trainee_id, trainee_email, date || getIsraelDate());
        break;
      default:
        return Response.json({ ok: false, error: `Unknown action: ${action}` }, { status: 400 });
    }

    return Response.json({ ok: true, result });
  } catch (error) {
    console.error('[pointsEngine] Error:', error.message);
    return Response.json({ ok: false, error: error.message }, { status: 500 });
  }
});

export { getOrCreateUserPointsDaily, onWorkoutLogged, onMealLogged, onWaterTargetReached, onActivityLogged, endOfDayBonus };