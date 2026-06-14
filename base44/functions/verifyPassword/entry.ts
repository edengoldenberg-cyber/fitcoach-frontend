import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';
import * as bcrypt from 'npm:bcrypt@5.0.1';

/**
 * verifyPassword — server-side password verification.
 *
 * Supports both bcrypt (new) and SHA-256 (legacy, no salt) hashes transparently.
 * The hash_algorithm field on the Credentials record determines which path is used.
 * When verifying a legacy SHA-256 credential successfully, auto-upgrades to bcrypt.
 *
 * Request body: { userId: string, password: string }
 * Returns: { ok: true, verified: true } or { ok: true, verified: false }
 */

async function sha256Hex(text: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(text);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(hashBuffer))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

const BCRYPT_ROUNDS = 12;

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);

    let body: any = {};
    try { body = await req.json(); } catch (_) {
      return Response.json({ ok: false, errorCode: 'INVALID_JSON' }, { status: 400 });
    }

    const { userId, password } = body;

    if (!userId || !password) {
      return Response.json({ ok: false, errorCode: 'MISSING_FIELDS', message: 'userId and password are required' }, { status: 400 });
    }

    const creds = await base44.asServiceRole.entities.Credentials.filter({ user_id: userId }).catch(() => []);
    const cred = creds && creds[0];

    if (!cred || !cred.password_hash) {
      return Response.json({ ok: true, verified: false, reason: 'NO_CREDENTIALS' });
    }

    const algorithm = cred.hash_algorithm || 'sha256_no_salt';
    let verified = false;

    if (algorithm === 'bcrypt') {
      verified = await bcrypt.compare(password, cred.password_hash);
    } else {
      // Legacy: SHA-256 no salt
      const inputHash = await sha256Hex(password);
      verified = inputHash === cred.password_hash;

      // Auto-upgrade: on successful legacy verify, re-hash with bcrypt
      if (verified) {
        try {
          const newHash = await bcrypt.hash(password, BCRYPT_ROUNDS);
          await base44.asServiceRole.entities.Credentials.update(cred.id, {
            password_hash: newHash,
            hash_algorithm: 'bcrypt',
            last_password_change_at: new Date().toISOString(),
          });
          console.log(`[verifyPassword] Auto-upgraded SHA-256 → bcrypt for userId=${userId}`);
        } catch (upgradeErr: any) {
          // Non-fatal: verification still succeeds, upgrade failed silently
          console.warn('[verifyPassword] bcrypt upgrade failed (non-fatal):', upgradeErr?.message);
        }
      }
    }

    return Response.json({ ok: true, verified });

  } catch (error: any) {
    console.error('[verifyPassword] FATAL:', error?.message);
    return Response.json({ ok: false, errorCode: 'SYSTEM_ERROR', message: error?.message }, { status: 500 });
  }
});
