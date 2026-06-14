import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { workout_id, coach_email, date } = await req.json();

    if (!workout_id || !coach_email || !date) {
      return Response.json({ error: 'Missing required fields' }, { status: 400 });
    }

    console.log('[sendWorkoutNotifications] Starting for date:', date);

    // Get all active trainees for this coach
    const trainees = await base44.asServiceRole.entities.Trainee.filter({ 
      coach_email: coach_email,
      status: 'active',
    });

    console.log(`Found ${trainees.length} active trainees`);

    let sent = 0;
    let skipped = 0;

    // Batch create notifications
    const notificationsToCreate = [];

    for (const trainee of trainees) {
      // Check if already sent today
      const existingNotifs = await base44.asServiceRole.entities.Notification.filter({
        trainee_email: trainee.user_email,
        title_he: 'האימון היומי עלה 💪',
      });

      const alreadySentToday = existingNotifs.some(n => {
        const sentDate = new Date(n.created_date).toISOString().split('T')[0];
        return sentDate === date;
      });

      if (!alreadySentToday) {
        notificationsToCreate.push({
          trainee_email: trainee.user_email,
          title_he: 'האימון היומי עלה 💪',
          body_he: 'כנסו למסך הבית → אימון יומי → העתקו לאימונים שלכם.',
          channel_sent: 'in_app',
          status: 'sent',
          sent_at: new Date().toISOString(),
          action_url: '/daily-workout',
        });
      } else {
        skipped++;
      }
    }

    // Bulk create to avoid rate limits
    if (notificationsToCreate.length > 0) {
      // Create in smaller batches to avoid payload size limits
      const batchSize = 50;
      for (let i = 0; i < notificationsToCreate.length; i += batchSize) {
        const batch = notificationsToCreate.slice(i, i + batchSize);
        await base44.asServiceRole.entities.Notification.bulkCreate(batch);
        sent += batch.length;
        
        // Small delay between batches
        if (i + batchSize < notificationsToCreate.length) {
          await new Promise(resolve => setTimeout(resolve, 100));
        }
      }
    }

    console.log(`[sendWorkoutNotifications] Sent: ${sent}, Skipped: ${skipped}`);

    return Response.json({
      success: true,
      sent,
      skipped,
      total_trainees: trainees.length
    });

  } catch (error) {
    console.error('[sendWorkoutNotifications] Error:', error);
    return Response.json({ 
      error: error.message,
      success: false 
    }, { status: 500 });
  }
});