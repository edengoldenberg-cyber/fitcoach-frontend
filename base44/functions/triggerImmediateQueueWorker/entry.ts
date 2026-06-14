import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

async function isImmediateWorkerEnabled(base44) {
  const configs = await base44.asServiceRole.entities.SystemConfig.filter({ key: 'WHATSAPP_IMMEDIATE_WORKER_ENABLED' }).catch(() => []);
  const record = configs?.[0];
  return record ? record.value === true : false;
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const { event, data } = await req.json();

    if (event?.type !== 'create') {
      return Response.json({ ok: true, skipped: 'not_create_event' });
    }

    if (data?.status && data.status !== 'queued') {
      return Response.json({ ok: true, skipped: 'not_queued_message' });
    }

    const immediateWorkerEnabled = await isImmediateWorkerEnabled(base44);
    if (!immediateWorkerEnabled) {
      console.log('[IMMEDIATE_TRIGGER] Skipped — immediate worker is disabled');
      return Response.json({ ok: true, skipped: 'WHATSAPP_IMMEDIATE_WORKER_DISABLED' });
    }

    const recentTriggers = await base44.asServiceRole.entities.SystemConfig.filter({ key: 'WHATSAPP_WORKER_LAST_TRIGGER_AT' }).catch(() => []);
    const lastTrigger = recentTriggers?.[0];
    const lastTriggerAt = lastTrigger?.value ? new Date(lastTrigger.value).getTime() : 0;
    if (Date.now() - lastTriggerAt < 60 * 1000) {
      console.log('[IMMEDIATE_TRIGGER] Skipped — cooldown active');
      return Response.json({ ok: true, skipped: 'cooldown_active' });
    }

    const nowIso = new Date().toISOString();
    if (lastTrigger?.id) {
      await base44.asServiceRole.entities.SystemConfig.update(lastTrigger.id, { value: nowIso }).catch(() => {});
    } else {
      await base44.asServiceRole.entities.SystemConfig.create({ key: 'WHATSAPP_WORKER_LAST_TRIGGER_AT', value: nowIso }).catch(() => {});
    }

    console.log('[IMMEDIATE_TRIGGER] WhatsAppMessageQueue created, triggering worker');
    const workerRes = await base44.asServiceRole.functions.invoke('whatsAppQueueWorker', {});
    console.log('[IMMEDIATE_TRIGGER] Worker invoked', { status: workerRes?.status });

    return Response.json({ ok: true, workerTriggered: true });
  } catch (error) {
    console.error('[IMMEDIATE_TRIGGER] Error:', error.message);
    return Response.json({ ok: true, skipped: 'safe_fail_closed', error: error.message }, { status: 200 });
  }
});