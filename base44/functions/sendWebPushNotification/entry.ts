import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';
import webpush from 'npm:web-push@3.6.7';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { user_email, title, body, data, notification_id } = await req.json();

    if (!user_email || !title || !body) {
      return Response.json({ 
        error: 'Missing required fields: user_email, title, body' 
      }, { status: 400 });
    }

    console.log(`[sendWebPush] Sending to ${user_email}:`, { title, body, notification_id });

    // Get VAPID keys from environment
    const VAPID_PUBLIC_KEY = Deno.env.get('VAPID_PUBLIC_KEY');
    const VAPID_PRIVATE_KEY = Deno.env.get('VAPID_PRIVATE_KEY');
    const VAPID_SUBJECT = Deno.env.get('VAPID_SUBJECT') || 'mailto:admin@fitcoach.pro';

    if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) {
      console.error('[sendWebPush] VAPID keys not configured');
      return Response.json({ 
        error: 'VAPID keys not configured',
        sent_count: 0,
        failed_count: 0
      }, { status: 500 });
    }

    // Configure web-push
    webpush.setVapidDetails(
      VAPID_SUBJECT,
      VAPID_PUBLIC_KEY,
      VAPID_PRIVATE_KEY
    );

    // Fetch active subscriptions for this user
    const subscriptions = await base44.asServiceRole.entities.PushSubscription.filter({
      trainee_email: user_email,
      is_active: true
    });

    console.log(`[sendWebPush] Found ${subscriptions.length} active subscriptions`);

    if (subscriptions.length === 0) {
      return Response.json({
        ok: false,
        error: 'No active push subscriptions found',
        sent_count: 0,
        failed_count: 0
      });
    }

    const results = {
      sent_count: 0,
      failed_count: 0,
      errors: []
    };

    // Send to all subscriptions
    for (const subscription of subscriptions) {
      try {
        const pushSubscription = {
          endpoint: subscription.endpoint,
          keys: {
            p256dh: subscription.p256dh,
            auth: subscription.auth
          }
        };

        const payload = JSON.stringify({
          title,
          body,
          tag: notification_id || `notif-${Date.now()}`,
          data: data || {},
          action_url: data?.action_url || '/'
        });

        console.log(`[sendWebPush] Sending to endpoint: ${subscription.endpoint.substring(0, 50)}...`);

        const response = await webpush.sendNotification(pushSubscription, payload);

        console.log(`[sendWebPush] ✅ Sent successfully to ${subscription.id}`);
        results.sent_count++;

        // Update last_used
        await base44.asServiceRole.entities.PushSubscription.update(subscription.id, {
          last_used: new Date().toISOString()
        });

      } catch (error) {
        console.error(`[sendWebPush] ❌ Failed to send to ${subscription.id}:`, error);
        
        // Check if subscription is invalid (410 or 404)
        if (error.statusCode === 410 || error.statusCode === 404) {
          console.log(`[sendWebPush] Marking subscription ${subscription.id} as inactive`);
          await base44.asServiceRole.entities.PushSubscription.update(subscription.id, {
            is_active: false
          });
        }

        results.failed_count++;
        results.errors.push({
          subscription_id: subscription.id,
          error: error.message,
          statusCode: error.statusCode
        });
      }
    }

    console.log(`[sendWebPush] Results:`, results);

    return Response.json({
      ok: results.sent_count > 0,
      ...results
    });

  } catch (error) {
    console.error('[sendWebPush] Error:', error);
    return Response.json({ 
      error: error.message,
      sent_count: 0,
      failed_count: 0
    }, { status: 500 });
  }
});