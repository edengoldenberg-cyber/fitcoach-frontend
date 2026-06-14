import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  const timeout = 3000; // 3 seconds max
  const startTime = Date.now();
  
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();
    const { trainee_email } = body;
    const testEmail = trainee_email || user.email;

    // Race against timeout
    const result = await Promise.race([
      runTest(base44, testEmail),
      new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Test timeout after 3s')), timeout)
      )
    ]);

    return Response.json({
      ok: true,
      ...result,
      duration_ms: Date.now() - startTime
    });

  } catch (error) {
    return Response.json({
      ok: false,
      error: error.message,
      duration_ms: Date.now() - startTime
    }, { status: 500 });
  }
});

async function runTest(base44, trainee_email) {
  // Check permission state (browser-side, can't check here)
  const permissionState = 'unknown';

  // Count subscriptions
  const subscriptions = await base44.entities.PushSubscription.filter({
    trainee_email
  });

  const activeSubscriptions = subscriptions.filter(s => s.is_active);

  // Test push if subscriptions exist
  let testPushResult = null;
  if (activeSubscriptions.length > 0) {
    try {
      const pushResult = await base44.functions.invoke('sendPushToTrainee', {
        trainee_email,
        title: '🧪 בדיקת Push',
        body: 'זוהי הודעת בדיקה - אם אתה רואה את זה, Push עובד!',
        data: { test: true }
      });
      
      testPushResult = {
        success: pushResult.data.ok,
        sentCount: pushResult.data.sentCount,
        failedCount: pushResult.data.failedCount
      };
    } catch (err) {
      testPushResult = {
        success: false,
        error: err.message
      };
    }
  }

  return {
    permissionState,
    subscriptionsCount: subscriptions.length,
    activeSubscriptionsCount: activeSubscriptions.length,
    testPushResult,
    vapidConfigured: !!(Deno.env.get('VAPID_PUBLIC_KEY') && Deno.env.get('VAPID_PRIVATE_KEY'))
  };
}