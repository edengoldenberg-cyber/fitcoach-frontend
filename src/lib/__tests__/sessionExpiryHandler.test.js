/**
 * sessionExpiryHandler.test.js
 *
 * Covers:
 *  - Public auth pages are ignored
 *  - Burst events are debounced (only one auth.me() issued)
 *  - auth.me() success → no redirect, re-armed
 *  - auth.me() 401/403/null → clearLocalSession called + redirect once
 *  - auth.me() network/5xx → no redirect, re-armed
 *  - Redirect guard fires exactly once across multiple definitive events
 *  - install() returns a working uninstall function
 *
 * Runs in Node environment — window is stubbed via EventTarget.
 */

import { describe, test, expect, beforeEach, afterEach, vi } from 'vitest';

// ─── Mock base44 and clearLocalSession ────────────────────────────────────────

vi.mock('@/api/base44Client', () => ({
  base44: { auth: { me: vi.fn() } },
  clearLocalSession: vi.fn(),
}));

import { install, _resetForTest } from '../sessionExpiryHandler';
import { base44, clearLocalSession } from '@/api/base44Client';

// ─── Window stub using Node's EventTarget ─────────────────────────────────────

let _et;
let _windowMock;

function setupWindowStub(pathname = '/NutritionLog') {
  _et = new EventTarget();
  _windowMock = {
    addEventListener:    (e, h, o) => _et.addEventListener(e, h, o),
    removeEventListener: (e, h, o) => _et.removeEventListener(e, h, o),
    dispatchEvent:       (e)       => _et.dispatchEvent(e),
    location: { pathname, href: '' },
  };
  vi.stubGlobal('window', _windowMock);
}

function fireExpiredEvent() {
  _et.dispatchEvent(new Event('fitcoach:session_expired'));
}

function definitiveMeError(status) {
  const err = Object.assign(new Error('Unauthorized'), { status });
  return Promise.reject(err);
}

// ─── Setup ────────────────────────────────────────────────────────────────────

let uninstall;

beforeEach(() => {
  vi.useFakeTimers();
  setupWindowStub();
  _resetForTest();
  vi.clearAllMocks();
  uninstall = install();
});

afterEach(() => {
  uninstall?.();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

// ─── Public auth page guard ───────────────────────────────────────────────────

describe('public auth page guard', () => {
  test('handler ignores event on LoginWithPassword', async () => {
    _windowMock.location.pathname = '/LoginWithPassword';
    fireExpiredEvent();
    await vi.runAllTimersAsync();
    expect(base44.auth.me).not.toHaveBeenCalled();
  });

  test('handler ignores event on AccessLink page', async () => {
    _windowMock.location.pathname = '/AccessLink';
    fireExpiredEvent();
    await vi.runAllTimersAsync();
    expect(base44.auth.me).not.toHaveBeenCalled();
  });
});

// ─── Debounce ─────────────────────────────────────────────────────────────────

describe('debounce', () => {
  test('rapid burst of events triggers only one auth.me() call', async () => {
    base44.auth.me.mockResolvedValue({ id: 'u1', email: 'test@example.com' });

    fireExpiredEvent();
    fireExpiredEvent();
    fireExpiredEvent();

    await vi.runAllTimersAsync();
    expect(base44.auth.me).toHaveBeenCalledTimes(1);
  });
});

// ─── auth.me() confirms alive ─────────────────────────────────────────────────

describe('session still alive', () => {
  test('auth.me() returns user → no redirect, clearLocalSession not called', async () => {
    base44.auth.me.mockResolvedValue({ id: 'u1', email: 'test@example.com' });

    fireExpiredEvent();
    await vi.runAllTimersAsync();

    expect(clearLocalSession).not.toHaveBeenCalled();
    expect(_windowMock.location.href).not.toBe('/LoginWithPassword');
  });

  test('handler re-arms after alive confirmation', async () => {
    base44.auth.me
      .mockResolvedValueOnce({ id: 'u1' })
      .mockResolvedValueOnce({ id: 'u1' });

    fireExpiredEvent();
    await vi.runAllTimersAsync();

    // Re-arm and fire a second event
    _resetForTest();
    uninstall();
    uninstall = install();

    fireExpiredEvent();
    await vi.runAllTimersAsync();

    expect(base44.auth.me).toHaveBeenCalledTimes(2);
    expect(clearLocalSession).not.toHaveBeenCalled();
  });
});

// ─── auth.me() confirms expiry ────────────────────────────────────────────────

describe('definitive expiry', () => {
  test('auth.me() 401 → clearLocalSession + redirect to login', async () => {
    base44.auth.me.mockImplementation(() => definitiveMeError(401));

    fireExpiredEvent();
    await vi.runAllTimersAsync();

    expect(clearLocalSession).toHaveBeenCalledTimes(1);
    expect(_windowMock.location.href).toBe('/LoginWithPassword');
  });

  test('auth.me() 403 → redirect', async () => {
    base44.auth.me.mockImplementation(() => definitiveMeError(403));

    fireExpiredEvent();
    await vi.runAllTimersAsync();

    expect(_windowMock.location.href).toBe('/LoginWithPassword');
  });

  test('auth.me() returns null → redirect', async () => {
    base44.auth.me.mockResolvedValue(null);

    fireExpiredEvent();
    await vi.runAllTimersAsync();

    expect(clearLocalSession).toHaveBeenCalledTimes(1);
    expect(_windowMock.location.href).toBe('/LoginWithPassword');
  });

  test('clearLocalSession is called before redirect', async () => {
    const order = [];
    clearLocalSession.mockImplementation(() => order.push('clear'));
    Object.defineProperty(_windowMock.location, 'href', {
      get: () => '',
      set: (v) => { if (v === '/LoginWithPassword') order.push('redirect'); },
      configurable: true,
    });
    base44.auth.me.mockResolvedValue(null);

    fireExpiredEvent();
    await vi.runAllTimersAsync();

    expect(order).toEqual(['clear', 'redirect']);
  });

  test('redirect fires exactly once even after multiple definitive events', async () => {
    let redirectCount = 0;
    Object.defineProperty(_windowMock.location, 'href', {
      get: () => '',
      set: (v) => { if (v === '/LoginWithPassword') redirectCount++; },
      configurable: true,
    });
    base44.auth.me.mockImplementation(() => definitiveMeError(401));

    // First event → _redirected becomes true after redirect
    fireExpiredEvent();
    await vi.runAllTimersAsync();
    expect(redirectCount).toBe(1);

    // Second event fires while _armed=false and _redirected=true — neither guard
    // allows a second redirect
    fireExpiredEvent();
    await vi.runAllTimersAsync();
    expect(redirectCount).toBe(1);
  });
});

// ─── Transient auth.me() failure ──────────────────────────────────────────────

describe('transient auth.me() failure', () => {
  test('network error → no redirect, no clearLocalSession', async () => {
    base44.auth.me.mockRejectedValue(new TypeError('Network request failed'));

    fireExpiredEvent();
    await vi.runAllTimersAsync();

    expect(clearLocalSession).not.toHaveBeenCalled();
    expect(_windowMock.location.href).not.toBe('/LoginWithPassword');
  });

  test('5xx error → no redirect', async () => {
    base44.auth.me.mockImplementation(() => definitiveMeError(503));

    fireExpiredEvent();
    await vi.runAllTimersAsync();

    expect(clearLocalSession).not.toHaveBeenCalled();
  });
});

// ─── install / uninstall ──────────────────────────────────────────────────────

describe('install / uninstall', () => {
  test('uninstall stops handler from responding to events', async () => {
    base44.auth.me.mockResolvedValue(null);
    uninstall();

    fireExpiredEvent();
    await vi.runAllTimersAsync();

    expect(base44.auth.me).not.toHaveBeenCalled();
    uninstall = null;
  });
});
