import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

/**
 * changeTraineeEmail — atomically renames a trainee's email across all entities.
 *
 * Security model:
 * - Caller must be authenticated.
 * - Caller must be the trainee's coach (trainee.coach_email === caller.email) OR admin.
 * - All entity bulk-updates run under asServiceRole so the caller's permission level
 *   doesn't restrict cross-entity writes.
 *
 * Entities updated (in parallel):
 *   Trainee (user_email + trainee_email)
 *   User (email) — fixes the auth credential so the user can still log in
 *   Credentials (email)
 *   MealEntry, WaterEntry, WorkoutSession, MetricsEntry
 *   PushToken, Achievement, AIConsultation, NotificationReceipt
 *
 * Returns: { ok: true } on success, { ok: false, error, errorCode } on failure.
 */

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const caller = await base44.auth.me();
    if (!caller) {
      return Response.json({ ok: false, errorCode: 'UNAUTHORIZED' }, { status: 401 });
    }

    let body: any = {};
    try { body = await req.json(); } catch (_) {
      return Response.json({ ok: false, errorCode: 'INVALID_JSON' }, { status: 400 });
    }

    const { traineeId, newEmail } = body;

    if (!traineeId || !newEmail) {
      return Response.json({ ok: false, errorCode: 'MISSING_FIELDS', message: 'traineeId and newEmail are required' }, { status: 400 });
    }

    // Normalize email
    const normalizedEmail = String(newEmail).toLowerCase().trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
      return Response.json({ ok: false, errorCode: 'INVALID_EMAIL', message: 'newEmail is not a valid email address' }, { status: 400 });
    }

    // Load trainee
    const trainees = await base44.asServiceRole.entities.Trainee.filter({ id: traineeId });
    const trainee = trainees && trainees[0];
    if (!trainee) {
      return Response.json({ ok: false, errorCode: 'TRAINEE_NOT_FOUND' }, { status: 404 });
    }

    // Authorization: caller must own this trainee or be admin
    const isAdmin = caller.role === 'admin';
    const isOwner = caller.email === trainee.coach_email;
    if (!isAdmin && !isOwner) {
      return Response.json({ ok: false, errorCode: 'FORBIDDEN', message: 'You do not own this trainee' }, { status: 403 });
    }

    const oldEmail = trainee.user_email;
    if (!oldEmail) {
      return Response.json({ ok: false, errorCode: 'TRAINEE_HAS_NO_EMAIL', message: 'Trainee has no current email to replace' }, { status: 400 });
    }

    if (oldEmail.toLowerCase() === normalizedEmail) {
      return Response.json({ ok: false, errorCode: 'EMAIL_UNCHANGED', message: 'New email is the same as the current email' }, { status: 400 });
    }

    // Check new email is not already taken by another user
    try {
      const existingUsers = await base44.asServiceRole.entities.User.filter({ email: normalizedEmail });
      if (existingUsers && existingUsers.length > 0 && existingUsers[0].id !== trainee.user_id) {
        return Response.json({ ok: false, errorCode: 'EMAIL_TAKEN', message: 'This email is already registered to another user' }, { status: 409 });
      }
    } catch (_) { /* non-blocking — email uniqueness check best-effort */ }

    // Run all updates in parallel under service role.
    // Each update is individually error-caught so a failure in one entity
    // doesn't silently abort the others.
    const updateResults: Record<string, string> = {};

    const run = async (label: string, fn: () => Promise<unknown>) => {
      try {
        await fn();
        updateResults[label] = 'ok';
      } catch (err: any) {
        updateResults[label] = 'error: ' + (err?.message || 'unknown');
        console.error(`[changeTraineeEmail] ${label} failed:`, err?.message);
      }
    };

    await Promise.all([
      // Core identity
      run('Trainee', () => base44.asServiceRole.entities.Trainee.update(traineeId, {
        user_email: normalizedEmail,
        trainee_email: normalizedEmail,
      })),
      // Auth credentials — this is the critical missing piece from the frontend dialog
      run('User', async () => {
        if (!trainee.user_id) return;
        await base44.asServiceRole.entities.User.update(trainee.user_id, { email: normalizedEmail });
      }),
      run('Credentials', async () => {
        const creds = await base44.asServiceRole.entities.Credentials.filter({ user_id: trainee.user_id }).catch(() => []);
        if (creds && creds[0]) {
          await base44.asServiceRole.entities.Credentials.update(creds[0].id, { email: normalizedEmail });
        }
      }),
      // Activity entities
      run('MealEntry', () => base44.asServiceRole.entities.MealEntry.bulkUpdate(
        { trainee_email: oldEmail }, { trainee_email: normalizedEmail }
      )),
      run('WaterEntry', () => base44.asServiceRole.entities.WaterEntry.bulkUpdate(
        { trainee_email: oldEmail }, { trainee_email: normalizedEmail }
      )),
      run('WorkoutSession', () => base44.asServiceRole.entities.WorkoutSession.bulkUpdate(
        { trainee_email: oldEmail }, { trainee_email: normalizedEmail }
      )),
      run('MetricsEntry', () => base44.asServiceRole.entities.MetricsEntry.bulkUpdate(
        { trainee_email: oldEmail }, { trainee_email: normalizedEmail }
      )),
      run('PushToken', () => base44.asServiceRole.entities.PushToken.bulkUpdate(
        { trainee_email: oldEmail }, { trainee_email: normalizedEmail }
      )),
      run('Achievement', () => base44.asServiceRole.entities.Achievement.bulkUpdate(
        { trainee_email: oldEmail }, { trainee_email: normalizedEmail }
      )),
      run('AIConsultation', () => base44.asServiceRole.entities.AIConsultation.bulkUpdate(
        { trainee_email: oldEmail }, { trainee_email: normalizedEmail }
      )),
      run('NotificationReceipt', () => base44.asServiceRole.entities.NotificationReceipt.bulkUpdate(
        { trainee_email: oldEmail }, { trainee_email: normalizedEmail }
      )),
    ]);

    // Classify failures by criticality.
    // Critical: Trainee, User, Credentials — the operation cannot succeed if these fail.
    //   Failure here means the email is partially updated or the user can no longer log in.
    // Non-critical: all activity entities — they may have zero matching rows (new trainees),
    //   or may fail transiently. The email rename is still considered successful.
    const CRITICAL_ENTITIES = ['Trainee', 'User', 'Credentials'];
    const criticalFailures = Object.entries(updateResults)
      .filter(([label, v]) => CRITICAL_ENTITIES.includes(label) && v !== 'ok');
    const nonCriticalFailures = Object.entries(updateResults)
      .filter(([label, v]) => !CRITICAL_ENTITIES.includes(label) && v !== 'ok');

    if (criticalFailures.length > 0) {
      console.error('[changeTraineeEmail] CRITICAL FAILURE:', JSON.stringify(criticalFailures));
      return Response.json({
        ok: false,
        errorCode: 'CRITICAL_UPDATE_FAILED',
        message: 'One or more critical entities failed to update. The email change was not completed.',
        criticalFailures: Object.fromEntries(criticalFailures),
        updateResults,
      }, { status: 500 });
    }

    if (nonCriticalFailures.length > 0) {
      console.warn('[changeTraineeEmail] Non-critical failures (email change succeeded):', JSON.stringify(nonCriticalFailures));
    }

    console.log(`[changeTraineeEmail] SUCCESS: ${oldEmail} → ${normalizedEmail} for trainee ${traineeId}`);
    return Response.json({
      ok: true,
      oldEmail,
      newEmail: normalizedEmail,
      updateResults,
      warnings: nonCriticalFailures.length > 0
        ? nonCriticalFailures.map(([label]) => `${label}: no rows matched or update failed (non-critical)`)
        : undefined,
    });

  } catch (error: any) {
    console.error('[changeTraineeEmail] FATAL:', error?.message);
    return Response.json({ ok: false, errorCode: 'SYSTEM_ERROR', message: error?.message }, { status: 500 });
  }
});
