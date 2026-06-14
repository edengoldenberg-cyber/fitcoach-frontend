import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

// All achievement definitions
const ACHIEVEMENTS = [
  // Workout
  { key: 'first_workout', category: 'workout', icon: '💪', title: 'אימון ראשון', description: 'הגעת לאימון הראשון שלך!', target_value: 1, bonus_points: 50 },
  { key: '5_workouts_week', category: 'workout', icon: '🔥', title: '5 אימונים בשבוע', description: 'השלמת 5 אימונים בשבוע אחד', target_value: 5, bonus_points: 100 },
  { key: '20_workouts_total', category: 'workout', icon: '🏋️', title: '20 אימונים', description: 'השלמת 20 אימונים בסה"כ', target_value: 20, bonus_points: 200 },
  // Nutrition
  { key: 'first_meal_logged', category: 'nutrition', icon: '🥗', title: 'ארוחה ראשונה', description: 'רשמת את הארוחה הראשונה שלך', target_value: 1, bonus_points: 50 },
  { key: '7_days_nutrition', category: 'nutrition', icon: '🍽️', title: 'שבוע של תזונה', description: '7 ימים רצופים עם רישום ארוחות', target_value: 7, bonus_points: 100 },
  // Water
  { key: '7_day_water_goal', category: 'water', icon: '💧', title: 'שבוע מים', description: 'הגעת ליעד המים 7 ימים ברצף', target_value: 7, bonus_points: 100 },
  // League
  { key: 'top_10', category: 'league', icon: '⭐', title: 'טופ 10', description: 'הגעת ל-10 הראשונים בדירוג השבועי', target_value: 1, bonus_points: 150 },
  { key: 'top_3', category: 'league', icon: '🏅', title: 'פודיום', description: 'הגעת למקום 1-3 בדירוג השבועי', target_value: 1, bonus_points: 250 },
  { key: 'first_place', category: 'league', icon: '👑', title: 'מלך/ת הליגה', description: 'הגעת למקום הראשון בליגה!', target_value: 1, bonus_points: 500 },
  // Group
  { key: 'winning_team_member', category: 'group', icon: '🤝', title: 'קבוצה מנצחת', description: 'הייתה חלק מהקבוצה המנצחת', target_value: 1, bonus_points: 200 },
  // Consistency
  { key: '7_day_streak', category: 'consistency', icon: '🔥🔥', title: 'שבוע אש', description: '7 ימים פעילים ברצף', target_value: 7, bonus_points: 100 },
  { key: '30_day_streak', category: 'consistency', icon: '👑', title: 'חודש מלא', description: '30 ימים פעילים ברצף!', target_value: 30, bonus_points: 300 },
];

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const { action, trainee_id } = body;

    if (action === 'update_streak') {
      return await updateStreak(base44, trainee_id || null, user);
    }

    if (action === 'check_achievements') {
      return await checkAchievements(base44, trainee_id || null, user);
    }

    if (action === 'get_my_data') {
      return await getMyData(base44, user);
    }

    return Response.json({ error: 'Unknown action' }, { status: 400 });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});

async function getMyData(base44, user) {
  const trainees = await base44.entities.Trainee.filter({ user_email: user.email });
  const trainee = trainees[0];
  if (!trainee) return Response.json({ streak: null, achievements: [], achievements_progress: {} });

  const [streakRecords, achievements, allPoints, rankingRes] = await Promise.all([
    base44.entities.TraineeStreak.filter({ trainee_id: trainee.id }),
    base44.entities.ShapeLeagueAchievement.filter({ trainee_id: trainee.id }),
    base44.entities.UserPointsDaily.filter({ trainee_id: trainee.id }),
    base44.functions.invoke('calculateWeeklyRanking', {}),
  ]);

  const progress = buildAchievementProgress({
    achievements,
    allPoints,
    streak: streakRecords[0] || null,
    ranking: rankingRes?.data?.ranking || [],
    traineeId: trainee.id,
  });

  return Response.json({
    streak: streakRecords[0] || null,
    achievements,
    achievements_progress: progress,
    trainee_id: trainee.id,
  });
}

function buildAchievementProgress({ achievements, allPoints, streak, ranking, traineeId }) {
  const unlockedKeys = new Set((achievements || []).map(a => a.achievement_key));
  const weekStart = getWeekStart();
  const weekEnd = getWeekEnd();
  const workoutDays = allPoints.filter(r => (r.workout_points || 0) > 0);
  const workoutsThisWeek = allPoints.filter(r => r.date >= weekStart && r.date <= weekEnd && (r.workout_points || 0) > 0);
  const mealDays = allPoints.filter(r => (r.meal_points || 0) > 0);
  const waterDays = allPoints.filter(r => (r.water_points || 0) > 0);
  const consecutiveMealDays = countMaxConsecutiveDays(mealDays.map(r => r.date), r => r.meal_points > 0, allPoints, 'meal_points');
  const consecutiveWaterDays = countMaxConsecutiveDays(waterDays.map(r => r.date), r => r.water_points > 0, allPoints, 'water_points');
  const maxStreak = Math.max(streak?.current_streak || 0, streak?.best_streak || 0);
  const myRank = ranking.find(r => r.trainee_id === traineeId);

  const values = {
    first_workout: workoutDays.length,
    '5_workouts_week': workoutsThisWeek.length,
    '20_workouts_total': workoutDays.length,
    first_meal_logged: mealDays.length,
    '7_days_nutrition': consecutiveMealDays,
    '7_day_water_goal': consecutiveWaterDays,
    top_10: myRank?.rank <= 10 ? 1 : 0,
    top_3: myRank?.rank <= 3 ? 1 : 0,
    first_place: myRank?.rank === 1 ? 1 : 0,
    winning_team_member: unlockedKeys.has('winning_team_member') ? 1 : 0,
    '7_day_streak': maxStreak,
    '30_day_streak': maxStreak,
  };

  return ACHIEVEMENTS.reduce((acc, achievement) => {
    acc[achievement.key] = {
      current_value: Math.min(values[achievement.key] || 0, achievement.target_value || 1),
      target_value: achievement.target_value || 1,
      bonus_points: achievement.bonus_points || 0,
    };
    return acc;
  }, {});
}

async function updateStreak(base44, overrideTraineeId, user) {
  const trainees = overrideTraineeId
    ? await base44.entities.Trainee.filter({ id: overrideTraineeId })
    : await base44.entities.Trainee.filter({ user_email: user.email });

  const trainee = trainees[0];
  if (!trainee) return Response.json({ error: 'Trainee not found' }, { status: 404 });

  // Get today's points record to determine if "active" today
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Jerusalem' });
  const yesterday = new Date(Date.now() - 86400000).toLocaleDateString('en-CA', { timeZone: 'Asia/Jerusalem' });

  const recentPoints = await base44.entities.UserPointsDaily.filter({ trainee_id: trainee.id });
  const todayRecord = recentPoints.find(r => r.date === today);
  const yesterdayRecord = recentPoints.find(r => r.date === yesterday);

  // "Active" = any points > 0
  const activeToday = todayRecord && (todayRecord.total_points || 0) > 0;
  const activeYesterday = yesterdayRecord && (yesterdayRecord.total_points || 0) > 0;

  const existingStreaks = await base44.entities.TraineeStreak.filter({ trainee_id: trainee.id });
  const existing = existingStreaks[0];

  let currentStreak = existing?.current_streak || 0;
  let bestStreak = existing?.best_streak || 0;
  const lastActive = existing?.last_active_date;

  if (activeToday && lastActive !== today) {
    // Continue or start streak
    if (lastActive === yesterday || currentStreak === 0) {
      currentStreak += 1;
    } else if (!lastActive || lastActive < yesterday) {
      // Gap in streak — reset
      currentStreak = 1;
    }
    if (currentStreak > bestStreak) bestStreak = currentStreak;

    if (existing) {
      await base44.entities.TraineeStreak.update(existing.id, {
        current_streak: currentStreak,
        best_streak: bestStreak,
        last_active_date: today,
        updated_at: new Date().toISOString(),
      });
    } else {
      await base44.entities.TraineeStreak.create({
        trainee_id: trainee.id,
        trainee_email: trainee.user_email,
        current_streak: currentStreak,
        best_streak: bestStreak,
        last_active_date: today,
        updated_at: new Date().toISOString(),
      });
    }
  } else if (!activeToday && lastActive && lastActive < yesterday) {
    // Streak broken
    if (existing && currentStreak > 0) {
      await base44.entities.TraineeStreak.update(existing.id, {
        current_streak: 0,
        updated_at: new Date().toISOString(),
      });
      currentStreak = 0;
    }
  }

  return Response.json({ current_streak: currentStreak, best_streak: bestStreak, active_today: activeToday });
}

async function checkAchievements(base44, overrideTraineeId, user) {
  const trainees = overrideTraineeId
    ? await base44.entities.Trainee.filter({ id: overrideTraineeId })
    : await base44.entities.Trainee.filter({ user_email: user.email });

  const trainee = trainees[0];
  if (!trainee) return Response.json({ error: 'Trainee not found' }, { status: 404 });

  const [existingAchievements, allPoints, streakRecords, rankingRes] = await Promise.all([
    base44.entities.ShapeLeagueAchievement.filter({ trainee_id: trainee.id }),
    base44.entities.UserPointsDaily.filter({ trainee_id: trainee.id }),
    base44.entities.TraineeStreak.filter({ trainee_id: trainee.id }),
    base44.functions.invoke('calculateWeeklyRanking', {}),
  ]);

  const unlockedKeys = new Set(existingAchievements.map(a => a.achievement_key));
  const streak = streakRecords[0];
  const ranking = rankingRes?.data?.ranking || [];
  const myRank = ranking.find(r => r.trainee_id === trainee.id);

  const newlyUnlocked = [];

  async function unlock(key) {
    if (unlockedKeys.has(key)) return;
    const def = ACHIEVEMENTS.find(a => a.key === key);
    if (!def) return;
    await base44.entities.ShapeLeagueAchievement.create({
      trainee_id: trainee.id,
      trainee_email: trainee.user_email,
      achievement_key: key,
      category: def.category,
      icon: def.icon,
      title: def.title,
      description: def.description,
      unlocked_at: new Date().toISOString(),
    });
    unlockedKeys.add(key);
    newlyUnlocked.push(key);
  }

  // Workout achievements
  const workoutDays = allPoints.filter(r => (r.workout_points || 0) > 0);
  if (workoutDays.length >= 1) await unlock('first_workout');
  if (workoutDays.length >= 20) await unlock('20_workouts_total');

  // Check 5 workouts in a week
  const weekStart = getWeekStart();
  const weekEnd = getWeekEnd();
  const workoutsThisWeek = allPoints.filter(r => r.date >= weekStart && r.date <= weekEnd && (r.workout_points || 0) > 0);
  if (workoutsThisWeek.length >= 5) await unlock('5_workouts_week');

  // Nutrition achievements
  const mealDays = allPoints.filter(r => (r.meal_points || 0) > 0);
  if (mealDays.length >= 1) await unlock('first_meal_logged');

  // 7 consecutive meal days
  const consecutiveMealDays = countMaxConsecutiveDays(mealDays.map(r => r.date), r => r.meal_points > 0, allPoints, 'meal_points');
  if (consecutiveMealDays >= 7) await unlock('7_days_nutrition');

  // Water achievements
  const waterDays = allPoints.filter(r => (r.water_points || 0) > 0);
  const consecutiveWaterDays = countMaxConsecutiveDays(waterDays.map(r => r.date), r => r.water_points > 0, allPoints, 'water_points');
  if (consecutiveWaterDays >= 7) await unlock('7_day_water_goal');

  // League achievements
  if (myRank) {
    if (myRank.rank <= 10) await unlock('top_10');
    if (myRank.rank <= 3) await unlock('top_3');
    if (myRank.rank === 1) await unlock('first_place');
  }

  // Consistency achievements
  const currentStreak = streak?.current_streak || 0;
  const bestStreak = streak?.best_streak || 0;
  const maxStreak = Math.max(currentStreak, bestStreak);
  if (maxStreak >= 7) await unlock('7_day_streak');
  if (maxStreak >= 30) await unlock('30_day_streak');

  return Response.json({ newly_unlocked: newlyUnlocked, total_unlocked: unlockedKeys.size });
}

function getWeekStart() {
  const now = new Date();
  const day = now.getDay(); // 0=Sun
  const diff = now.getDate() - day;
  const start = new Date(now.setDate(diff));
  return start.toLocaleDateString('en-CA', { timeZone: 'Asia/Jerusalem' });
}

function getWeekEnd() {
  const now = new Date();
  const day = now.getDay();
  const diff = now.getDate() - day + 6;
  const end = new Date(now.setDate(diff));
  return end.toLocaleDateString('en-CA', { timeZone: 'Asia/Jerusalem' });
}

function countMaxConsecutiveDays(dates, filterFn, allRecords, field) {
  if (!dates.length) return 0;
  const sorted = [...new Set(dates)].sort();
  let max = 1, cur = 1;
  for (let i = 1; i < sorted.length; i++) {
    const prev = new Date(sorted[i - 1]);
    const curr = new Date(sorted[i]);
    const diff = (curr - prev) / (1000 * 60 * 60 * 24);
    if (diff === 1) {
      cur++;
      if (cur > max) max = cur;
    } else {
      cur = 1;
    }
  }
  return max;
}