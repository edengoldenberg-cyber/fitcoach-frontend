import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    
    // Get all active trainees
    const trainees = await base44.asServiceRole.entities.Trainee.filter({
      status: 'active'
    });

    if (!trainees || trainees.length === 0) {
      return Response.json({ message: 'No active trainees', sent: 0 });
    }

    const today = new Date().toISOString().split('T')[0];
    const notifications = [];

    for (const trainee of trainees) {
      const missing = [];

      // Check nutrition
      const meals = await base44.asServiceRole.entities.MealEntry.filter({
        trainee_email: trainee.user_email,
        date: today
      });
      if (!meals || meals.length === 0) {
        missing.push('nutrition');
      }

      // Check water
      const water = await base44.asServiceRole.entities.WaterEntry.filter({
        trainee_email: trainee.user_email,
        date: today
      });
      if (!water || water.length === 0) {
        missing.push('water');
      }

      // Check workout (only if it's afternoon/evening)
      const hour = new Date().getHours();
      if (hour >= 17) {
        const workouts = await base44.asServiceRole.entities.WorkoutSession.filter({
          trainee_email: trainee.user_email,
          date: today
        });
        if (!workouts || workouts.length === 0) {
          missing.push('workout');
        }
      }

      // Send notification if something is missing
      if (missing.length > 0) {
        let title = '';
        let message = '';
        let action_type = 'none';

        if (missing.includes('nutrition') && missing.includes('water')) {
          title = '⏰ תזכורת יומית';
          message = 'עדיין לא רשמת תזונה ומים היום. בוא נעדכן!';
          action_type = 'open_nutrition';
        } else if (missing.includes('nutrition')) {
          title = '🍽️ תזכורת תזונה';
          message = 'עדיין לא רשמת מה אכלת היום. זה לוקח רק דקה!';
          action_type = 'open_nutrition';
        } else if (missing.includes('water')) {
          title = '💧 תזכורת שתייה';
          message = 'זכור לשתות מים! עדיין לא רשמת שום צריכה היום.';
          action_type = 'open_water';
        } else if (missing.includes('workout')) {
          title = '💪 תזכורת אימון';
          message = 'עדיין לא תיעדת אימון היום. האם התאמנת?';
          action_type = 'open_workout';
        }

        // Create notification record
        const notification = await base44.asServiceRole.entities.Notification.create({
          coach_email: trainee.coach_email,
          recipient_type: 'single',
          recipient_emails: [trainee.user_email],
          title,
          message,
          category: 'תזכורת',
          channel: 'in_app',
          action_type,
          sent_at: new Date().toISOString(),
          status: 'sent'
        });

        // Check if trainee has push tokens
        const tokens = await base44.asServiceRole.entities.PushToken.filter({
          trainee_email: trainee.user_email,
          is_active: true
        });

        // Send push notification only if tokens exist
        if (tokens && tokens.length > 0) {
          try {
            await base44.asServiceRole.functions.invoke('sendPushNotification', {
              notification_id: notification.id,
              trainee_emails: [trainee.user_email],
              title,
              message,
              action_type
            });
            
            notifications.push({
              trainee: trainee.full_name,
              missing,
              status: 'sent'
            });
          } catch (err) {
            console.error('Failed to send push:', err);
            notifications.push({
              trainee: trainee.full_name,
              missing,
              status: 'error'
            });
          }
        } else {
          notifications.push({
            trainee: trainee.full_name,
            missing,
            status: 'no_tokens'
          });
        }
      }
    }

    return Response.json({
      success: true,
      checked: trainees.length,
      notifications_sent: notifications.length,
      details: notifications
    });
  } catch (err) {
    console.error('CheckMissingData error:', err);
    return Response.json({ error: err.message }, { status: 500 });
  }
});