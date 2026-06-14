import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (user?.role !== 'admin') {
      return Response.json({ error: 'Forbidden: Admin access required' }, { status: 403 });
    }

    const { isTest = false, testUserEmail = null } = await req.json();

    const now = new Date();
    const todayStr = now.toISOString().split('T')[0];
    
    console.log('[createNotificationJobs] Starting job creation...');

    // Get active trainees
    let trainees;
    if (isTest && testUserEmail) {
      trainees = await base44.asServiceRole.entities.Trainee.filter({ 
        user_email: testUserEmail,
        status: 'active'
      });
    } else {
      trainees = await base44.asServiceRole.entities.Trainee.filter({ 
        status: 'active' 
      });
    }

    console.log(`[createNotificationJobs] Found ${trainees.length} trainees`);

    // Get active notification rules
    const rules = await base44.asServiceRole.entities.NotificationRule.filter({ 
      is_active: true 
    });

    const jobsCreated = [];
    const jobsSkipped = [];

    for (const trainee of trainees) {
      for (const rule of rules) {
        try {
          // Generate dedupe key
          const dedupeKey = `${trainee.user_email}_${rule.trigger_type}_${todayStr}_in_app`;

          // Check if job already exists today
          const existingJobs = await base44.asServiceRole.entities.NotificationJob.filter({
            dedupe_key: dedupeKey
          });

          if (existingJobs.length > 0) {
            jobsSkipped.push({
              user: trainee.user_email,
              type: rule.trigger_type,
              reason: 'duplicate'
            });
            continue;
          }

          // Create notification job
          const notificationId = crypto.randomUUID();
          const job = await base44.asServiceRole.entities.NotificationJob.create({
            notification_id: notificationId,
            user_email: trainee.user_email,
            trainee_name: trainee.full_name,
            type: rule.trigger_type,
            channel: 'in_app',
            status: 'queued',
            scheduled_for: now.toISOString(),
            payload: {
              title_he: rule.message_template_he.split('\n')[0] || 'התראה',
              body_he: rule.message_template_he,
              severity: rule.severity || 'info',
              action_url: rule.action_url
            },
            dedupe_key: dedupeKey,
            rule_id: rule.id,
            is_test: isTest
          });

          jobsCreated.push({
            id: job.id,
            user: trainee.user_email,
            type: rule.trigger_type
          });

        } catch (error) {
          console.error(`[createNotificationJobs] Error for ${trainee.user_email}:`, error);
        }
      }
    }

    console.log(`[createNotificationJobs] Created ${jobsCreated.length} jobs, skipped ${jobsSkipped.length}`);

    return Response.json({
      success: true,
      created: jobsCreated.length,
      skipped: jobsSkipped.length,
      jobs: jobsCreated
    });

  } catch (error) {
    console.error('[createNotificationJobs] Error:', error);
    return Response.json({ 
      error: error.message,
      success: false 
    }, { status: 500 });
  }
});