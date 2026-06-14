/**
 * HARD RESET — WhatsApp Queue
 * Deletes ALL pending/stuck messages. Does NOT touch sent messages or simulator logs.
 * Logs the reset action for audit.
 */
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user || user.role !== 'admin') {
      return Response.json({ error: 'Admin access required' }, { status: 403 });
    }

    const body = await req.json().catch(() => ({}));
    const includesFailed = body.includeFailed !== false; // default true
    const twoMinutesAgo = new Date(Date.now() - 2 * 60 * 1000).toISOString();

    const allQueue = await base44.asServiceRole.entities.WhatsAppMessageQueue.list('-created_date', 2000);

    // Identify targets — NEVER touch 'sent' or 'provider_unconfirmed'
    const toDelete = allQueue.filter(item => {
      if (item.status === 'sent') return false;
      if (item.status === 'provider_unconfirmed') return false;
      if (item.status === 'cancelled') return true;
      if (item.status === 'queued') return true;
      if (item.status === 'retry') return true;
      if (item.status === 'sending' && item.updated_date < twoMinutesAgo) return true; // stuck
      if (item.status === 'failed' && includesFailed) return true;
      return false;
    });

    const breakdown = {
      queued: toDelete.filter(i => i.status === 'queued').length,
      sending_stuck: toDelete.filter(i => i.status === 'sending').length,
      failed: toDelete.filter(i => i.status === 'failed').length,
      retry: toDelete.filter(i => i.status === 'retry').length,
      cancelled: toDelete.filter(i => i.status === 'cancelled').length,
    };

    // Execute deletes
    let deleted = 0;
    for (const item of toDelete) {
      try {
        await base44.asServiceRole.entities.WhatsAppMessageQueue.delete(item.id);
        deleted++;
      } catch (e) {
        console.error('[RESET_QUEUE] Failed to delete', item.id, e.message);
      }
    }

    // Log the reset action in SystemAuditLog (best-effort)
    try {
      await base44.asServiceRole.entities.SystemAuditLog.create({
        action: 'QUEUE_HARD_RESET',
        performed_by: user.email,
        details: JSON.stringify({ deleted, breakdown, timestamp: new Date().toISOString() }),
        created_at: new Date().toISOString(),
      });
    } catch (_) { /* ignore audit log failures */ }

    console.log('[RESET_QUEUE] Hard reset complete. deleted=' + deleted + ' by=' + user.email);

    return Response.json({
      ok: true,
      noMessagesSent: true,
      deleted,
      breakdown,
      remaining: allQueue.length - deleted,
      performedBy: user.email,
      timestamp: new Date().toISOString(),
    });

  } catch (error) {
    return Response.json({ ok: false, error: error.message }, { status: 500 });
  }
});