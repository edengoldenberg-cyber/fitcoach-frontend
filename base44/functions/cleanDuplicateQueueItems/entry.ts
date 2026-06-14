import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

async function log(base44, coachEmail, event, payload) {
  await base44.asServiceRole.entities.WhatsAppDiagnosticsLog.create({
    coach_email: coachEmail || 'system',
    event: 'RULE_TRIGGERED',
    payload: { flowEvent: event, ...payload }
  }).catch(() => {});
}

function extractSessionId(q) {
  // Prefer dedicated session_id field; fall back to provider_response for legacy items
  if (q.session_id) return q.session_id;
  try { return JSON.parse(q.provider_response || '{}')?.sessionId || null; } catch (_) { return null; }
}

function extractStepOrder(q) {
  const m = (q.template_key || '').match(/flow_step_(\d+)/);
  return m ? parseInt(m[1]) : null;
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ ok: false, error: 'Unauthorized' }, { status: 401 });

    const { leadId } = await req.json();
    if (!leadId) return Response.json({ ok: false, error: 'leadId required' }, { status: 400 });

    const lead = await base44.asServiceRole.entities.Lead.get(leadId).catch(() => null);
    if (!lead) return Response.json({ ok: false, error: 'Lead not found' });
    const coachEmail = lead.coach_email || 'system';

    // ── 1. Fix multiple active states — keep only the newest ───────────────
    const allStates = await base44.asServiceRole.entities.LeadConversationState.filter({ leadId }).catch(() => []);
    const activeStates = allStates.filter(s => s.isActive === true && s.flowStatus === 'ACTIVE');
    let statesDeactivated = 0;

    let activeState = null;
    if (activeStates.length > 0) {
      const sorted = [...activeStates].sort((a, b) =>
        new Date(b.lastFlowActionAt || b.updated_date || 0) - new Date(a.lastFlowActionAt || a.updated_date || 0)
      );
      activeState = sorted[0];
      // Deactivate all but the newest
      for (let i = 1; i < sorted.length; i++) {
        await base44.asServiceRole.entities.LeadConversationState.update(sorted[i].id, {
          isActive: false, flowStatus: 'STOPPED'
        }).catch(() => {});
        statesDeactivated++;
      }
    } else {
      // No active states — pick most recent overall as reference
      activeState = allStates.sort((a, b) =>
        new Date(b.lastFlowActionAt || b.updated_date || 0) - new Date(a.lastFlowActionAt || a.updated_date || 0)
      )[0] || null;
    }

    const activeSessionId = activeState?.sessionId || null;

    // ── 2. Cancel queue items from old sessions ────────────────────────────
    const allQueue = await base44.asServiceRole.entities.WhatsAppMessageQueue.filter({ context_id: leadId }).catch(() => []);
    let oldSessionCancelled = 0;

    if (activeSessionId) {
      for (const q of allQueue) {
        if (!['queued', 'sending'].includes(q.status)) continue;
        const qSession = extractSessionId(q);
        if (qSession && qSession !== activeSessionId) {
          await base44.asServiceRole.entities.WhatsAppMessageQueue.update(q.id, {
            status: 'cancelled',
            error_message: 'OLD_SESSION_QUEUE_CANCELLED'
          }).catch(() => {});
          oldSessionCancelled++;
        }
      }
    }

    // ── 3. Find and cancel duplicate queue items for the active session ────
    // Reload queue after old-session cancellation
    const freshQueue = await base44.asServiceRole.entities.WhatsAppMessageQueue.filter({ context_id: leadId }).catch(() => []);

    // Group by sessionId + stepOrder
    const groups = {};
    for (const q of freshQueue) {
      const stepOrder = extractStepOrder(q);
      const sessionId = extractSessionId(q);
      if (stepOrder === null) continue;
      const key = `${sessionId || 'none'}::${stepOrder}`;
      if (!groups[key]) groups[key] = [];
      groups[key].push(q);
    }

    let duplicatesCancelled = 0;
    const duplicateDetails = [];

    for (const [key, items] of Object.entries(groups)) {
      if (items.length <= 1) continue;

      // Sort by created_date ascending — oldest first
      const sorted = [...items].sort((a, b) => new Date(a.created_date) - new Date(b.created_date));
      const activeItems = sorted.filter(q => ['queued', 'sending', 'sent'].includes(q.status));

      if (activeItems.length <= 1) continue;

      // Keep earliest, cancel all others
      const [keep, ...toCancel] = activeItems;
      for (const dup of toCancel) {
        await base44.asServiceRole.entities.WhatsAppMessageQueue.update(dup.id, {
          status: 'cancelled',
          error_message: 'DUPLICATE_CLEANUP'
        }).catch(() => {});
        duplicatesCancelled++;
      }

      duplicateDetails.push({ key, kept: keep.id, cancelled: toCancel.map(d => d.id) });
    }

    await log(base44, coachEmail, 'DUPLICATE_QUEUE_CLEANUP_DONE', {
      leadId, duplicatesCancelled, statesDeactivated, oldSessionCancelled,
      activeSessionId, groups: duplicateDetails
    });

    return Response.json({
      ok: true,
      leadId,
      duplicatesCancelled,
      statesDeactivated,
      oldSessionCancelled,
      activeSessionId,
      summary: `Cleaned ${duplicatesCancelled} duplicate queue items, deactivated ${statesDeactivated} extra states, cancelled ${oldSessionCancelled} old-session queue items`,
    });

  } catch (error) {
    return Response.json({ ok: false, error: error.message }, { status: 500 });
  }
});