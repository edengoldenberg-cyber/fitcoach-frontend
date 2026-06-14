import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';
import webpush from 'npm:web-push@3.6.7';

// VAPID keys
const VAPID_PUBLIC_KEY = 'BGHxT8YxQKZPYDJNTlJ3y0i8yPtX9GJbOZOhHqYGYZg8kN8N9VaWPbF5YqQvHbJKNzF4YqQvHbJKNzF4YqQvHbI';
const VAPID_PRIVATE_KEY = Deno.env.get('VAPID_PRIVATE_KEY') || 'YOUR_VAPID_PRIVATE_KEY_HERE';

webpush.setVapidDetails(
  'mailto:support@fitcoachpro.com',
  VAPID_PUBLIC_KEY,
  VAPID_PRIVATE_KEY
);

Deno.serve(async (req) => {
  const startTime = Date.now();
  
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
    }

    const { trainee_email, title, message, action_type } = await req.json();

    if (!trainee_email || !title || !message) {
      return Response.json({ 
        ok: false, 
        error: 'Missing required fields: trainee_email, title, message' 
      }, { status: 400 });
    }

    console.log('=== SEND_PUSH_TO_TRAINEE ===');
    console.log('Target:', trainee_email);
    console.log('Title:', title);

    // Get push subscriptions for trainee
    const subscriptions = await base44.asServiceRole.entities.PushSubscription.filter({
      trainee_email: trainee_email,
      is_active: true
    });

    console.log('Found subscriptions:', subscriptions.length);

    if (subscriptions.length === 0) {
      return Response.json({
        ok: false,
        error: 'No active push subscriptions found for trainee',
        duration_ms: Date.now() - startTime
      });
    }

    const results = [];
    let sentCount = 0;

    for (const sub of subscriptions) {
      try {
        const pushSubscription = {
          endpoint: sub.endpoint,
          keys: {
            p256dh: sub.p256dh,
            auth: sub.auth
          }
        };

        const payload = JSON.stringify({
          title,
          body: message,
          icon: '/icon-192.png',
          badge: '/icon-192.png',
          vibrate: [200, 100, 200],
          tag: `notification-${Date.now()}`,
          data: {
            action_type: action_type || 'none',
            url: '/'
          }
        });

        await webpush.sendNotification(pushSubscription, payload);

        // Update last_used
        await base44.asServiceRole.entities.PushSubscription.update(sub.id, {
          last_used: new Date().toISOString()
        });

        sentCount++;
        results.push({ subscription_id: sub.id, status: 'sent' });
        
        console.log('✓ Sent to subscription:', sub.id);
      } catch (err) {
        console.error('Failed to send to subscription:', sub.id, err);
        
        // Mark as inactive if token is invalid
        if (err.statusCode === 410 || err.statusCode === 404) {
          await base44.asServiceRole.entities.PushSubscription.update(sub.id, {
            is_active: false
          });
          results.push({ subscription_id: sub.id, status: 'invalid_token' });
        } else {
          results.push({ subscription_id: sub.id, status: 'error', error: err.message });
        }
      }
    }

    const duration = Date.now() - startTime;

    console.log(`=== COMPLETE: ${sentCount}/${subscriptions.length} sent in ${duration}ms ===`);

    return Response.json({
      ok: sentCount > 0,
      sent_count: sentCount,
      total_subscriptions: subscriptions.length,
      results,
      duration_ms: duration
    });

  } catch (error) {
    console.error('SendPushToTrainee error:', error);
    
    return Response.json({ 
      ok: false, 
      error: error.message,
      duration_ms: Date.now() - startTime
    }, { status: 500 });
  }
});