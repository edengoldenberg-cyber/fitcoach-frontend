import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

/**
 * Params: { taskId, outcome?, status?, assignedTo?, dueAt?, notes? }
 * Updates a CallTask and syncs lead status when outcome is set.
 */

const OUTCOME_TO_LEAD_STATUS = {
  INTERESTED: 'INTERESTED',
  BOOKED: 'BOOKED',
  NOT_RELEVANT: 'CLOSED',
  // NO_ANSWER and FOLLOW_UP_NEEDED → don't change lead status
};

async function logEvent(base44, coachEmail, flowEvent, payload) {
  await base44.asServiceRole.entities.WhatsAppDiagnosticsLog.create({
    coach_email: coachEmail || 'system',
    event: 'RULE_TRIGGERED',
    payload: { flowEvent, ...payload }
  }).catch(() => {});
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const { taskId, outcome, status, assignedTo, dueAt, notes } = await req.json();

    if (!taskId) return Response.json({ ok: false, error: 'Missing taskId' }, { status: 400 });

    const allTasks = await base44.asServiceRole.entities.CallTask.filter({});
    const task = allTasks.find(t => t.id === taskId);
    if (!task) return Response.json({ ok: false, error: 'Task not found' });

    const coachEmail = task.coach_email || 'system';
    const updates = {};

    if (status) updates.status = status;
    if (assignedTo !== undefined) updates.assignedTo = assignedTo;
    if (dueAt) updates.dueAt = dueAt;
    if (notes !== undefined) updates.notes = notes;
    if (outcome) {
      updates.callOutcome = outcome;
      if (outcome === 'DONE' || OUTCOME_TO_LEAD_STATUS[outcome]) {
        updates.status = 'DONE';
        updates.completedAt = new Date().toISOString();
      }
      if (outcome === 'NO_ANSWER') {
        updates.status = 'NO_ANSWER';
      }
    }

    await base44.asServiceRole.entities.CallTask.update(taskId, updates);

    const isCompleted = updates.status === 'DONE';
    await logEvent(base44, coachEmail, isCompleted ? 'CALL_TASK_COMPLETED' : 'CALL_TASK_UPDATED', {
      taskId,
      leadId: task.leadId,
      updates
    });

    // Sync lead status if outcome maps to a lead status
    if (outcome && OUTCOME_TO_LEAD_STATUS[outcome]) {
      await base44.asServiceRole.entities.Lead.update(task.leadId, {
        status: OUTCOME_TO_LEAD_STATUS[outcome]
      }).catch(() => {});
    }

    return Response.json({ ok: true, taskId, updates });
  } catch (error) {
    return Response.json({ ok: false, error: error.message }, { status: 500 });
  }
});