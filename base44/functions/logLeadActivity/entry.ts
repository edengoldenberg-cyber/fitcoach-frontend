import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

/**
 * Shared helper to log lead activity.
 * Params: { leadId, coach_email, activityType, activitySource?, message, metadata? }
 */
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const { leadId, coach_email, activityType, activitySource, message, metadata } = await req.json();

    if (!leadId || !activityType) {
      return Response.json({ ok: false, error: 'Missing leadId or activityType' }, { status: 400 });
    }

    const entry = await base44.asServiceRole.entities.LeadActivityLog.create({
      leadId,
      coach_email: coach_email || 'system',
      activityType,
      activitySource: activitySource || 'SYSTEM',
      message: message || '',
      metadata: metadata || {},
    });

    return Response.json({ ok: true, id: entry.id });
  } catch (error) {
    return Response.json({ ok: false, error: error.message }, { status: 500 });
  }
});