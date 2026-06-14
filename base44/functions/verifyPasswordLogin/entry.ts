import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';
import * as bcrypt from 'npm:bcrypt@5.0.1';

/**
 * verifyPasswordLogin — unauthenticated email+password login endpoint.
 *
 * No base44 auth required (caller may be anonymous). Uses service role
 * to read Credentials, verify the password, then issues a user-scoped
 * SSO access token via asServiceRole.sso.getAccessToken so the frontend
 * can call base44.auth.setToken(token, true) for a persistent session.
 *
 * Request body: { email: string, password: string }
 * Returns: { ok: true, access_token, user: { id, email, role } }
 *          { ok: false, errorCode, message }
 */

const BCRYPT_ROUNDS = 12;
const MAX_ATTEMPTS = 5;
const LOCKOUT_MINUTES = 15;

async function sha256Hex(text: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(text);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(hashBuffer))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);

    let body: any = {};
    try { body = await req.json(); } catch (_) {
      return Response.json({ ok: false, errorCode: 'INVALID_JSON' }, { status: 400 });
    }

    const { email, password } = body;

    if (!email || !password) {
      return Response.json({ ok: false, errorCode: 'MISSING_FIELDS', message: 'email and password are required' }, { status: 400 });
    }

    const normalizedEmail = email.toLowerCase().trim();

    // Find Credentials by email (service role — no user auth needed)
    const creds = await base44.asServiceRole.entities.Credentials.filter({ email: normalizedEmail }).catch(() => []);
    const cred = creds && creds[0];

    if (!cred || !cred.password_hash) {
      // Generic error — do not reveal whether the email exists
      return Response.json({ ok: false, errorCode: 'INVALID_CREDENTIALS', message: 'Invalid email or password' }, { status: 401 });
    }

    // Lockout check
    if (cred.locked_until) {
      const lockedUntil = new Date(cred.locked_until);
      if (lockedUntil > new Date()) {
        const minutesLeft = Math.ceil((lockedUntil.getTime() - Date.now()) / 60000);
        return Response.json({
          ok: false,
          errorCode: 'ACCOUNT_LOCKED',
          message: `Account locked. Try again in ${minutesLeft} minute(s).`,
          lockedUntil: cred.locked_until,
        }, { status: 429 });
      }
    }

    // Verify password
    const algorithm = cred.hash_algorithm || 'sha256_no_salt';
    let verified = false;

    if (algorithm === 'bcrypt') {
      verified = await bcrypt.compare(password, cred.password_hash);
    } else {
      const inputHash = await sha256Hex(password);
      verified = inputHash === cred.password_hash;
    }

    if (!verified) {
      // Increment failed attempts and apply lockout if threshold reached
      const attempts = (cred.failed_login_attempts || 0) + 1;
      const lockoutUpdate: Record<string, any> = { failed_login_attempts: attempts };
      if (attempts >= MAX_ATTEMPTS) {
        const lockedUntil = new Date(Date.now() + LOCKOUT_MINUTES * 60 * 1000);
        lockoutUpdate.locked_until = lockedUntil.toISOString();
        console.log(`[verifyPasswordLogin] Account locked for ${normalizedEmail} after ${attempts} failed attempts`);
      }
      await base44.asServiceRole.entities.Credentials.update(cred.id, lockoutUpdate).catch(() => {});

      // Generic error — same message whether email or password is wrong
      return Response.json({ ok: false, errorCode: 'INVALID_CREDENTIALS', message: 'Invalid email or password' }, { status: 401 });
    }

    // Password is correct — reset counters and auto-upgrade SHA-256 → bcrypt
    const successUpdate: Record<string, any> = {
      failed_login_attempts: 0,
      locked_until: null,
      last_login_at: new Date().toISOString(),
    };

    if (algorithm !== 'bcrypt') {
      try {
        const newHash = await bcrypt.hash(password, BCRYPT_ROUNDS);
        successUpdate.password_hash = newHash;
        successUpdate.hash_algorithm = 'bcrypt';
        successUpdate.last_password_change_at = new Date().toISOString();
        console.log(`[verifyPasswordLogin] Auto-upgraded SHA-256 → bcrypt for email=${normalizedEmail}`);
      } catch (upgradeErr: any) {
        console.warn('[verifyPasswordLogin] bcrypt upgrade failed (non-fatal):', upgradeErr?.message);
      }
    }

    await base44.asServiceRole.entities.Credentials.update(cred.id, successUpdate).catch(() => {});

    // Fetch the base44 User record for role information
    const users = await base44.asServiceRole.entities.User.filter({ id: cred.user_id }).catch(() => []);
    const user = users && users[0];
    if (!user) {
      console.error(`[verifyPasswordLogin] User not found for userId=${cred.user_id}`);
      return Response.json({ ok: false, errorCode: 'USER_NOT_FOUND', message: 'User account not found' }, { status: 404 });
    }

    // Issue a user-scoped session token via SSO bridge
    let ssoResult: any;
    try {
      ssoResult = await base44.asServiceRole.sso.getAccessToken(cred.user_id);
    } catch (ssoErr: any) {
      console.error('[verifyPasswordLogin] SSO token generation failed:', ssoErr?.message);
      return Response.json({ ok: false, errorCode: 'SESSION_ERROR', message: 'Failed to create session' }, { status: 500 });
    }

    const access_token = ssoResult?.access_token;
    if (!access_token) {
      return Response.json({ ok: false, errorCode: 'SESSION_ERROR', message: 'Empty access token from SSO' }, { status: 500 });
    }

    console.log(`[verifyPasswordLogin] Login successful for email=${normalizedEmail} userId=${cred.user_id}`);

    return Response.json({
      ok: true,
      access_token,
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
        full_name: user.full_name,
      },
    });

  } catch (error: any) {
    console.error('[verifyPasswordLogin] FATAL:', error?.message);
    return Response.json({ ok: false, errorCode: 'SYSTEM_ERROR', message: 'Internal server error' }, { status: 500 });
  }
});
