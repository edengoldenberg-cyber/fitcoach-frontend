/**
 * src/api/client.js
 *
 * Public API surface — re-exports base44 from base44Client.js (standalone version)
 * and provides createHttpClient for AuthContext's public-settings call.
 *
 * No longer imports from @base44/sdk.
 */

import { base44 as _base44 } from './base44Client';

const API_BASE =
  import.meta.env.VITE_API_BASE_URL ||
  import.meta.env.VITE_BASE44_APP_BASE_URL ||
  'http://localhost:3001';

// ─── Re-export base44 ─────────────────────────────────────────────────────────

export const base44 = _base44;

// ─── createHttpClient ─────────────────────────────────────────────────────────
// Used by AuthContext to call /api/apps/public/prod/public-settings/by-id/:appId
// Returns a minimal client with a .get() method.

export function createHttpClient({ baseURL = '', headers: extraHeaders = {}, token } = {}) {
  const base = baseURL.startsWith('http') ? baseURL : `${API_BASE}${baseURL}`;

  const buildHeaders = () => {
    const h = { 'Content-Type': 'application/json', ...extraHeaders };
    const stored = typeof localStorage !== 'undefined'
      ? localStorage.getItem('fitcoach_token')
      : null;
    const t = token || stored;
    if (t) h['Authorization'] = `Bearer ${t}`;
    return h;
  };

  return {
    get: async (path) => {
      const res = await fetch(`${base}${path}`, {
        method: 'GET',
        headers: buildHeaders(),
        credentials: 'include',
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        const err = Object.assign(new Error(data.error || res.statusText), {
          status: res.status,
          data,
        });
        throw err;
      }
      return res.json();
    },

    post: async (path, body) => {
      const res = await fetch(`${base}${path}`, {
        method: 'POST',
        headers: buildHeaders(),
        credentials: 'include',
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        const err = Object.assign(new Error(data.error || res.statusText), {
          status: res.status,
          data,
        });
        throw err;
      }
      return res.json();
    },
  };
}
