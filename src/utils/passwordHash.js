/**
 * passwordHash.js — central password hashing utility.
 *
 * CURRENT STATE: SHA-256, no salt, client-side.
 * This is a known security weakness (rainbow-table vulnerable).
 *
 * MIGRATION CONTRACT (required before production launch):
 * 1. Create backend function `hashAndStorePassword(userId, plainPassword)`
 *    that runs bcrypt/argon2 server-side and updates the Credentials entity.
 * 2. Create backend function `verifyPassword(userId, plainPassword)`
 *    that reads the stored hash and runs server-side comparison.
 * 3. Replace the body of hashPassword() here with:
 *      const result = await base44.functions.invoke('hashAndStorePassword', { userId, password });
 *      return result.data;
 * 4. All callers (SetPassword.jsx, ChangePasswordDialog.jsx) already import from here —
 *    the migration becomes a single-file change in this utility.
 * 5. Run a one-time migration script on existing Credentials rows to re-hash with bcrypt.
 *
 * DO NOT call this function outside of SetPassword.jsx and ChangePasswordDialog.jsx.
 */
export async function hashPassword(plainPassword) {
  const encoder = new TextEncoder();
  const data = encoder.encode(plainPassword);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(hashBuffer))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}
