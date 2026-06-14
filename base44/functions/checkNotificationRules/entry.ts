import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user || user.role !== 'admin') {
      return Response.json({ error: 'Unauthorized - Admin only' }, { status: 403 });
    }

    const today = new Date().toISOString().split('T')[0];
    const currentTime = new Date().toTimeString().slice(0, 5); // HH:MM
    
    // Fetch all active rules
    const rules = await base44.asServiceRole.entities.NotificationRule.filter({ is_enabled: true });
    
    // Fetch all trainees
    const trainees = await base44.asServiceRole.entities.Trainee.filter({ status: 'active' });
    
    const results = {
      checked: 0,
      sent: 0,
      skipped: 0,
      errors: [],
    };

    for (const rule of rules) {
      // Check if current time matches any schedule time
      const scheduleTimes = [rule.schedule_time_1, rule.schedule_time_2, rule.schedule_time_3].filter(Boolean);
      const shouldRun = scheduleTimes.some(time => {
        const [ruleHour, ruleMin] = time.split(':');
        const [currHour, currMin] = currentTime.split(':');
        return ruleHour === currHour && Math.abs(parseInt(ruleMin) - parseInt(currMin)) < 15;
      });

      if (!shouldRun) continue;

      // Get target trainees
      let targetTrainees = trainees;
      if (rule.target_scope === 'selected' && rule.target_trainee_ids?.length > 0) {
        targetTrainees = trainees.filter(t => rule.target_trainee_ids.includes(t.id));
      }

      for (const trainee of targetTrainees) {
        results.checked++;

        try {
          // Check if notification already sent today for this rule
          const existingNotifs = await base44.asServiceRole.entities.Notification.filter({
            trainee_email: trainee.user_email,
            rule_id: rule.id,
          });
          
          const todayNotif = existingNotifs.find(n => 
            n.created_date?.startsWith(today) && 
            ['sent', 'delivered', 'read'].includes(n.status)
          );
          
          if (todayNotif) {
            results.skipped++;
            continue;
          }

          // Check daily limit
          const todayNotifications = await base44.asServiceRole.entities.Notification.filter({
            trainee_email: trainee.user_email,
          });
          const todayCount = todayNotifications.filter(n => 
            n.created_date?.startsWith(today) && n.status !== 'failed'
          ).length;

          const prefs = await base44.asServiceRole.entities.NotificationPreference.filter({
            trainee_email: trainee.user_email,
          });
          const maxDaily = prefs[0]?.max_daily_notifications || 3;

          if (todayCount >= maxDaily) {
            results.skipped++;
            continue;
          }

          // Check quiet hours
          if (prefs[0]) {
            const quietStart = prefs[0].quiet_hours_start || '22:00';
            const quietEnd = prefs[0].quiet_hours_end || '08:00';
            if (isInQuietHours(currentTime, quietStart, quietEnd)) {
              results.skipped++;
              continue;
            }
          }

          // Check rule conditions
          let shouldNotify = false;
          let title = '';
          let body = '';
          let actionUrl = '';
          let metadata = {};

          if (rule.rule_type === 'meal_missing') {
            const meals = await base44.asServiceRole.entities.MealEntry.filter({
              trainee_email: trainee.user_email,
              date: today,
            });
            
            if (meals.length === 0) {
              shouldNotify = true;
              title = 'עוד לא מילאת ארוחות היום 🍽️';
              body = 'כדי שנוכל לדייק לך את התהליך – בוא נרשום לפחות ארוחה אחת עכשיו. זה לוקח 30 שניות.';
              actionUrl = 'NutritionLog';
              metadata = { missing_meals: 4 - meals.length };
            }
          } else if (rule.rule_type === 'water_missing') {
            const water = await base44.asServiceRole.entities.WaterEntry.filter({
              trainee_email: trainee.user_email,
              date: today,
            });
            
            const totalWater = water.reduce((sum, w) => sum + (w.amount_ml || 0), 0);
            const targetWater = trainee.target_water_ml || 3000;
            const threshold = rule.threshold_value || (targetWater * 0.5);
            
            if (totalWater < threshold) {
              shouldNotify = true;
              const remaining = Math.ceil((targetWater - totalWater) / 250);
              title = 'תזכורת מים 💧';
              body = `נשארו לך ${remaining} כוסות להגיע ליעד היום.`;
              actionUrl = 'NutritionLog';
              metadata = { current_ml: totalWater, target_ml: targetWater };
            }
          } else if (rule.rule_type === 'workout_missing') {
            const workouts = await base44.asServiceRole.entities.WorkoutSession.filter({
              trainee_email: trainee.user_email,
              date: today,
            });
            
            if (workouts.length === 0) {
              shouldNotify = true;
              title = 'האימון שלך היום 💪';
              body = 'רוצה לשמור התקדמות? תעדכן סטים/חזרות מהאימון.';
              actionUrl = 'WorkoutLog';
              metadata = { workout_day: true };
            }
          } else if (rule.rule_type === 'inactivity_24h') {
            const logs = await base44.asServiceRole.entities.ActivityLog.filter({
              trainee_email: trainee.user_email,
            });
            
            if (logs.length > 0) {
              const lastActivity = logs.sort((a, b) => 
                new Date(b.created_date) - new Date(a.created_date)
              )[0];
              
              const hoursSinceActivity = (Date.now() - new Date(lastActivity.created_date)) / (1000 * 60 * 60);
              
              if (hoursSinceActivity >= 24) {
                shouldNotify = true;
                title = 'מתגעגעים אליך! 👋';
                body = 'כבר 24 שעות שלא עדכנת. בוא נמשיך את המסע שלך!';
                actionUrl = 'TraineeHome';
                metadata = { hours_inactive: Math.floor(hoursSinceActivity) };
              }
            }
          }

          if (shouldNotify) {
            // Create notification
            const notification = await base44.asServiceRole.entities.Notification.create({
              trainee_email: trainee.user_email,
              rule_id: rule.id,
              title_he: title,
              body_he: body,
              channel_sent: 'in_app',
              status: 'sent',
              sent_at: new Date().toISOString(),
              action_url: actionUrl,
              metadata,
            });

            // Try to send via other channels (Web Push → Email fallback)
            const channels = rule.channel_priority || ['in_app', 'push', 'email'];
            let pushSent = false;

            for (const channel of channels) {
              // Try Web Push first
              if (channel === 'push' && !pushSent) {
                try {
                  const pushResult = await base44.asServiceRole.functions.invoke('sendWebPush', {
                    trainee_email: trainee.user_email,
                    title,
                    body,
                    click_action: actionUrl || '/'
                  });

                  if (pushResult.data?.sent > 0) {
                    pushSent = true;
                    console.log(`✅ Web Push sent to ${trainee.user_email}`);
                  }
                } catch (err) {
                  console.error('Web Push failed:', err);
                }
              }

              // Fallback to Email if Push failed
              if (channel === 'email' && !pushSent && prefs[0]?.allow_email !== false) {
                try {
                  await base44.asServiceRole.integrations.Core.SendEmail({
                    to: trainee.user_email,
                    subject: title,
                    body: `${body}\n\nלחץ כאן לעדכון: ${actionUrl}`,
                  });
                  console.log(`📧 Email fallback sent to ${trainee.user_email}`);
                } catch (err) {
                  console.error('Email failed:', err);
                }
              }
            }

            results.sent++;
          }
        } catch (err) {
          results.errors.push({
            trainee: trainee.user_email,
            rule: rule.rule_type,
            error: err.message,
          });
        }
      }
    }

    return Response.json({
      success: true,
      timestamp: new Date().toISOString(),
      results,
    });

  } catch (error) {
    return Response.json({ 
      error: error.message,
      stack: error.stack 
    }, { status: 500 });
  }
});

function isInQuietHours(currentTime, quietStart, quietEnd) {
  const [currH, currM] = currentTime.split(':').map(Number);
  const [startH, startM] = quietStart.split(':').map(Number);
  const [endH, endM] = quietEnd.split(':').map(Number);
  
  const currMinutes = currH * 60 + currM;
  const startMinutes = startH * 60 + startM;
  const endMinutes = endH * 60 + endM;
  
  if (startMinutes < endMinutes) {
    return currMinutes >= startMinutes && currMinutes <= endMinutes;
  } else {
    return currMinutes >= startMinutes || currMinutes <= endMinutes;
  }
}