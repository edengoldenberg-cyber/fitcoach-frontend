import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

/**
 * Cleans up all credentials/auth data for a trainee.
 * Called when:
 *   - A trainee is deleted
 *   - A trainee's email changes (clean old email)
 *   - A trainee's phone changes (clean old phone)
 *
 * Payload:
 *   { email?: string, phone?: string, user_id?: string }
 */
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json();

    // Support being called from automation (entity event) or directly
    const { email, phone, user_id, event, data, old_data } = body;

    const b = base44.asServiceRole;

    // --- Determine what to clean based on call mode ---
    const emailsToClean = new Set();
    const phonesToClean = new Set();
    const userIdsToClean = new Set();

    if (event) {
      // Called from automation
      const eventType = event?.type;
      const current = data || {};
      const previous = old_data || {};

      if (eventType === 'delete') {
        // Clean everything from the deleted trainee
        if (current.user_email) emailsToClean.add(current.user_email.toLowerCase().trim());
        if (current.phone) phonesToClean.add(current.phone.trim());
        if (current.user_id) userIdsToClean.add(current.user_id);
      } else if (eventType === 'update') {
        // Clean old email if it changed
        const oldEmail = (previous.user_email || '').toLowerCase().trim();
        const newEmail = (current.user_email || '').toLowerCase().trim();
        if (oldEmail && oldEmail !== newEmail) {
          emailsToClean.add(oldEmail);
        }

        // Clean old phone if it changed
        const oldPhone = (previous.phone || '').trim();
        const newPhone = (current.phone || '').trim();
        if (oldPhone && oldPhone !== newPhone) {
          phonesToClean.add(oldPhone);
          // Also try E.164 variants
          if (oldPhone.startsWith('0')) phonesToClean.add('+972' + oldPhone.slice(1));
          if (!oldPhone.startsWith('+')) phonesToClean.add('+972' + oldPhone);
        }
      }
    } else {
      // Called directly
      if (email) emailsToClean.add(email.toLowerCase().trim());
      if (phone) {
        phonesToClean.add(phone.trim());
        if (phone.startsWith('0')) phonesToClean.add('+972' + phone.slice(1));
        if (!phone.startsWith('+')) phonesToClean.add('+972' + phone);
      }
      if (user_id) userIdsToClean.add(user_id);
    }

    const results = { deleted: {}, emails: [...emailsToClean], phones: [...phonesToClean] };

    // --- Clean PhoneCredentials by phone ---
    let phoneCredDeleted = 0;
    for (const p of phonesToClean) {
      try {
        const records = await b.entities.PhoneCredentials.filter({ phone: p });
        for (const r of records) {
          await b.entities.PhoneCredentials.delete(r.id);
          phoneCredDeleted++;
        }
      } catch (e) {
        console.warn(`PhoneCredentials cleanup failed for ${p}:`, e.message);
      }
    }
    results.deleted.PhoneCredentials = phoneCredDeleted;

    // --- Clean PersonalAccessLink by email ---
    let palDeleted = 0;
    for (const em of emailsToClean) {
      try {
        const records = await b.entities.PersonalAccessLink.filter({ trainee_email: em });
        for (const r of records) {
          await b.entities.PersonalAccessLink.delete(r.id);
          palDeleted++;
        }
      } catch (e) {
        console.warn(`PersonalAccessLink cleanup failed for ${em}:`, e.message);
      }
    }
    // Also by user_id
    for (const uid of userIdsToClean) {
      try {
        const records = await b.entities.PersonalAccessLink.filter({ trainee_user_id: uid });
        for (const r of records) {
          await b.entities.PersonalAccessLink.delete(r.id);
          palDeleted++;
        }
      } catch (e) {
        console.warn(`PersonalAccessLink cleanup by user_id failed:`, e.message);
      }
    }
    results.deleted.PersonalAccessLink = palDeleted;

    // --- Clean LoginLink by email ---
    let llDeleted = 0;
    for (const em of emailsToClean) {
      try {
        const records = await b.entities.LoginLink.filter({ trainee_email: em });
        for (const r of records) {
          await b.entities.LoginLink.delete(r.id);
          llDeleted++;
        }
      } catch (e) {
        console.warn(`LoginLink cleanup failed for ${em}:`, e.message);
      }
    }
    results.deleted.LoginLink = llDeleted;

    // --- Clean Credentials (if entity exists) by email ---
    let credDeleted = 0;
    for (const em of emailsToClean) {
      try {
        const records = await b.entities.Credentials.filter({ email: em });
        for (const r of records) {
          await b.entities.Credentials.delete(r.id);
          credDeleted++;
        }
      } catch (_) {}
    }
    results.deleted.Credentials = credDeleted;

    console.log('[cleanupTraineeData] Done:', JSON.stringify(results));
    return Response.json({ ok: true, ...results });

  } catch (error) {
    console.error('[cleanupTraineeData] Error:', error.message);
    return Response.json({ ok: false, error: error.message }, { status: 500 });
  }
});