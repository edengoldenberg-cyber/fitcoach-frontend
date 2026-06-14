import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  const startTime = Date.now();
  const report = {
    internalNotifications: { status: '❌', details: '', tests: [] },
    automation: { status: '❌', details: '', tests: [] },
    deduplication: { status: '❌', details: '', created: 0, blocked: 0 },
    push: { status: '❌', details: '', subscriptions: 0 },
    performance: { status: '❌', details: '', duration: 0, count: 0 },
    stability: { status: '✔', details: 'No crashes detected' }
  };

  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    
    if (user?.role !== 'admin') {
      return Response.json({ error: 'Forbidden: Admin access required' }, { status: 403 });
    }

    const body = await req.json();
    const { test_trainee_email } = body;
    const testEmail = test_trainee_email || user.email;

    console.log('=== Starting Notification System Test ===');

    // Test 1: Internal Notifications
    console.log('Test 1: Internal Notifications');
    try {
      const testNotif = await base44.asServiceRole.functions.invoke('createNotification', {
        trainee_email: testEmail,
        type: 'system_alert',
        title_he: '🧪 בדיקה',
        body_he: 'התראת בדיקה אוטומטית',
        severity: 'info',
        source: 'system'
      });

      if (testNotif.data.ok && testNotif.data.created) {
        report.internalNotifications.status = '✔';
        report.internalNotifications.details = `Notification created successfully`;
        report.internalNotifications.tests.push({ name: 'Basic creation', passed: true });
      } else {
        report.internalNotifications.details = testNotif.data.reason || 'Failed to create';
        report.internalNotifications.tests.push({ name: 'Basic creation', passed: false });
      }
    } catch (err) {
      report.internalNotifications.details = `Error: ${err.message}`;
      report.internalNotifications.tests.push({ name: 'Basic creation', passed: false });
      report.stability.status = '❌';
      report.stability.details = `Internal notifications crashed: ${err.message}`;
    }

    // Test 2: Automation (Meal, Water, Workout Missing)
    console.log('Test 2: Automation');
    try {
      const automationTests = [
        { type: 'meal_missing', title_he: 'חסרה ארוחת בוקר', body_he: 'לא נרשמו ארוחות היום' },
        { type: 'water_missing', title_he: 'חסר שתייה', body_he: 'לא נרשמה שתייה היום' },
        { type: 'workout_missing', title_he: 'חסר אימון', body_he: 'אימון מתוכנן לא בוצע' }
      ];

      let passedCount = 0;
      for (const test of automationTests) {
        const res = await base44.asServiceRole.functions.invoke('createNotification', {
          trainee_email: testEmail,
          type: test.type,
          title_he: test.title_he,
          body_he: test.body_he,
          severity: 'warning',
          source: 'auto'
        });

        const passed = res.data.ok && res.data.created;
        if (passed) passedCount++;
        report.automation.tests.push({ name: test.type, passed });
      }

      if (passedCount === 3) {
        report.automation.status = '✔';
        report.automation.details = 'All 3 automation types work';
      } else {
        report.automation.details = `${passedCount}/3 automation types work`;
      }
    } catch (err) {
      report.automation.details = `Error: ${err.message}`;
      report.stability.status = '❌';
      report.stability.details = `Automation crashed: ${err.message}`;
    }

    // Test 3: Deduplication
    console.log('Test 3: Deduplication');
    try {
      const results = [];
      for (let i = 0; i < 3; i++) {
        const res = await base44.asServiceRole.functions.invoke('createNotification', {
          trainee_email: testEmail,
          type: 'meal_missing',
          title_he: 'חסרה ארוחה',
          body_he: 'בדיקת dedupe',
          severity: 'warning',
          source: 'auto'
        });
        results.push(res.data);
      }

      const created = results.filter(r => r.created).length;
      const blocked = results.filter(r => r.reason === 'duplicate').length;

      report.deduplication.created = created;
      report.deduplication.blocked = blocked;

      if (created === 1 && blocked === 2) {
        report.deduplication.status = '✔';
        report.deduplication.details = 'Dedupe works: 1 created, 2 blocked';
      } else {
        report.deduplication.details = `Failed: ${created} created, ${blocked} blocked`;
      }
    } catch (err) {
      report.deduplication.details = `Error: ${err.message}`;
      report.stability.status = '❌';
      report.stability.details = `Deduplication crashed: ${err.message}`;
    }

    // Test 4: Push
    console.log('Test 4: Push Notifications');
    try {
      const pushTest = await base44.asServiceRole.functions.invoke('testPushNotifications', {
        trainee_email: testEmail
      });

      if (pushTest.data.ok) {
        report.push.subscriptions = pushTest.data.activeSubscriptionsCount;
        
        if (pushTest.data.vapidConfigured && pushTest.data.activeSubscriptionsCount > 0) {
          report.push.status = '✔';
          report.push.details = `VAPID configured, ${pushTest.data.activeSubscriptionsCount} active subscriptions`;
        } else if (!pushTest.data.vapidConfigured) {
          report.push.status = '⚠️';
          report.push.details = 'VAPID keys not configured';
        } else {
          report.push.status = '⚠️';
          report.push.details = 'No active subscriptions';
        }
      } else {
        report.push.details = pushTest.data.error;
      }
    } catch (err) {
      report.push.details = `Error: ${err.message}`;
    }

    // Test 5: Performance (100 notifications)
    console.log('Test 5: Performance');
    try {
      const perfStart = Date.now();
      const promises = [];
      const targetCount = 100;
      
      for (let i = 0; i < targetCount; i++) {
        promises.push(
          base44.asServiceRole.functions.invoke('createNotification', {
            trainee_email: testEmail,
            type: 'custom',
            title_he: `בדיקה ${i}`,
            body_he: 'Performance test',
            severity: 'info',
            source: 'system',
            skip_dedup: true
          })
        );
      }

      const results = await Promise.all(promises);
      const perfDuration = Date.now() - perfStart;
      const successCount = results.filter(r => r.data?.ok).length;

      report.performance.duration = perfDuration;
      report.performance.count = successCount;

      if (successCount === targetCount && perfDuration < 10000) {
        report.performance.status = '✔';
        report.performance.details = `${successCount}/${targetCount} in ${perfDuration}ms`;
      } else if (successCount < targetCount) {
        report.performance.status = '❌';
        report.performance.details = `Only ${successCount}/${targetCount} succeeded in ${perfDuration}ms`;
      } else {
        report.performance.status = '⚠️';
        report.performance.details = `Slow: ${perfDuration}ms for ${targetCount} notifications`;
      }
    } catch (err) {
      report.performance.details = `Error: ${err.message}`;
      report.stability.status = '❌';
      report.stability.details = `Performance test crashed: ${err.message}`;
    }

    const totalDuration = Date.now() - startTime;
    console.log('=== Test Complete ===');

    return Response.json({
      ok: true,
      report,
      duration_ms: totalDuration,
      summary: {
        passed: Object.values(report).filter(r => r.status === '✔').length,
        failed: Object.values(report).filter(r => r.status === '❌').length,
        warnings: Object.values(report).filter(r => r.status === '⚠️').length,
        total: Object.keys(report).length
      }
    });

  } catch (error) {
    console.error('Test system crashed:', error);
    report.stability.status = '❌';
    report.stability.details = `System crashed: ${error.message}`;

    return Response.json({
      ok: false,
      report,
      error: error.message,
      duration_ms: Date.now() - startTime
    }, { status: 500 });
  }
});