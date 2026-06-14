import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';
import webpush from 'npm:web-push@3.6.7';

// VAPID keys (same as in frontend)
const VAPID_PUBLIC_KEY = 'BEl62iUYgUivxIkv69yViEuiBIa-Ib9-SkvMeAtA3LFgDzkrxZJjSgSnfckjBJuBkr3qBUYIHBQFLXYp5Nksh8U';
const VAPID_PRIVATE_KEY = 'wcBCHK8vbWFNTBTX0xnNzIvjI3Vd8WTmSE8ck8S0-r4';

webpush.setVapidDetails(
  'mailto:support@fitcoachpro.com',
  VAPID_PUBLIC_KEY,
  VAPID_PRIVATE_KEY
);

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 403 });
    }
    
    // Check if user is a coach (has trainees)
    const trainees = await base44.entities.Trainee.filter({ coach_email: user.email });
    const isCoach = trainees.length > 0 || user.role === 'admin';
    
    if (!isCoach) {
      return Response.json({ error: 'Unauthorized - Coach access required' }, { status: 403 });
    }

    const { notification_id, trainee_emails, title, message, action_type } = await req.json();

    if (!trainee_emails || !Array.isArray(trainee_emails) || !title || !message) {
      return Response.json({ error: 'Missing required fields or invalid format' }, { status: 400 });
    }

    if (trainee_emails.length === 0) {
      return Response.json({ success: true, results: [], total: 0, sent: 0 });
    }

    const results = [];

    for (const email of trainee_emails) {
      try {
        const deduplicationKey = `${email}|push|${notification_id || title}|${message}`.toLowerCase();
        const recentLogs = await base44.asServiceRole.entities.NotificationAuditLog.filter({ deduplication_key: deduplicationKey }).catch(() => []);
        const cutoff = Date.now() - 30 * 60 * 1000;
        const duplicate = recentLogs.find((log) => new Date(log.created_at || log.created_date || 0).getTime() >= cutoff && log.status !== 'duplicate_blocked');

        if (duplicate) {
          await base44.asServiceRole.entities.NotificationAuditLog.create({
            trainee_email: email,
            notification_type: action_type || 'push',
            source_system: 'PUSH',
            title,
            body: message,
            trigger_reason: 'duplicate push blocked',
            created_at: new Date().toISOString(),
            status: 'duplicate_blocked',
            channel: 'push',
            deduplication_key: deduplicationKey,
            blocked_reason: 'Same push notification was already sent inside cooldown window',
            cooldown_minutes: 30,
            related_notification_id: notification_id,
            send_pipeline: 'sendPushNotification.dedup'
          });
          results.push({ email, status: 'duplicate_blocked' });
          continue;
        }

        const auditLog = await base44.asServiceRole.entities.NotificationAuditLog.create({
          trainee_email: email,
          notification_type: action_type || 'push',
          source_system: 'PUSH',
          title,
          body: message,
          trigger_reason: 'coach push notification',
          created_at: new Date().toISOString(),
          status: 'sending',
          channel: 'push',
          deduplication_key: deduplicationKey,
          related_notification_id: notification_id,
          send_pipeline: 'sendPushNotification.start'
        });

        // Get push tokens for this trainee
        const tokens = await base44.asServiceRole.entities.PushToken.filter({
          trainee_email: email,
          is_active: true
        });

        if (!tokens || tokens.length === 0) {
          await base44.asServiceRole.entities.NotificationAuditLog.update(auditLog.id, {
            status: 'failed',
            error_message: 'No active push token found',
            send_pipeline: 'sendPushNotification.no_token'
          });
          results.push({ email, status: 'no_token' });
          continue;
        }

        // Send push notification to each token
        for (const tokenRecord of tokens) {
          try {
            const subscription = JSON.parse(tokenRecord.token);
            
            const payload = JSON.stringify({
              title,
              body: message,
              icon: '/icon-192.png',
              badge: '/icon-192.png',
              vibrate: [200, 100, 200],
              tag: notification_id || 'notification',
              data: {
                notification_id,
                action_type: action_type || 'none',
                url: '/'
              }
            });

            await webpush.sendNotification(subscription, payload);

            await base44.asServiceRole.entities.PushToken.update(tokenRecord.id, {
              last_used_at: new Date().toISOString()
            });

            await base44.asServiceRole.entities.NotificationAuditLog.update(auditLog.id, {
              status: 'sent',
              sent_at: new Date().toISOString(),
              provider_response: JSON.stringify({ token_id: tokenRecord.id, status: 'sent' }),
              device_type: tokenRecord.device_type,
              send_pipeline: 'sendPushNotification.sent'
            });

            results.push({ email, status: 'sent', token_id: tokenRecord.id });
          } catch (err) {
            console.error('Failed to send to token:', err);
            
            // If token is invalid, mark as inactive
            if (err.statusCode === 410 || err.statusCode === 404) {
              await base44.asServiceRole.entities.PushToken.update(tokenRecord.id, {
                is_active: false
              });
            }
            
            await base44.asServiceRole.entities.NotificationAuditLog.update(auditLog.id, {
              status: 'failed',
              error_message: err.message,
              provider_response: JSON.stringify({ statusCode: err.statusCode || null }),
              send_pipeline: 'sendPushNotification.token_error'
            });
            results.push({ email, status: 'error', error: err.message });
          }
        }
      } catch (err) {
        console.error('Error processing trainee:', email, err);
        await base44.asServiceRole.entities.NotificationAuditLog.create({
          trainee_email: email,
          notification_type: action_type || 'push',
          source_system: 'PUSH',
          title,
          body: message,
          trigger_reason: 'push processing failed',
          created_at: new Date().toISOString(),
          status: 'failed',
          channel: 'push',
          deduplication_key: `${email}|push|${notification_id || title}|${message}`.toLowerCase(),
          error_message: err.message,
          related_notification_id: notification_id,
          send_pipeline: 'sendPushNotification.processing_error'
        });
        results.push({ email, status: 'error', error: err.message });
      }
    }

    return Response.json({ 
      success: true, 
      results,
      total: trainee_emails.length,
      sent: results.filter(r => r.status === 'sent').length
    });
  } catch (err) {
    console.error('SendPushNotification error:', err);
    return Response.json({ error: err.message }, { status: 500 });
  }
});