import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

// Helper: Create fingerprint for deduplication
function createFingerprint(email, type, dateKey, scope) {
  return `${email}|${type}|${dateKey}|${scope}`;
}

// Helper: Get date key (YYYY-MM-DD)
function getDateKey(date = new Date()) {
  return date.toISOString().split('T')[0];
}

function normalizeSource(source) {
  const value = String(source || 'SYSTEM').toUpperCase();
  const map = {
    AUTO: 'SYSTEM',
    COACH: 'COACH_MESSAGE',
    SYSTEM: 'SYSTEM',
    IN_APP: 'IN_APP',
    PUSH: 'PUSH',
    WHATSAPP: 'WHATSAPP',
    WATER_MISSING: 'HYDRATION_REMINDER',
    MEAL_MISSING: 'NUTRITION_NUDGE',
    WORKOUT_MISSING: 'WORKOUT_REMINDER',
    SHAPE_LEAGUE: 'SHAPE_LEAGUE',
    HYDRATION_REMINDER: 'HYDRATION_REMINDER',
    AI_RETENTION: 'AI_RETENTION',
    STREAK_WARNING: 'STREAK_WARNING',
    WORKOUT_REMINDER: 'WORKOUT_REMINDER',
    COACH_MESSAGE: 'COACH_MESSAGE',
    NUTRITION_NUDGE: 'NUTRITION_NUDGE'
  };
  return map[value] || 'SYSTEM';
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();
    const {
      trainee_email,
      type,
      title_he,
      body_he,
      scope = 'trainee',
      severity = 'info',
      source = 'auto',
      action_url,
      action_type,
      action_label,
      metadata = {},
      skip_dedup = false,
    } = body;

    // Validation
    if (!trainee_email || !type || !title_he || !body_he) {
      return Response.json({
        ok: false,
        error: 'Missing required fields: trainee_email, type, title_he, body_he'
      }, { status: 400 });
    }

    // Create fingerprint
    const dateKey = getDateKey();
    const fingerprint = createFingerprint(trainee_email, type, dateKey, scope);

    // Check for duplicates (last 24 hours)
    if (!skip_dedup) {
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      
      const existing = await base44.entities.Notification.filter({
        fingerprint,
        created_date: { $gte: yesterday.toISOString() }
      });

      if (existing.length > 0) {
        await base44.asServiceRole.entities.NotificationAuditLog.create({
          trainee_email,
          notification_type: type,
          source_system: normalizeSource(metadata?.source_system || source || type),
          title: title_he,
          body: body_he,
          trigger_reason: metadata?.trigger_reason || 'duplicate notification blocked',
          created_at: new Date().toISOString(),
          status: 'duplicate_blocked',
          channel: 'in_app',
          deduplication_key: fingerprint,
          blocked_reason: 'Notification fingerprint already exists in the cooldown window',
          cooldown_minutes: 1440,
          related_notification_id: existing[0].id,
          send_pipeline: 'createNotification.dedup',
          debug_payload: metadata
        });
        console.log('Duplicate notification blocked:', fingerprint);
        return Response.json({
          ok: true,
          created: false,
          reason: 'duplicate',
          fingerprint,
          existing_id: existing[0].id
        });
      }
    }

    const sourceSystem = normalizeSource(metadata?.source_system || source || type);

    // Create notification
    const notification = await base44.entities.Notification.create({
      trainee_email,
      scope,
      type,
      title_he,
      body_he,
      status: 'unread',
      severity,
      source,
      fingerprint,
      action_url,
      action_type,
      action_label,
      metadata,
      sent_at: new Date().toISOString(),
      channel_sent: 'in_app'
    });

    // Create receipt
    await base44.entities.NotificationReceipt.create({
      notification_id: notification.id,
      trainee_email,
      delivered_at: new Date().toISOString()
    });

    await base44.asServiceRole.entities.NotificationAuditLog.create({
      trainee_email,
      notification_type: type,
      source_system: sourceSystem,
      title: title_he,
      body: body_he,
      trigger_reason: metadata?.trigger_reason || type,
      created_at: new Date().toISOString(),
      sent_at: notification.sent_at,
      delivered_at: new Date().toISOString(),
      status: 'delivered',
      channel: 'in_app',
      deduplication_key: fingerprint,
      related_notification_id: notification.id,
      send_pipeline: 'createNotification.in_app',
      debug_payload: metadata
    });

    console.log('✓ Notification created:', notification.id);

    return Response.json({
      ok: true,
      created: true,
      notification_id: notification.id,
      fingerprint
    });

  } catch (error) {
    console.error('createNotification error:', error);
    return Response.json({
      ok: false,
      error: error.message
    }, { status: 500 });
  }
});