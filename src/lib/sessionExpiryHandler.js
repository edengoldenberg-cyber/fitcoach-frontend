/**
 * sessionExpiryHandler.js
 *
 * Handles `fitcoach:session_expired` events emitted by base44Client when a
 * token refresh definitively fails.
 *
 * KEY BEHAVIOUR: before logging the user out, performs ONE confirming auth.me()
 * call. This prevents false logouts caused by transient network blips — most
 * critically, the iOS iPhone camera return scenario where the app briefly loses
 * connectivity while the camera is active and a refresh attempt times out.
 *
 * Auth.me() outcomes:
 *  → user returned       : session is still alive — restore state, don't redirect
 *  → 401 / 403 / null    : definitive expiry — clear session + redirect once
 *  → network / 5xx error : transient — do not logout, re-arm for next event
 */

import { base44, clearLocalSession } from '@/api/base44Client';

const AUTH_PAGES_RE =
  /\/(LoginWithPassword|AccessLink|SetPassword|ResetPassword|AccessCodeLogin)/i;

const DEBOUNCE_MS = 300;

// Module-level state — one handler instance for the page lifetime
let _armed = true;      // armed = will act on next event
let _redirected = false; // exactly-once redirect guard
let _debounceTimer = null;

function _isAuthPage() {
  try { return AUTH_PAGES_RE.test(window.location.pathname); } catch { return false; }
}

async function _handleExpiry() {
  if (!_armed) return;
  if (_isAuthPage()) return;

  _armed = false; // disarm while we confirm, re-arm only on transient failure

  let me;
  try {
    me = await base44.auth.me();
  } catch (err) {
    const status = err?.status;
    if (status === 401 || status === 403) {
      // Definitive — fall through to redirect
      me = null;
    } else {
      // Network / 5xx / unknown — transient, do not logout
      _armed = true;
      return;
    }
  }

  if (me) {
    // Session is still alive (iOS camera return false-alarm, etc.) — restore
    _armed = true;
    return;
  }

  // Definitive expiry: clear local state and navigate to login exactly once
  if (_redirected) return;
  _redirected = true;
  clearLocalSession();
  try { window.location.href = '/LoginWithPassword'; } catch { /* non-browser */ }
}

function _onEvent() {
  if (_debounceTimer) clearTimeout(_debounceTimer);
  _debounceTimer = setTimeout(_handleExpiry, DEBOUNCE_MS);
}

/**
 * install() — attach the handler to the window.
 * Returns an uninstall function (suitable for useEffect cleanup).
 * Safe to call multiple times; only one listener is active at a time.
 */
export function install() {
  window.addEventListener('fitcoach:session_expired', _onEvent);
  return () => {
    window.removeEventListener('fitcoach:session_expired', _onEvent);
  };
}

/**
 * _resetForTest() — resets module-level state between unit test cases.
 * Not for production use.
 */
export function _resetForTest() {
  if (_debounceTimer) clearTimeout(_debounceTimer);
  _armed = true;
  _redirected = false;
  _debounceTimer = null;
}
