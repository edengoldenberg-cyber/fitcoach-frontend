/**
 * Generates a cryptographically secure random token using the Web Crypto API.
 * Returns a 64-character lowercase hex string (32 bytes = 256 bits of entropy).
 *
 * Replaces Math.random()-based generation across all invite_token creation sites.
 * Math.random() is NOT a CSPRNG and produces only ~32 bits of state total.
 *
 * Compatible with all modern browsers and Node 20+ via globalThis.crypto.
 */
export function generateSecureToken() {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
}
