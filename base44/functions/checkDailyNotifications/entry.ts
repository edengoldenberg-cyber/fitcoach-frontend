import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  const startTime = Date.now();
  const MAX_DURATION = 50000; // 50 seconds max, leave 10s buffer before 60s timeout
  const log = {
    trainees_checked: 0,
    notifications_created: 0,
    push_sent: 0,
    push_failed: 0,
    errors: []
  };

  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    
    // Admin only for scheduled execution
    if (user?.role !== 'admin') {
      return Response.json({ error: 'Forbidden: Admin access required' }, { status: 403 });
    }

    const body = await req.json();
    const { time_of_day } = body; // 'morning' or 'evening'
    
    const today = new Date().toISOString().split('T')[0];
    
    console.log(`[checkDailyNotifications] Running ${time_of_day} check for ${today}`);

    // Get all active trainees
    const trainees = await base44.asServiceRole.entities.Trainee.filter({ status: 'active' });
    log.trainees_checked = trainees.length;

    // Process trainees in parallel batches to avoid timeout
    const batchSize = 5;
    for (let i = 0; i < trainees.length; i += batchSize) {
      if (Date.now() - startTime > MAX_DURATION) {
        log.errors.push({ batch: i, error: 'Time limit reached' });
        break;
      }
      
      const batch = trainees.slice(i, i + batchSize);
      await Promise.all(
        batch.map(trainee =>
          checkTraineeNotifications(base44, trainee, today, time_of_day, log).catch(err => {
            console.error(`Error checking trainee ${trainee.user_email}:`, err);
            log.errors.push({ trainee: trainee.user_email, error: err.message });
          })
        )
      );
    }

    const duration = Date.now() - startTime;
    console.log(`[checkDailyNotifications] Complete in ${duration}ms:`, log);

    // Save log to database
    try {
      await base44.asServiceRole.entities.SystemAuditLog.create({
        action: 'daily_notifications_check',
        details: JSON.stringify({ time_of_day, ...log }),
        status: 'success',
        duration_ms: duration
      });
    } catch (err) {
      console.error('Failed to save log:', err);
    }

    return Response.json({
      ok: true,
      ...log,
      duration_ms: duration
    }, { status: 200 });

  } catch (error) {
    console.error('[checkDailyNotifications] Fatal error:', error);

    try {
      const base44 = createClientFromRequest(req);
      await base44.asServiceRole.entities.SystemAuditLog.create({
        action: 'daily_notifications_check',
        details: JSON.stringify({ error: error.message, ...log }),
        status: 'error',
        duration_ms: Date.now() - startTime
      });
    } catch (logErr) {
      console.error('Failed to save error log:', logErr);
    }

    return Response.json({
      ok: false,
      error: error.message,
      ...log,
      duration_ms: Date.now() - startTime
    }, { status: 200 });
  }
});

async function checkTraineeNotifications(base44, trainee, today, timeOfDay, log) {
  const email = trainee.user_email;
  
  // Check meal tracking
  try {
    const meals = await base44.asServiceRole.entities.MealEntry.filter({
      trainee_email: email,
      date: today
    });

    if (meals.length === 0) {
      const title = timeOfDay === 'morning' 
        ? 'לא מילאת ארוחות היום' 
        : 'אל תשכח להזין ארוחות היום';
      
      const body = timeOfDay === 'morning'
        ? 'עדיין לא נרשמו ארוחות היום. זכור לתעד את האוכל שלך'
        : 'היום עומד להסתיים ולא נרשמו ארוחות. עדיין יש זמן!';

      await createNotificationWithPush(base44, email, {
        type: 'meal_missing',
        title_he: title,
        body_he: body,
        severity: 'warning',
        source: 'auto'
      }, log);
    }
  } catch (err) {
    console.error(`Meal check failed for ${email}:`, err);
  }

  // Check water tracking
  try {
    const water = await base44.asServiceRole.entities.WaterEntry.filter({
      trainee_email: email,
      date: today
    });

    const totalWater = water.reduce((sum, w) => sum + (w.amount_ml || 0), 0);
    const targetWater = trainee.target_water_ml || 3000;
    const percentage = (totalWater / targetWater) * 100;

    if (timeOfDay === 'morning' && totalWater === 0) {
      await createNotificationWithPush(base44, email, {
        type: 'water_missing',
        title_he: 'לא הזנת מים היום',
        body_he: 'זכור לשתות מים ולתעד את השתייה שלך',
        severity: 'info',
        source: 'auto'
      }, log);
    } else if (timeOfDay === 'evening' && percentage < 70) {
      await createNotificationWithPush(base44, email, {
        type: 'water_missing',
        title_he: 'שתית מעט מים היום',
        body_he: `שתית ${Math.round(percentage)}% מהיעד. נסה לשתות עוד לפני סוף היום`,
        severity: 'warning',
        source: 'auto'
      }, log);
    }
  } catch (err) {
    console.error(`Water check failed for ${email}:`, err);
  }

  // Check workout completion
  try {
    const dailyWorkout = await base44.asServiceRole.entities.DailyWorkout.filter({
      coach_email: trainee.coach_email,
      date: today,
      status: 'published'
    });

    if (dailyWorkout.length > 0) {
      const traineeWorkout = await base44.asServiceRole.entities.TraineeWorkout.filter({
        trainee_email: email,
        date: today
      });

      const hasCompleted = traineeWorkout.some(w => w.status === 'completed');

      if (!hasCompleted) {
        const title = timeOfDay === 'morning'
          ? 'יש לך אימון היום'
          : 'האימון שלך היום עדיין לא בוצע';
        
        const body = timeOfDay === 'morning'
          ? 'מתוכנן לך אימון להיום. בוא נעבוד!'
          : 'עדיין יש זמן להשלים את האימון של היום';

        await createNotificationWithPush(base44, email, {
          type: 'workout_missing',
          title_he: title,
          body_he: body,
          severity: 'info',
          source: 'auto',
          action_url: '/TraineeDailyWorkout',
          action_type: 'open_workout',
          action_label: 'לאימון'
        }, log);
      }
    }
  } catch (err) {
    console.error(`Workout check failed for ${email}:`, err);
  }
}

async function createNotificationWithPush(base44, traineeEmail, notificationData, log) {
  try {
    // Create internal notification with deduplication
    const result = await base44.asServiceRole.functions.invoke('createNotification', {
      trainee_email: traineeEmail,
      ...notificationData
    });

    if (result.data.created) {
      log.notifications_created++;

      // Try to send push notification
      try {
        const pushResult = await base44.asServiceRole.functions.invoke('sendPushToTrainee', {
          trainee_email: traineeEmail,
          notification_id: result.data.notification_id
        });

        if (pushResult.data.ok && pushResult.data.sent > 0) {
          log.push_sent++;
        }
      } catch (pushErr) {
        log.push_failed++;
        console.error(`Push failed for ${traineeEmail}:`, pushErr);
      }
    }
  } catch (err) {
    console.error(`Notification creation failed for ${traineeEmail}:`, err);
    throw err;
  }
}