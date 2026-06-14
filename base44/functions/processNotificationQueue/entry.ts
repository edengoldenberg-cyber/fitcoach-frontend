import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

const BATCH_SIZE = 50;
const MAX_ATTEMPTS = 3;

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (user?.role !== 'admin') {
      return Response.json({ error: 'Forbidden: Admin access required' }, { status: 403 });
    }

    console.log('[processNotificationQueue] Starting queue processing...');

    // Get queued jobs (limit by batch size)
    const queuedJobs = await base44.asServiceRole.entities.NotificationJob.filter({
      status: 'queued'
    });

    const jobsToProcess = queuedJobs.slice(0, BATCH_SIZE);
    console.log(`[processNotificationQueue] Processing ${jobsToProcess.length} jobs`);

    const results = {
      sent: 0,
      failed: 0,
      skipped: 0
    };

    for (const job of jobsToProcess) {
      try {
        console.log(`[processNotificationQueue] 🔄 Processing job ${job.id}:`, {
          notification_id: job.notification_id,
          user_email: job.user_email,
          type: job.type,
          channel: job.channel,
          payload: job.payload
        });

        // Update status to processing
        await base44.asServiceRole.entities.NotificationJob.update(job.id, {
          status: 'processing',
          last_attempt_at: new Date().toISOString(),
          attempts: (job.attempts || 0) + 1
        });

        // Check if trainee exists and is active
        const trainees = await base44.asServiceRole.entities.Trainee.filter({
          user_email: job.user_email,
          status: 'active'
        });

        console.log(`[processNotificationQueue] Found ${trainees.length} active trainees for ${job.user_email}`);

        if (trainees.length === 0) {
          console.log(`[processNotificationQueue] ⏭️ Skipping - trainee not active`);
          await base44.asServiceRole.entities.NotificationJob.update(job.id, {
            status: 'skipped',
            error_code: 'TRAINEE_NOT_ACTIVE',
            error_message: 'מתאמן לא פעיל או לא קיים'
          });
          results.skipped++;
          continue;
        }

        // Send notification based on channel
        if (job.channel === 'in_app') {
          console.log(`[processNotificationQueue] 📲 Creating in-app notification...`);
          
          // Create Notification
          const notificationData = {
            trainee_email: job.user_email,
            title_he: job.payload?.title_he || 'התראה',
            body_he: job.payload?.body_he || '',
            type: job.type,
            severity: job.payload?.severity || 'info',
            action_url: job.payload?.action_url || null,
            status: 'unread',
            source: 'auto',
            rule_id: job.rule_id || null,
            fingerprint: job.dedupe_key || null,
            channel_sent: 'in_app',
            sent_at: new Date().toISOString()
          };

          console.log(`[processNotificationQueue] Creating notification with data:`, notificationData);

          const notification = await base44.asServiceRole.entities.Notification.create(notificationData);

          console.log(`[processNotificationQueue] ✅ Notification created: ${notification.id}`);

          // Update job as sent
          await base44.asServiceRole.entities.NotificationJob.update(job.id, {
            status: 'sent',
            sent_at: new Date().toISOString(),
            notification_receipt_id: notification.id
          });

          results.sent++;
          console.log(`[processNotificationQueue] ✅ Job marked as sent for ${job.user_email}`);

        } else if (job.channel === 'push_phone') {
          console.log(`[processNotificationQueue] 📬 Sending push_phone notification...`);
          
          // Check for push subscription
          const subscriptions = await base44.asServiceRole.entities.PushSubscription.filter({
            trainee_email: job.user_email,
            is_active: true
          });

          if (subscriptions.length === 0) {
            console.log(`[processNotificationQueue] ⏭️ No active push subscription found`);
            await base44.asServiceRole.entities.NotificationJob.update(job.id, {
              status: 'skipped',
              error_code: 'NO_PUSH_SUBSCRIPTION',
              error_message: 'אין מנוי פעיל ל-Push Notifications'
            });
            results.skipped++;
            continue;
          }

          // Send via Web Push
          try {
            const pushResult = await base44.functions.invoke('sendWebPushNotification', {
              user_email: job.user_email,
              title: job.payload?.title_he || 'התראה',
              body: job.payload?.body_he || '',
              data: {
                action_url: job.payload?.action_url || '/',
                type: job.type
              },
              notification_id: job.notification_id
            });

            console.log(`[processNotificationQueue] Push result:`, pushResult.data);

            if (pushResult.data?.ok && pushResult.data.sent_count > 0) {
              // Also create in-app notification for history
              const notification = await base44.asServiceRole.entities.Notification.create({
                trainee_email: job.user_email,
                title_he: job.payload?.title_he || 'התראה',
                body_he: job.payload?.body_he || '',
                type: job.type,
                severity: job.payload?.severity || 'info',
                action_url: job.payload?.action_url || null,
                status: 'unread',
                source: 'auto',
                rule_id: job.rule_id || null,
                fingerprint: job.dedupe_key || null,
                channel_sent: 'push_phone',
                sent_at: new Date().toISOString()
              });

              await base44.asServiceRole.entities.NotificationJob.update(job.id, {
                status: 'sent',
                sent_at: new Date().toISOString(),
                notification_receipt_id: notification.id
              });

              results.sent++;
              console.log(`[processNotificationQueue] ✅ Push sent successfully`);
            } else {
              throw new Error(pushResult.data?.error || 'Failed to send push');
            }

          } catch (pushError) {
            console.error(`[processNotificationQueue] ❌ Push send failed:`, pushError);
            await base44.asServiceRole.entities.NotificationJob.update(job.id, {
              status: 'failed',
              error_code: 'PUSH_SEND_FAILED',
              error_message: pushError.message || String(pushError)
            });
            results.failed++;
          }

        } else {
          console.log(`[processNotificationQueue] ❌ Unsupported channel: ${job.channel}`);
          // Unsupported channel
          await base44.asServiceRole.entities.NotificationJob.update(job.id, {
            status: 'skipped',
            error_code: 'UNSUPPORTED_CHANNEL',
            error_message: `ערוץ ${job.channel} לא נתמך`
          });
          results.skipped++;
        }

      } catch (error) {
        console.error(`[processNotificationQueue] ❌ Error processing job ${job.id}:`, error);
        console.error(`[processNotificationQueue] Error stack:`, error.stack);
        console.error(`[processNotificationQueue] Job data:`, job);
        
        // Check if max attempts reached
        const attempts = (job.attempts || 0) + 1;
        const status = attempts >= MAX_ATTEMPTS ? 'failed' : 'queued';

        const errorMessage = error.message || String(error);
        console.log(`[processNotificationQueue] Setting job to ${status}, attempts: ${attempts}/${MAX_ATTEMPTS}`);

        try {
          await base44.asServiceRole.entities.NotificationJob.update(job.id, {
            status,
            error_code: 'PROCESSING_ERROR',
            error_message: errorMessage,
            attempts,
            last_attempt_at: new Date().toISOString()
          });
        } catch (updateError) {
          console.error(`[processNotificationQueue] ❌ Failed to update job status:`, updateError);
        }

        results.failed++;
      }
    }

    console.log('[processNotificationQueue] ✅ Processing complete:', results);

    return Response.json({
      success: true,
      processed: jobsToProcess.length,
      results
    });

  } catch (error) {
    console.error('[processNotificationQueue] Error:', error);
    return Response.json({ 
      error: error.message,
      success: false 
    }, { status: 500 });
  }
});