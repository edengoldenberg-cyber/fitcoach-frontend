import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    
    // Admin only
    const user = await base44.auth.me();
    if (!user || user.role !== 'admin') {
      return Response.json({ ok: false, error: 'Admin access required' }, { status: 403 });
    }

    console.log('[QUEUE_CLEANUP] Starting safe queue cleanup');

    // Get all queue items
    const allQueue = await base44.asServiceRole.entities.WhatsAppMessageQueue.list('-created_date', 1000);
    console.log('[QUEUE_CLEANUP] Total queue items: ' + allQueue.length);

    // Identify items to delete (ONLY failed/cancelled/old stale items)
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    
    const toDelete = allQueue.filter(item => {
      const status = item.status;
      const createdDate = item.created_date;
      const isOldStaleQueued = status === 'queued' && createdDate < sevenDaysAgo;
      const isFailed = status === 'failed';
      const isCancelled = status === 'cancelled';
      
      return isFailed || isCancelled || isOldStaleQueued;
    });

    console.log('[QUEUE_CLEANUP] Items to delete: ' + toDelete.length);
    console.log('[QUEUE_CLEANUP] Delete breakdown: failed=' + toDelete.filter(i => i.status === 'failed').length + ' cancelled=' + toDelete.filter(i => i.status === 'cancelled').length + ' oldQueued=' + toDelete.filter(i => i.status === 'queued' && i.created_date < sevenDaysAgo).length);

    // Delete identified items
    let deleted = 0;
    for (const item of toDelete) {
      try {
        await base44.asServiceRole.entities.WhatsAppMessageQueue.delete(item.id);
        deleted++;
        console.log('[QUEUE_CLEANUP] Deleted msgId=' + item.id + ' status=' + item.status);
      } catch (err) {
        console.log('[QUEUE_CLEANUP_ERROR] Failed to delete msgId=' + item.id + ': ' + err.message);
      }
    }

    // Verify Green API config is untouched
    const configs = await base44.asServiceRole.entities.WhatsAppProviderConfig.list('-created_date', 100);
    console.log('[QUEUE_CLEANUP] Verified: ' + configs.length + ' Green API configs still intact');
    
    for (const config of configs) {
      console.log('[QUEUE_CLEANUP_VERIFY] Coach=' + config.coach_email + ' provider=' + config.provider_type + ' enabled=' + config.is_enabled + ' hasCredentials=' + !!(config.api_token && config.instance_id));
    }

    return Response.json({
      ok: true,
      cleanup: {
        totalQueueBefore: allQueue.length,
        deleted: deleted,
        remaining: allQueue.length - deleted,
        breakdown: {
          failedDeleted: toDelete.filter(i => i.status === 'failed').length,
          cancelledDeleted: toDelete.filter(i => i.status === 'cancelled').length,
          oldQueuedDeleted: toDelete.filter(i => i.status === 'queued' && i.created_date < sevenDaysAgo).length
        },
        greenApiConfigsVerified: configs.length,
        timestamp: new Date().toISOString()
      }
    });
  } catch (error) {
    console.error('[QUEUE_CLEANUP] Fatal error: ' + error.message);
    return Response.json({ ok: false, error: error.message }, { status: 500 });
  }
});