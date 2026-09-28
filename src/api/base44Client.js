/**
 * src/api/base44Client.js
 *
 * STANDALONE VERSION — replaces @base44/sdk entirely.
 * Exports a `base44` object with the same shape as the old SDK
 * so all 331 existing imports continue to work with zero call-site changes.
 *
 * Points to fitcoach-server (localhost:3001 in dev, VITE_API_BASE_URL in prod).
 */

const API_BASE =
  import.meta.env.VITE_API_BASE_URL ||
  import.meta.env.VITE_BASE44_APP_BASE_URL ||
  'http://localhost:3001';

// ─── Token store (module-level, survives re-renders) ─────────────────────────
let _accessToken = typeof localStorage !== 'undefined'
  ? localStorage.getItem('fitcoach_token') || ''
  : '';

// ─── Refresh deduplication ────────────────────────────────────────────────────
// When the JWT expires, every concurrent API call (home page loads 5-6 in parallel)
// would each try to refresh independently — hammering the rate limiter with 4-6
// simultaneous POST /api/auth/refresh calls and getting 429s.
// A single shared promise ensures exactly ONE refresh attempt goes out at a time;
// all waiters receive the same result.
let _refreshInFlight = null;

// ─── Transient vs definitive refresh failure ──────────────────────────────────
// Transient: network failure, timeout, 429, 5xx — worth retrying, must NOT
//            emit session_expired (prevents false logout on iOS camera return).
// Definitive: 401, 403, other 4xx, or 200 with no usable token.
export class RefreshTransientError extends Error {
  constructor(msg) {
    super(msg);
    this.name = 'RefreshTransientError';
  }
}

const REFRESH_TIMEOUT_MS = 8000;

// _refreshOnce: one raw refresh attempt.
// Returns the new access token string on success.
// Returns null for definitive rejection (bad creds, no token).
// Throws RefreshTransientError for transient failures.
// NOTE: Promise.race timeout — no AbortController (iOS/SW incompatible).
async function _refreshOnce() {
  const timeout = new Promise((_, reject) =>
    setTimeout(
      () => reject(new RefreshTransientError('refresh timeout')),
      REFRESH_TIMEOUT_MS
    )
  );

  let res;
  try {
    res = await Promise.race([
      fetch(`${API_BASE}/api/auth/refresh`, { method: 'POST', credentials: 'include' }),
      timeout,
    ]);
  } catch (e) {
    if (e instanceof RefreshTransientError) throw e;
    // Network / fetch failure
    throw new RefreshTransientError(`network: ${e.message}`);
  }

  const { status } = res;

  // Transient: rate-limited or server error — worth retrying
  if (status === 429 || status >= 500) throw new RefreshTransientError(`http ${status}`);

  // Definitive: any other non-OK (401, 403, other 4xx)
  if (!res.ok) return null;

  // HTTP 200: need a usable token
  let data;
  try { data = await res.json(); } catch { return null; }
  return data?.access_token || null;
}

// ─── Session expiry notification ──────────────────────────────────────────────
// Dispatched when refresh definitively fails so sessionExpiryHandler can
// confirm and redirect to login. Components must NOT redirect themselves.
function _notifySessionExpired() {
  try {
    const isAuthPage = /\/(LoginWithPassword|AccessLink|SetPassword|ResetPassword|AccessCodeLogin)/i
      .test(window.location.pathname);
    if (!isAuthPage) {
      window.dispatchEvent(new CustomEvent('fitcoach:session_expired'));
    }
  } catch { /* SSR or non-browser env */ }
}

// ─── clearLocalSession ────────────────────────────────────────────────────────
// Clears this module's in-memory token and the localStorage key it owns.
// Does NOT touch other session state (pending_access_token, coachAsTrainee, etc.)
// — those are AuthContext's responsibility.
export function clearLocalSession() {
  _accessToken = '';
  try { localStorage.removeItem('fitcoach_token'); } catch { /* */ }
}

// ─── Core fetch helper ───────────────────────────────────────────────────────

async function apiFetch(method, path, body = null, extraHeaders = {}, signal = null) {
  const url = path.startsWith('http') ? path : `${API_BASE}${path}`;

  const headers = {
    'Content-Type': 'application/json',
    ...extraHeaders,
  };

  if (_accessToken) {
    headers['Authorization'] = `Bearer ${_accessToken}`;
  }

  const res = await fetch(url, {
    method,
    headers,
    credentials: 'include', // send/receive httpOnly refresh cookie
    body: body != null ? JSON.stringify(body) : undefined,
    ...(signal ? { signal } : {}),
  });

  // Auto-refresh on 401
  if (res.status === 401) {
    // Only attempt refresh + session_expired notification when we actually had a
    // token that was sent. If _accessToken is empty (unauthenticated page load,
    // public route, or fresh context) there is no session to recover — just throw.
    const hadToken = !!headers['Authorization'];

    if (hadToken) {
      const refreshed = await _tryRefresh();
      if (refreshed) {
        // Retry the original request with the refreshed token
        headers['Authorization'] = `Bearer ${_accessToken}`;
        const retry = await fetch(url, {
          method,
          headers,
          credentials: 'include',
          body: body != null ? JSON.stringify(body) : undefined,
        });
        // Refreshed token immediately rejected — definitive session expiry
        if (retry.status === 401) {
          _notifySessionExpired();
          const errData = await retry.json().catch(() => ({}));
          throw Object.assign(new Error('Unauthorized'), { status: 401, data: errData });
        }
        if (!retry.ok) {
          const errData = await retry.json().catch(() => ({}));
          const err = Object.assign(new Error(errData.error || retry.statusText), {
            status: retry.status,
            data: errData,
          });
          throw err;
        }
        return retry.json();
      }
      // _tryRefresh returned false; if failure was definitive, session_expired
      // was already dispatched inside _tryRefresh → _notifySessionExpired.
    }

    const errData = await res.json().catch(() => ({}));
    const err = Object.assign(new Error(errData.error || 'Unauthorized'), {
      status: 401,
      data: errData,
    });
    throw err;
  }

  if (!res.ok) {
    const errData = await res.json().catch(() => ({}));
    const err = Object.assign(new Error(errData.error || res.statusText), {
      status: res.status,
      data: errData,
    });
    throw err;
  }

  return res.json();
}

async function _tryRefresh() {
  // Deduplicate: concurrent 401s share one refresh attempt so we don't hammer
  // the rate limiter with 4-6 simultaneous POST /api/auth/refresh calls.
  if (_refreshInFlight) return _refreshInFlight;

  _refreshInFlight = (async () => {
    try {
      let token;

      try {
        token = await _refreshOnce();
      } catch (e) {
        if (e instanceof RefreshTransientError) {
          // Retry once after 500ms — transient blips often resolve quickly
          await new Promise(r => setTimeout(r, 500));
          try {
            token = await _refreshOnce();
          } catch {
            // Both attempts transient — fail silently; do NOT emit session_expired
            // (returning false here lets the caller throw the original 401 without
            // triggering a logout — the right behaviour for an iOS camera return)
            return false;
          }
        } else {
          return false;
        }
      }

      if (token === null) {
        // Definitive rejection (401/403/no-token) — notify so handler can confirm
        _notifySessionExpired();
        return false;
      }

      _accessToken = token;
      try { localStorage.setItem('fitcoach_token', _accessToken); } catch { /* */ }
      return true;
    } finally {
      _refreshInFlight = null;
    }
  })();

  return _refreshInFlight;
}

// ─── auth ─────────────────────────────────────────────────────────────────────

const auth = {
  me: () => apiFetch('GET', '/api/auth/me'),

  updateMe: (data) => apiFetch('PUT', '/api/auth/me', data),

  isAuthenticated: () => !!_accessToken,

  loginViaEmailPassword: (email, password) =>
    apiFetch('POST', '/api/auth/login', { email, password }),

  logout: (redirectUrl) =>
    apiFetch('POST', '/api/auth/logout')
      .catch(() => {})
      .finally(() => {
        _accessToken = '';
        try { localStorage.removeItem('fitcoach_token'); } catch { /* */ }
        if (redirectUrl) window.location.href = redirectUrl;
      }),

  setToken: (token, persist = false) => {
    _accessToken = token || '';
    if (persist && token) {
      try { localStorage.setItem('fitcoach_token', token); } catch { /* */ }
    }
  },

  redirectToLogin: (nextUrl) => {
    const dest = '/LoginWithPassword' + (nextUrl ? `?from=${encodeURIComponent(nextUrl)}` : '');
    window.location.href = dest;
  },

  loginWithProvider: (provider, fromUrl) => {
    // Google SSO — stub until Sprint 2
    console.warn('[auth] loginWithProvider not yet implemented in standalone mode');
  },

  inviteUser: (email, role) =>
    apiFetch('POST', '/api/auth/invite', { email, role }),

  register: (payload) =>
    apiFetch('POST', '/api/auth/register', payload),

  verifyOtp: (args) =>
    apiFetch('POST', '/api/auth/otp/verify', args),

  resendOtp: (email) =>
    apiFetch('POST', '/api/auth/otp/resend', { email }),

  resetPasswordRequest: (email) =>
    apiFetch('POST', '/api/auth/reset-password/request', { email }),

  resetPassword: (args) =>
    apiFetch('POST', '/api/auth/reset-password/confirm', args),

  changePassword: (args) =>
    apiFetch('POST', '/api/auth/change-password', args),

  setTraineePassword: (traineeId, password, sendInviteEmail = false) =>
    apiFetch('POST', '/api/auth/set-trainee-password', {
      trainee_id:        traineeId,
      password,
      send_invite_email: sendInviteEmail,
    }),
};

// ─── entities ────────────────────────────────────────────────────────────────

function makeEntity(entityName, extraHeaders = {}) {
  return {
    filter: (where = {}, sort, limit) => {
      const params = new URLSearchParams();
      for (const [k, v] of Object.entries(where)) {
        if (v !== undefined && v !== null) params.set(k, String(v));
      }
      if (sort) params.set('_sort', sort);
      if (limit) params.set('_limit', String(limit));
      const qs = params.toString();
      return apiFetch('GET', `/api/entities/${entityName}${qs ? '?' + qs : ''}`, null, extraHeaders);
    },

    // list(sort?, limit?) — alias for filter({}, sort, limit)
    list: (sort, limit) => {
      const params = new URLSearchParams();
      if (sort) params.set('_sort', sort);
      if (limit) params.set('_limit', String(limit));
      const qs = params.toString();
      return apiFetch('GET', `/api/entities/${entityName}${qs ? '?' + qs : ''}`, null, extraHeaders);
    },

    get: (id) =>
      apiFetch('GET', `/api/entities/${entityName}/${id}`, null, extraHeaders),

    create: (data) =>
      apiFetch('POST', `/api/entities/${entityName}`, data, extraHeaders),

    update: (id, data) =>
      apiFetch('PUT', `/api/entities/${entityName}/${id}`, data, extraHeaders),

    delete: (id) =>
      apiFetch('DELETE', `/api/entities/${entityName}/${id}`, null, extraHeaders),

    bulkCreate: (items) =>
      apiFetch('POST', `/api/entities/${entityName}/bulk`, items, extraHeaders),

    // Real-time subscribe — polyfilled with polling until WebSockets in Sprint 2
    subscribe: (callback) => {
      let lastCount = 0;
      const intervalId = setInterval(async () => {
        try {
          const records = await apiFetch('GET', `/api/entities/${entityName}`, null, extraHeaders);
          if (Array.isArray(records) && records.length !== lastCount) {
            lastCount = records.length;
            callback({ type: 'update', data: records });
          }
        } catch { /* ignore polling errors */ }
      }, 5000);
      return () => clearInterval(intervalId);
    },
  };
}

const entities = new Proxy({}, {
  get(_, entityName) {
    return makeEntity(entityName);
  },
});

// ─── functions ───────────────────────────────────────────────────────────────

const functions = {
  invoke: (name, data = {}, opts = {}) =>
    apiFetch('POST', `/api/functions/${name}`, data, {}, opts.signal || null),

  fetch: (path, init = {}) =>
    fetch(`${API_BASE}${path}`, { ...init, credentials: 'include' }),
};

// ─── asServiceRole ────────────────────────────────────────────────────────────
// Admin-level access — same routes but with X-Service-Role header

const SERVICE_HEADER = { 'X-Service-Role': '1' };

const asServiceRole = {
  get entities() {
    return new Proxy({}, {
      get(_, entityName) {
        return makeEntity(entityName, SERVICE_HEADER);
      },
    });
  },
  get functions() {
    return {
      invoke: (name, data = {}, opts = {}) =>
        apiFetch('POST', `/api/functions/${name}`, data, SERVICE_HEADER, opts.signal || null),
    };
  },
  get integrations() { return {}; },
  get connectors() { return {}; },
  get agents() { return {}; },
  get appLogs() { return { list: () => Promise.resolve([]), logUserInApp: () => Promise.resolve() }; },
  get sso() { return {}; },
};

// ─── Main export ──────────────────────────────────────────────────────────────

// ─── integrations.Core shim ──────────────────────────────────────────────────
// Replaces the old @base44/sdk integrations module.
// Components that call base44.integrations.Core.UploadFile / InvokeLLM now work
// against our own backend without the old Base44 cloud service.

const integrationsCoreShim = {
  // Convert a File/Blob to a base64 data URL — same approach as AddMealFromPhoto.jsx.
  // Returns { file_url: 'data:image/...;base64,...' }.
  UploadFile: ({ file }) => {
    const fileData = file instanceof File ? file : (file instanceof Blob ? file : null);
    if (!fileData) return Promise.reject(new Error('UploadFile: file must be a File or Blob'));
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload  = (e) => resolve({ file_url: e.target.result });
      reader.onerror = ()  => reject(new Error('UploadFile: failed to read file'));
      reader.readAsDataURL(fileData);
    });
  },

  // Proxy arbitrary LLM prompts through the backend askAICoach function.
  // The old SDK accepted response_json_schema; we map that to json_mode.
  InvokeLLM: ({ prompt, response_json_schema, ...rest }) =>
    apiFetch('POST', '/api/functions/askAICoach', {
      prompt,
      json_mode: !!response_json_schema,
    }).then(r => r?.data?.response ?? r?.response ?? r),
};

const integrationsShim = { Core: integrationsCoreShim };

export const base44 = {
  auth,
  entities,
  functions,
  asServiceRole,
  // Legacy SDK methods — stubs so nothing breaks
  setToken: (token) => auth.setToken(token, true),
  getConfig: () => ({ appId: 'fitcoach', serverUrl: API_BASE }),
  cleanup: () => { _accessToken = ''; },
  get integrations() { return integrationsShim; },
  get connectors() { return {}; },
  get agents() { return {}; },
  get appLogs() { return { list: () => Promise.resolve([]), logUserInApp: () => Promise.resolve() }; },
  get users() { return { list: () => apiFetch('GET', '/api/entities/User') }; },
  get analytics() { return {}; },
};

export default base44;
