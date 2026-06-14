import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';
import webpush from 'npm:web-push@3.6.7';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { trainee_email, title, body, icon, click_action } = await req.json();

    if (!trainee_email || !title || !body) {
      return Response.json({ 
        error: 'Missing required fields: trainee_email, title, body' 
      }, { status: 400 });
    }

    // Get VAPID keys from environment
    const vapidPublicKey = Deno.env.get('VAPID_PUBLIC_KEY');
    const vapidPrivateKey = Deno.env.get('VAPID_PRIVATE_KEY');
    const vapidSubject = Deno.env.get('VAPID_SUBJECT') || 'mailto:support@fitcoachpro.com';

    if (!vapidPublicKey || !vapidPrivateKey) {
      return Response.json({ 
        error: 'VAPID keys not configured. Please set VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY in environment variables.' 
      }, { status: 500 });
    }

    // Configure web-push
    webpush.setVapidDetails(
      vapidSubject,
      vapidPublicKey,
      vapidPrivateKey
    );

    // Get active push subscriptions for this trainee
    const subscriptions = await base44.asServiceRole.entities.PushSubscription.filter({
      trainee_email,
      is_active: true
    });

    if (subscriptions.length === 0) {
      return Response.json({ 
        success: false, 
        message: 'No active push subscriptions found',
        sent: 0
      });
    }

    const payload = JSON.stringify({
      title,
      body,
      icon: icon || '/icon-192.png',
      badge: '/icon-192.png',
      data: {
        url: click_action || '/',
        timestamp: new Date().toISOString()
      }
    });

    const results = await Promise.allSettled(
      subscriptions.map(async (sub) => {
        try {
          const pushSubscription = {
            endpoint: sub.endpoint,
            keys: {
              p256dh: sub.p256dh,
              auth: sub.auth
            }
          };

          await webpush.sendNotification(pushSubscription, payload);
          
          // Update last_used
          await base44.asServiceRole.entities.PushSubscription.update(sub.id, {
            last_used: new Date().toISOString()
          });

          return { success: true, subscription_id: sub.id };
        } catch (error) {
          console.error(`Failed to send push to subscription ${sub.id}:`, error);
          
          // If subscription is invalid (410 Gone), deactivate it
          if (error.statusCode === 410) {
            await base44.asServiceRole.entities.PushSubscription.update(sub.id, {
              is_active: false
            });
          }

          return { success: false, subscription_id: sub.id, error: error.message };
        }
      })
    );

    const successful = results.filter(r => r.status === 'fulfilled' && r.value.success).length;
    const failed = results.length - successful;

    return Response.json({
      success: true,
      sent: successful,
      failed,
      total_subscriptions: subscriptions.length
    });

  } catch (error) {
    console.error('sendWebPush error:', error);
    return Response.json({ 
      error: error.message || 'Internal server error' 
    }, { status: 500 });
  }
});