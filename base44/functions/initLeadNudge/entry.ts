/**
 * initLeadNudge — called externally when first outbound is sent to a lead.
 * Creates or resets the LeadNudgeState for the lead.
 * 
 * Payload: { leadId, coach_email, nudgeBaseline (ISO string) }
 */

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const { leadId, coach_email, nudgeBaseline } = await req.json();

    if (!leadId || !coach_email) {
      return Response.json({ error: 'Missing leadId or coach_email' }, { status: 400 });
    }

    const baseline = nudgeBaseline || new Date().toISOString();

    // Check if record already exists
    const existing = await base44.asServiceRole.entities.LeadNudgeState.filter({ leadId });

    if (existing.length > 0) {
      // Reset: start fresh from new baseline
      await base44.asServiceRole.entities.LeadNudgeState.update(existing[0].id, {
        lastNudgeStep: 0,
        lastNudgeAt: null,
        nudgeBaseline: baseline,
        stopped: false,
        stopReason: null,
      });
      return Response.json({ ok: true, action: 'reset', id: existing[0].id });
    }

    // Create new record
    const created = await base44.asServiceRole.entities.LeadNudgeState.create({
      leadId,
      coach_email,
      lastNudgeStep: 0,
      nudgeBaseline: baseline,
      stopped: false,
    });

    return Response.json({ ok: true, action: 'created', id: created.id });

  } catch (error) {
    console.error('[initLeadNudge] Error:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});