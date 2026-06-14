import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

const DEFAULT_COOLDOWN_MINUTES = 30;

function nowIso() {
  return new Date().toISOString();
}

function normalizeSource(source) {
  const value = String(source || 'SYSTEM').toUpperCase();
  const map = {
    AUTO: 'SYSTEM',
    COACH: 'COACH_MESSAGE',
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
    NUTRITION_NUDGE: 'NUTRITION_NUDGE',
    SYSTEM: 'SYSTEM'
  };
  return map[value] || 'SYSTEM';
}

function buildDeduplicationKey(data) {
  return data.deduplication_key || [
    data.trainee_id || data.trainee_email || 'unknown',
    data.notification_type || 'notification',
    normalizeSource(data.source_system),
    data.title || '',
    data.body || ''
  ].join('|').toLowerCase();
}

async function findRecentDuplicate(base44, deduplicationKey, cooldownMinutes) {
  const logs = await base44.asServiceRole.entities.NotificationAuditLog.filter({ deduplication_key: deduplicationKey }).catch(() => []);
  const cutoff = Date.now() - cooldownMinutes * 60 * 1000;
  return logs.find((log) => {
    const created = new Date(log.created_at || log.created_date || 0).getTime();
    return created >= cutoff && log.status !== 'duplicate_blocked' && log.status !== 'cancelled';
  });
}

async function createAuditLog(base44, data) {
  const createdAt = data.created_at || nowIso();
  const cooldownMinutes = Number(data.cooldown_minutes || DEFAULT_COOLDOWN_MINUTES);
  const deduplicationKey = buildDeduplicationKey(data);
  const duplicate = data.skip_dedup ? null : await findRecentDuplicate(base44, deduplicationKey, cooldownMinutes);

  if (duplicate) {
    const blocked = await base44.asServiceRole.entities.NotificationAuditLog.create({
      trainee_id: data.trainee_id,
      trainee_email: data.trainee_email,
      notification_type: data.notification_type || 'notification',
      source_system: normalizeSource(data.source_system),
      title: data.title || 'Notification',
      body: data.body || '',
      trigger_reason: data.trigger_reason || 'duplicate protection',
      created_at: createdAt,
      status: 'duplicate_blocked',
      channel: data.channel || 'system',
      deduplication_key: deduplicationKey,
      blocked_reason: 'Duplicate notification inside cooldown window',
      cooldown_minutes: cooldownMinutes,
      related_notification_id: data.related_notification_id || duplicate.related_notification_id,
      related_queue_id: data.related_queue_id || duplicate.related_queue_id,
      send_pipeline: data.send_pipeline || 'audit.dedup',
      debug_payload: data.debug_payload || {}
    });
    return { ok: true, duplicate_blocked: true, audit_log: blocked, existing_audit_log_id: duplicate.id };
  }

  const log = await base44.asServiceRole.entities.NotificationAuditLog.create({
    trainee_id: data.trainee_id,
    trainee_email: data.trainee_email,
    notification_type: data.notification_type || 'notification',
    source_system: normalizeSource(data.source_system),
    title: data.title || 'Notification',
    body: data.body || '',
    trigger_reason: data.trigger_reason || 'notification requested',
    created_at: createdAt,
    sent_at: data.sent_at,
    delivered_at: data.delivered_at,
    opened_at: data.opened_at,
    status: data.status || 'queued',
    error_message: data.error_message,
    provider_response: data.provider_response,
    device_type: data.device_type,
    app_version: data.app_version,
    channel: data.channel || 'in_app',
    deduplication_key: deduplicationKey,
    cooldown_minutes: cooldownMinutes,
    related_notification_id: data.related_notification_id,
    related_queue_id: data.related_queue_id,
    send_pipeline: data.send_pipeline || 'audit.create',
    debug_payload: data.debug_payload || {}
  });

  return { ok: true, duplicate_blocked: false, audit_log: log };
}

async function updateAuditLog(base44, data) {
  let logs = [];
  if (data.audit_log_id) {
    logs = await base44.asServiceRole.entities.NotificationAuditLog.filter({ id: data.audit_log_id }).catch(() => []);
  } else if (data.related_notification_id) {
    logs = await base44.asServiceRole.entities.NotificationAuditLog.filter({ related_notification_id: data.related_notification_id }).catch(() => []);
  } else if (data.related_queue_id) {
    logs = await base44.asServiceRole.entities.NotificationAuditLog.filter({ related_queue_id: data.related_queue_id }).catch(() => []);
  }

  const log = logs[0];
  if (!log?.id) return { ok: false, error: 'Audit log not found' };

  const update = {
    status: data.status || log.status,
    sent_at: data.sent_at || log.sent_at,
    delivered_at: data.delivered_at || log.delivered_at,
    opened_at: data.opened_at || log.opened_at,
    error_message: data.error_message || log.error_message,
    provider_response: data.provider_response || log.provider_response,
    device_type: data.device_type || log.device_type,
    app_version: data.app_version || log.app_version,
    send_pipeline: data.send_pipeline || log.send_pipeline,
    debug_payload: data.debug_payload || log.debug_payload
  };

  const updated = await base44.asServiceRole.entities.NotificationAuditLog.update(log.id, update);
  return { ok: true, audit_log: updated };
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json();
    const action = body.action || 'create';

    if (body.event && body.data) {
      const { event, data } = body;
      if (event.entity_name === 'Notification') {
        if (event.type === 'update' && (data.status === 'read' || data.read_at)) {
          const result = await updateAuditLog(base44, {
            related_notification_id: data.id,
            status: 'opened',
            opened_at: data.read_at || nowIso(),
            send_pipeline: 'entity.Notification.opened',
            debug_payload: data.metadata || {}
          });
          return Response.json(result);
        }

        const result = await createAuditLog(base44, {
          trainee_email: data.trainee_email,
          notification_type: data.type || 'in_app',
          source_system: data.source || data.metadata?.source_system || 'IN_APP',
          title: data.title_he || data.title || 'Notification',
          body: data.body_he || data.body || '',
          trigger_reason: data.metadata?.trigger_reason || data.type || 'notification entity created',
          status: data.status === 'read' ? 'opened' : 'delivered',
          channel: data.channel_sent || 'in_app',
          sent_at: data.sent_at || data.created_date || nowIso(),
          delivered_at: data.created_date || nowIso(),
          opened_at: data.read_at,
          deduplication_key: data.fingerprint,
          related_notification_id: data.id,
          send_pipeline: 'entity.Notification',
          skip_dedup: true,
          debug_payload: data.metadata || {}
        });
        return Response.json(result);
      }

      if (event.entity_name === 'WhatsAppMessageQueue') {
        const status = data.status === 'failed' ? 'failed' : data.status === 'sent' ? 'sent' : data.status === 'cancelled' ? 'cancelled' : data.status === 'sending' ? 'sending' : 'queued';

        if (event.type === 'update') {
          const result = await updateAuditLog(base44, {
            related_queue_id: data.id,
            status,
            sent_at: data.status === 'sent' ? data.last_attempt_at || nowIso() : undefined,
            error_message: data.error_message,
            provider_response: data.provider_response,
            send_pipeline: 'entity.WhatsAppMessageQueue.update',
            debug_payload: { attempts: data.attempts, provider_type: data.provider_type }
          });
          return Response.json(result);
        }

        const result = await createAuditLog(base44, {
          trainee_email: data.context_type === 'trainee' ? data.context_id : undefined,
          notification_type: data.template_key || 'whatsapp_message',
          source_system: 'WHATSAPP',
          title: data.template_key || 'WhatsApp Message',
          body: data.rendered_text || '',
          trigger_reason: data.context_type || 'whatsapp queue event',
          status,
          channel: 'whatsapp',
          sent_at: data.status === 'sent' ? data.last_attempt_at || nowIso() : undefined,
          error_message: data.error_message,
          provider_response: data.provider_response,
          deduplication_key: `${data.to_phone_e164}|${data.template_key}|${data.rendered_text}`,
          related_queue_id: data.id,
          send_pipeline: 'entity.WhatsAppMessageQueue.create',
          skip_dedup: true,
          debug_payload: { attempts: data.attempts, provider_type: data.provider_type }
        });
        return Response.json(result);
      }

      if (event.entity_name === 'NotificationReceipt') {
        if (data.read_at || data.action_taken_at) {
          const result = await updateAuditLog(base44, {
            related_notification_id: data.notification_id,
            status: 'opened',
            opened_at: data.read_at || data.action_taken_at || nowIso(),
            send_pipeline: 'entity.NotificationReceipt.opened'
          });
          return Response.json(result);
        }

        const result = await updateAuditLog(base44, {
          related_notification_id: data.notification_id,
          status: 'delivered',
          delivered_at: data.delivered_at || nowIso(),
          send_pipeline: 'entity.NotificationReceipt.delivered'
        });
        return Response.json(result);
      }

      return Response.json({ ok: true, skipped: event.entity_name });
    }

    if (action === 'update') {
      const result = await updateAuditLog(base44, body);
      return Response.json(result);
    }

    const result = await createAuditLog(base44, body);
    return Response.json(result);
  } catch (error) {
    console.error('[notificationAudit] Error:', error.message);
    return Response.json({ ok: false, error: error.message }, { status: 500 });
  }
});