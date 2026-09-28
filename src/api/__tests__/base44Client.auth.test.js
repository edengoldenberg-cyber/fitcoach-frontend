/**
 * base44Client.auth.test.js
 *
 * Covers the token-refresh classification and session-expiry behaviour:
 *   - clearLocalSession resets in-memory + persisted token
 *   - Definitive refresh failures (401/403/4xx/no-token) emit session_expired
 *   - Transient refresh failures (429/5xx/network/timeout) do NOT
 *   - Concurrent requests share one refresh attempt
 *   - Transient failure retries once before giving up
 *   - After refresh succeeds, a 401 on the retry is treated as definitive
 *
 * Runs in Node environment — window/localStorage are stubbed.
 */

import { describe, test, expect, beforeEach, afterEach, vi } from 'vitest';

// ─── DOM stubs (Node environment — no jsdom) ──────────────────────────────────

let _et;          // EventTarget for session_expired events
let _localStorage; // localStorage mock
let _windowMock;

function setupDomStubs() {
  _et = new EventTarget();
  _localStorage = (() => {
    const s = {};
    return {
      getItem:    (k) => Object.prototype.hasOwnProperty.call(s, k) ? s[k] : null,
      setItem:    (k, v) => { s[k] = String(v); },
      removeItem: (k) => { delete s[k]; },
      clear:      () => { Object.keys(s).forEach(k => delete s[k]); },
    };
  })();
  _windowMock = {
    addEventListener:    (e, h, o) => _et.addEventListener(e, h, o),
    removeEventListener: (e, h, o) => _et.removeEventListener(e, h, o),
    dispatchEvent:       (e)       => _et.dispatchEvent(e),
    location: { pathname: '/NutritionLog', href: '' },
  };
  vi.stubGlobal('window',    _windowMock);
  vi.stubGlobal('localStorage', _localStorage);
}

// ─── Module import (after stubs) ─────────────────────────────────────────────

// Import lazily so stubs are in place first
let base44, clearLocalSession;

// ─── Helpers ─────────────────────────────────────────────────────────────────

function mockResponse(status, body = {}) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(body),
  };
}

function networkError(msg = 'Network failure') {
  return Promise.reject(Object.assign(new TypeError(msg), { name: 'TypeError' }));
}

// ─── Setup ────────────────────────────────────────────────────────────────────

let sessionExpiredFired = false;

beforeEach(async () => {
  // Stubs must be set before we (re)import the module
  setupDomStubs();

  // Fresh module instance per test (clears _accessToken + _refreshInFlight)
  vi.resetModules();
  const mod = await import('../base44Client');
  base44          = mod.base44;
  clearLocalSession = mod.clearLocalSession;

  sessionExpiredFired = false;
  _et.addEventListener('fitcoach:session_expired', () => { sessionExpiredFired = true; });

  base44.auth.setToken('test-jwt-token');
  vi.stubGlobal('fetch', vi.fn());
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

// ─── clearLocalSession ────────────────────────────────────────────────────────

describe('clearLocalSession', () => {
  test('isAuthenticated returns false after clearLocalSession', () => {
    expect(base44.auth.isAuthenticated()).toBe(true);
    clearLocalSession();
    expect(base44.auth.isAuthenticated()).toBe(false);
  });

  test('removes fitcoach_token from localStorage', () => {
    _localStorage.setItem('fitcoach_token', 'test-jwt-token');
    clearLocalSession();
    expect(_localStorage.getItem('fitcoach_token')).toBeNull();
  });
});

// ─── Definitive refresh failures → session_expired IS fired ──────────────────

describe('definitive refresh failures — session_expired dispatched', () => {
  test('refresh 401 → session_expired', async () => {
    fetch
      .mockResolvedValueOnce(mockResponse(401))
      .mockResolvedValueOnce(mockResponse(401));
    await base44.auth.me().catch(() => {});
    expect(sessionExpiredFired).toBe(true);
  });

  test('refresh 403 → session_expired', async () => {
    fetch
      .mockResolvedValueOnce(mockResponse(401))
      .mockResolvedValueOnce(mockResponse(403));
    await base44.auth.me().catch(() => {});
    expect(sessionExpiredFired).toBe(true);
  });

  test('refresh 404 → session_expired', async () => {
    fetch
      .mockResolvedValueOnce(mockResponse(401))
      .mockResolvedValueOnce(mockResponse(404));
    await base44.auth.me().catch(() => {});
    expect(sessionExpiredFired).toBe(true);
  });

  test('refresh 200 with no access_token → session_expired', async () => {
    fetch
      .mockResolvedValueOnce(mockResponse(401))
      .mockResolvedValueOnce(mockResponse(200, { message: 'ok' }));
    await base44.auth.me().catch(() => {});
    expect(sessionExpiredFired).toBe(true);
  });
});

// ─── Transient refresh failures → session_expired is NOT fired ───────────────

describe('transient refresh failures — session_expired NOT dispatched', () => {
  test('refresh 429 (both attempts) → no session_expired', async () => {
    vi.useFakeTimers();
    fetch
      .mockResolvedValueOnce(mockResponse(401))
      .mockResolvedValueOnce(mockResponse(429))
      .mockResolvedValueOnce(mockResponse(429));

    const p = base44.auth.me().catch(() => {});
    await vi.runAllTimersAsync();
    await p;

    expect(sessionExpiredFired).toBe(false);
  });

  test('refresh 500 (both attempts) → no session_expired', async () => {
    vi.useFakeTimers();
    fetch
      .mockResolvedValueOnce(mockResponse(401))
      .mockResolvedValueOnce(mockResponse(500))
      .mockResolvedValueOnce(mockResponse(500));

    const p = base44.auth.me().catch(() => {});
    await vi.runAllTimersAsync();
    await p;

    expect(sessionExpiredFired).toBe(false);
  });

  test('refresh network error → no session_expired', async () => {
    vi.useFakeTimers();
    fetch
      .mockResolvedValueOnce(mockResponse(401))
      .mockImplementationOnce(() => networkError())
      .mockImplementationOnce(() => networkError());

    const p = base44.auth.me().catch(() => {});
    await vi.runAllTimersAsync();
    await p;

    expect(sessionExpiredFired).toBe(false);
  });

  test('refresh timeout 8s → no session_expired', async () => {
    vi.useFakeTimers();
    fetch
      .mockResolvedValueOnce(mockResponse(401))
      .mockReturnValue(new Promise(() => {})); // hangs forever

    const p = base44.auth.me().catch(() => {});
    await vi.runAllTimersAsync();
    await p;

    expect(sessionExpiredFired).toBe(false);
  });
});

// ─── Deduplication ───────────────────────────────────────────────────────────

describe('concurrent refresh deduplication', () => {
  test('two simultaneous 401s trigger exactly one refresh fetch', async () => {
    let refreshCallCount = 0;
    let resolveRefresh;

    fetch.mockImplementation((url) => {
      if (url.includes('/auth/refresh')) {
        refreshCallCount++;
        return new Promise(r => { resolveRefresh = r; });
      }
      return Promise.resolve(mockResponse(401));
    });

    const p1 = base44.auth.me().catch(() => {});
    const p2 = base44.auth.me().catch(() => {});

    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();

    expect(refreshCallCount).toBe(1);

    resolveRefresh(mockResponse(401));
    await Promise.all([p1, p2]);
  });
});

// ─── Transient retry behaviour ───────────────────────────────────────────────

describe('transient retry', () => {
  test('transient failure is retried once before giving up', async () => {
    vi.useFakeTimers();
    let refreshCalls = 0;

    fetch.mockImplementation((url) => {
      if (url.includes('/auth/refresh')) {
        refreshCalls++;
        return Promise.resolve(mockResponse(500));
      }
      return Promise.resolve(mockResponse(401));
    });

    const p = base44.auth.me().catch(() => {});
    await vi.runAllTimersAsync();
    await p;

    expect(refreshCalls).toBe(2);
    expect(sessionExpiredFired).toBe(false);
  });
});

// ─── Successful refresh then retry 401 ───────────────────────────────────────

describe('retry request 401 after successful refresh', () => {
  test('retry gets 401 after fresh token → session_expired dispatched', async () => {
    fetch
      .mockResolvedValueOnce(mockResponse(401))
      .mockResolvedValueOnce(mockResponse(200, { access_token: 'new' }))
      .mockResolvedValueOnce(mockResponse(401));

    await base44.auth.me().catch(() => {});
    expect(sessionExpiredFired).toBe(true);
  });
});
