import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

async function logEvent(base44, coachEmail, flowEvent, payload) {
  await base44.asServiceRole.entities.WhatsAppDiagnosticsLog.create({
    coach_email: coachEmail || 'system',
    event: 'RULE_TRIGGERED',
    payload: { flowEvent, ...payload }
  }).catch(() => {});
}

/**
 * Params: { leadId, reason, priority? }
 * Creates a CallTask for a lead if no OPEN/IN_PROGRESS task already exists.
 */
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const { leadId, reason, priority } = await req.json();

    if (!leadId) return Response.json({ ok: false, error: 'Missing leadId' }, { status: 400 });

    const allLeads = await base44.asServiceRole.entities.Lead.filter({});
    const lead = allLeads.find(l => l.id === leadId);
    if (!lead) return Response.json({ ok: false, error: 'Lead not found' });

    const coachEmail = lead.coach_email || 'system';

    // Guard: no duplicate open task
    const existing = await base44.asServiceRole.entities.CallTask.filter({ leadId }).catch(() => []);
    const hasOpen = existing && existing.some(t => t && (t.status === 'OPEN' || t.status === 'IN_PROGRESS'));
    if (hasOpen) {
      return Response.json({ ok: true, skipped: true, reason: 'Open task already exists' });
    }

    // Determine priority
    const lowerReason = (reason || '').toLowerCase();
    let taskPriority = (priority && typeof priority === 'string') ? priority : 'MEDIUM';
    if (lowerReason && ['תתקשר', 'תחזור', 'דבר איתי'].some(kw => lowerReason.includes(kw))) {
      taskPriority = 'HIGH';
    }
    if (lead && lead.leadTemperature === 'HOT') {
      taskPriority = 'HIGH';
    }

    // Due in 2 hours by default
    const dueAt = new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString();

    const leadName = (lead && (lead.firstName || lead.lastName)) 
      ? [lead.firstName, lead.lastName].filter(Boolean).join(' ')
      : 'Unknown';

    const task = await base44.asServiceRole.entities.CallTask.create({
      leadId,
      leadName,
      leadPhone: (lead && (lead.phoneE164 || lead.phone)) || '',
      coach_email: coachEmail,
      assignedTo: 'unassigned',
      status: 'OPEN',
      priority: taskPriority,
      reason: (reason && typeof reason === 'string') ? reason : 'Manual',
      dueAt,
    });

    await logEvent(base44, coachEmail, 'CALL_TASK_CREATED', {
      taskId: task?.id,
      leadId,
      leadName,
      priority: taskPriority,
      reason: reason || 'Manual'
    });

    await base44.asServiceRole.functions.invoke('logLeadActivity', {
      leadId,
      coach_email: coachEmail || 'system',
      activityType: 'CALL_TASK_CREATED',
      activitySource: 'SYSTEM',
      message: `משימת שיחה נוצרה – עדיפות ${taskPriority}${reason && reason.slice ? ': ' + reason.slice(0, 60) : ''}`,
      metadata: { taskId: task?.id, priority: taskPriority, reason: reason || null }
    }).catch(err => {
      console.log('[createCallTask] Activity log failed (non-fatal):', err?.message);
    });

    return Response.json({ ok: true, taskId: task.id, priority: taskPriority });
  } catch (error) {
    return Response.json({ ok: false, error: error.message }, { status: 500 });
  }
});