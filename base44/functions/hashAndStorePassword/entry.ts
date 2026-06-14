import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';
import * as bcrypt from 'npm:bcrypt@5.0.1';

/**
 * hashAndStorePassword — server-side bcrypt password hashing.
 *
 * Replaces the current client-side SHA-256 (no salt) pattern.
 * Once deployed, update src/utils/passwordHash.js to call this function
 * instead of computing the hash client-side.
 *
 * Request body: { userId: string, password: string }
 * Auth: caller must be the user themselves OR an admin.
 *
 * MIGRATION:
 * 1. Deploy this function.
 * 2. In src/utils/passwordHash.js replace the body of hashPassword() with:
 *      const result = await base44.functions.invoke('hashAndStorePassword', { userId, password });
 *      return result.data;
 * 3. In SetPassword.jsx and ChangePasswordDialog.jsx, pass userId to hashPassword().
 * 4. Run a one-time migration to re-hash existing Credentials rows (see migratePasswordHashes).
 */

const BCRYPT_ROUNDS = 12;

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

    const { userId, password } = body;

    if (!userId || !password) {
      return Response.json({ ok: false, errorCode: 'MISSING_FIELDS', message: 'userId and password are required' }, { status: 400 });
    }

    // Authorization: caller must be the user being updated OR an admin
    const isAdmin = caller.role === 'admin';
    if (!isAdmin && caller.id !== userId) {
      return Response.json({ ok: false, errorCode: 'FORBIDDEN', message: 'You can only set your own password' }, { status: 403 });
    }

    if (password.length < 8) {
      return Response.json({ ok: false, errorCode: 'PASSWORD_TOO_SHORT', message: 'Password must be at least 8 characters' }, { status: 400 });
    }

    // Hash the password server-side with bcrypt
    const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);

    // Update Credentials entity
    const existingCreds = await base44.asServiceRole.entities.Credentials.filter({ user_id: userId }).catch(() => []);
    if (existingCreds && existingCreds.length > 0) {
      await base44.asServiceRole.entities.Credentials.update(existingCreds[0].id, {
        password_hash: passwordHash,
        hash_algorithm: 'bcrypt',
        last_password_change_at: new Date().toISOString(),
      });
    } else {
      const users = await base44.asServiceRole.entities.User.filter({ id: userId }).catch(() => []);
      const user = users && users[0];
      await base44.asServiceRole.entities.Credentials.create({
        user_id: userId,
        email: user?.email || '',
        password_hash: passwordHash,
        hash_algorithm: 'bcrypt',
        last_password_change_at: new Date().toISOString(),
      });
    }

    console.log(`[hashAndStorePassword] Password updated for userId=${userId} algorithm=bcrypt rounds=${BCRYPT_ROUNDS}`);
    return Response.json({ ok: true });

  } catch (error: any) {
    console.error('[hashAndStorePassword] FATAL:', error?.message);
    return Response.json({ ok: false, errorCode: 'SYSTEM_ERROR', message: error?.message }, { status: 500 });
  }
});
