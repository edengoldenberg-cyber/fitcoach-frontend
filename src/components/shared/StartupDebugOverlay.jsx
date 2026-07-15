// TEMPORARY DEBUG OVERLAY — remove after iPhone startup spinner bug is diagnosed
import React, { useState, useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import { useAuth } from '@/lib/AuthContext';
import { base44 } from '@/api/client';

function isDebugEnabled() {
  try {
    if (typeof localStorage !== 'undefined' && localStorage.getItem('STARTUP_DEBUG') === '1') return true;
  } catch {}
  try {
    const params = new URLSearchParams(window.location.search);
    if (params.get('startupDebug') === '1') {
      return true;
    }
  } catch {}
  return false;
}

export const DEBUG_ENABLED = isDebugEnabled();

// ─── Module-level log store (populated even before React mounts) ───
const _logs = [];
const _subs = new Set();

function pushLog(msg) {
  const ts = new Date().toISOString().slice(11, 23); // HH:MM:SS.mmm
  const entry = `[${ts}] ${msg}`;
  _logs.push(entry);
  if (_logs.length > 2000) _logs.shift();
  _subs.forEach(fn => fn());
}

// ─── Instrumentation — only installed when debug is enabled ────────
if (DEBUG_ENABLED) {
  pushLog('OVERLAY INIT — debug session started');

  // ── SW controller identity at init ───────────────────────────────────────────
  // Logs WHICH SW script is controlling the page right now.
  // Old SW (generateSW) has no SW_DIAG_TAG → if we never see SW_DIAG messages
  // from the SW itself, the old SW is still controlling.
  try {
    const _ctrl = navigator.serviceWorker?.controller;
    if (_ctrl) {
      pushLog(`SW_CONTROLLER_AT_INIT scriptURL=${_ctrl.scriptURL} state=${_ctrl.state}`);
    } else {
      pushLog('SW_CONTROLLER_AT_INIT none — no SW controlling at overlay init');
    }
  } catch (e) {
    pushLog(`SW_CONTROLLER_AT_INIT err=${e.message}`);
  }

  // ── requestAnimationFrame heartbeat (first 10s) ──────────────────────────
  // Proves the rAF queue is being processed. Distinct from setInterval/setTimeout
  // (macrotask) — iOS WebKit can freeze one queue while another runs.
  // Logs every animation frame (buffer sized to 2000 to handle ~600 frames at 60fps).
  const _rafT0 = performance.now();
  let _rafCount = 0;
  const _rafBeat = () => {
    _rafCount++;
    const elapsed = performance.now() - _rafT0;
    pushLog(`HEARTBEAT RAF #${_rafCount} pnow=${Math.round(elapsed)}ms`);
    if (elapsed < 10000) requestAnimationFrame(_rafBeat);
  };
  requestAnimationFrame(_rafBeat);

  // ── Microtask watchdog (Promise.resolve) ──────────────────────────────────
  // Proves microtask queue is draining. Runs every 1s for 30s then stops.
  const _mtT0 = performance.now();
  let _mtCount = 0;
  const _mtBeat = () => {
    _mtCount++;
    const elapsed = performance.now() - _mtT0;
    if (elapsed > 30000) return;
    Promise.resolve().then(() => {
      pushLog(`MICROTASK OK #${_mtCount} pnow=${Math.round(elapsed)}ms`);
    });
    setTimeout(_mtBeat, 1000);
  };
  setTimeout(_mtBeat, 1000);

  // ── Macrotask watchdog (setTimeout) ──────────────────────────────────────
  // Proves macrotask queue is draining. Separate from setInterval to distinguish
  // between the two scheduling mechanisms. Runs every 1s for 30s then stops.
  const _toT0 = performance.now();
  let _toCount = 0;
  const _toBeat = () => {
    _toCount++;
    const elapsed = performance.now() - _toT0;
    if (elapsed > 30000) return;
    pushLog(`TIMEOUT OK #${_toCount} pnow=${Math.round(elapsed)}ms`);
    setTimeout(_toBeat, 1000);
  };
  setTimeout(_toBeat, 1000);

  // ── base44.auth.me() instrumentation ──────────────────────────────────────
  // Monkey-patch the shared base44 instance (ES module singleton — same object
  // used by AuthContext). Wraps auth.me() to log call start/resolve/reject/finally.
  // No logic changes — the original function is called unchanged.
  if (base44?.auth?.me) {
    const _origMe = base44.auth.me.bind(base44.auth);
    base44.auth.me = function () {
      pushLog(`AUTH_ME_CALL_START pnow=${Math.round(performance.now())}ms sw_controlling=${!!navigator?.serviceWorker?.controller} sw_scriptURL=${navigator?.serviceWorker?.controller?.scriptURL || 'NONE'}`);
      return _origMe().then(
        (result) => {
          pushLog(`AUTH_ME_CALL_RESOLVED pnow=${Math.round(performance.now())}ms user=${result?.email || result?.id || 'null'}`);
          return result;
        },
        (err) => {
          pushLog(`AUTH_ME_CALL_REJECTED pnow=${Math.round(performance.now())}ms status=${err?.status} msg=${err?.message}`);
          throw err;
        }
      ).finally(() => {
        pushLog(`AUTH_ME_CALL_FINALLY pnow=${Math.round(performance.now())}ms`);
      });
    };
    pushLog('AUTH_ME_PATCH_INSTALLED');
  } else {
    pushLog('AUTH_ME_PATCH_FAILED — base44.auth.me not found');
  }

  // ── Heartbeat: proves JS event loop is alive every second ─────────────────
  // If heartbeat entries stop appearing, JS execution froze.
  // If heartbeat continues but Promise.race never settles, only the Promise is stuck.
  let _hbCount = 0;
  setInterval(() => {
    _hbCount++;
    pushLog(`HEARTBEAT #${_hbCount} t=${Date.now()}`);
  }, 1000);

  // ── PerformanceObserver: proves whether SW intercepted each /api/ request ──
  // workerStart > 0 means the SW handled it; workerStart === 0 means direct network.
  if (typeof PerformanceObserver !== 'undefined') {
    try {
      const _po = new PerformanceObserver((list) => {
        for (const e of list.getEntries()) {
          if (e.name && e.name.includes('/api/')) {
            pushLog(`PERF_RESOURCE url=${e.name.split('/api/')[1] || e.name} workerStart=${e.workerStart} fetchStart=${e.fetchStart} responseEnd=${e.responseEnd} duration=${Math.round(e.duration)}ms`);
          }
        }
      });
      _po.observe({ entryTypes: ['resource'] });
      pushLog('PERF_OBSERVER registered for /api/ entries');
    } catch (e) {
      pushLog(`PERF_OBSERVER_ERR ${e.message}`);
    }
  } else {
    pushLog('PERF_OBSERVER not available on this browser');
  }

  // Patch console.log / warn / error
  const _clog = console.log;
  const _cwarn = console.warn;
  const _cerr = console.error;

  console.log = (...args) => {
    _clog.apply(console, args);
    const str = args.map(a => (a !== null && typeof a === 'object') ? JSON.stringify(a) : String(a)).join(' ');
    pushLog('LOG: ' + str);
  };
  console.warn = (...args) => {
    _cwarn.apply(console, args);
    const str = args.map(a => (a !== null && typeof a === 'object') ? JSON.stringify(a) : String(a)).join(' ');
    pushLog('WARN: ' + str);
  };
  console.error = (...args) => {
    _cerr.apply(console, args);
    const str = args.map(a => (a !== null && typeof a === 'object') ? JSON.stringify(a) : String(a)).join(' ');
    pushLog('ERR: ' + str);
  };

  // Patch window.fetch
  const _origFetch = window.fetch;
  window.fetch = function(input, init) {
    const url = typeof input === 'string' ? input : (input?.url || String(input));
    const method = init?.method || (typeof input === 'object' ? input?.method : undefined) || 'GET';
    const short = url.length > 65 ? url.slice(0, 30) + '…' + url.slice(-30) : url;
    pushLog(`FETCH▶ ${method} ${short}`);
    const t0 = Date.now();
    return _origFetch.call(window, input, init).then(
      res => { pushLog(`FETCH✓ ${method} ${short} → ${res.status} (${Date.now() - t0}ms)`); return res; },
      err => { pushLog(`FETCH✗ ${method} ${short} → ${err.message} (${Date.now() - t0}ms)`); throw err; }
    );
  };

  // Service Worker events
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      const _newCtrl = navigator.serviceWorker.controller;
      pushLog(`SW: CONTROLLERCHANGE → scriptURL=${_newCtrl?.scriptURL || 'NONE'} state=${_newCtrl?.state || 'NONE'}`);
    });
    navigator.serviceWorker.addEventListener('message', e => pushLog(`SW: message ${JSON.stringify(e.data)}`));
  }

  // Network / visibility
  window.addEventListener('online', () => pushLog('NET: online'));
  window.addEventListener('offline', () => pushLog('NET: offline'));
  document.addEventListener('visibilitychange', () => pushLog(`VIS: ${document.visibilityState}`));

  // Redirect tracking
  const _origAssign   = window.location.assign.bind(window.location);
  const _origReplace  = window.location.replace.bind(window.location);
  try {
    window.location.assign  = (u) => { pushLog(`REDIRECT assign → ${u}`);  _origAssign(u);  };
    window.location.replace = (u) => { pushLog(`REDIRECT replace → ${u}`); _origReplace(u); };
  } catch {}
}

// ─── Runtime diagnosis engine ─────────────────────────────────────
// Analyzes _logs + current auth state → returns a structured diagnosis object.
// No guessing — every field must be traceable to a specific log entry or state value.
function buildDiagnosis(logs, auth, swInfo) {
  const has  = (s) => logs.some(l => l.includes(s));
  const find = (s) => logs.find(l => l.includes(s)) || null;

  // Heartbeat
  const hbLogs = logs.filter(l => l.includes('HEARTBEAT #'));
  const hasHeartbeat = hbLogs.length > 0;
  const lastHB = hbLogs[hbLogs.length - 1] || null;

  // public-settings lifecycle
  const psSkipped     = has('SKIPPED') && (has('IOS') || has('removed from startup'));
  const psIife        = has('IIFE_STARTED');
  const psBeforeRace  = has('BEFORE_RACE');
  const psRaceStart   = has('RACE_STARTING');
  const psResolved    = has('RACE_RESOLVED');
  const psCatch       = has('CATCH_ENTERED');
  const psFinally     = has('FINALLY_ENTERED') || has('FINALLY_EXECUTED');
  const psTimeout     = has('TIMEOUT_CB_FIRED') || has('TIMEOUT_FIRED');

  // client.js fetch instrumentation
  const psFetchInit   = has('FETCH_INIT');
  const psBeforeAwait = has('BEFORE_AWAIT_FETCH');
  const psFetchRet    = has('FETCH_RETURNED');
  const psFetchCatch  = has('[PS_FETCH] CATCH');
  const psFetchFin    = has('[PS_FETCH] FINALLY');
  const psAbortCb     = has('ABORT_SETTIMEOUT_CB');
  const psSignalAbort = has('SIGNAL_ABORT_EVENT');

  // Overlay fetch interceptor
  const authMeFetched  = has('FETCH▶') && has('auth/me');
  const authMeOk       = has('FETCH✓') && has('auth/me');
  const authMeFail     = has('FETCH✗') && has('auth/me');
  const psFetchViaInt  = logs.some(l => l.includes('FETCH▶') && (l.includes('public-settings') || l.includes('by-id')));
  const psFetchRetViaInt = logs.some(l => l.includes('FETCH✓') && (l.includes('public-settings') || l.includes('by-id')));

  // SW from logs
  const swInLog = has('sw_controlling=true');
  const swActive = swInfo.controlling || swInLog;

  // Current blocking states
  const authStuck = auth.isLoadingAuth;
  const psStuck   = auth.isLoadingPublicSettings;

  // Heartbeat presence relative to last PS fetch log
  const beforeAwaitIdx = logs.findIndex(l => l.includes('BEFORE_AWAIT_FETCH'));
  const hbAfterFetch = beforeAwaitIdx >= 0 && hbLogs.some(h => logs.indexOf(h) > beforeAwaitIdx);
  const psFetchWithNoResponse = psBeforeAwait && !psFetchRet && !psFetchCatch && !psFetchFin;

  // AUTH_ME lifecycle flags
  const authMeStart    = has('AUTH_ME_CALL_START');
  const authMeResolved = has('AUTH_ME_CALL_RESOLVED');
  const authMeRejected = has('AUTH_ME_CALL_REJECTED');
  const authMeFinally  = has('AUTH_ME_CALL_FINALLY');
  const authMePatch    = has('AUTH_ME_PATCH_INSTALLED');

  // RAF heartbeat after AUTH_ME_CALL_START
  const authMeStartIdx = logs.findIndex(l => l.includes('AUTH_ME_CALL_START'));
  const rafAfterAuthMe = authMeStartIdx >= 0 && logs.some((l, i) => i > authMeStartIdx && l.includes('HEARTBEAT RAF'));
  const mtAfterAuthMe  = authMeStartIdx >= 0 && logs.some((l, i) => i > authMeStartIdx && (l.includes('MICROTASK OK') || l.includes('TIMEOUT OK')));

  // ── Decision tree ──────────────────────────────────────────────────────────

  // AUTH CASE A: auth.me() was called, no RAF or timer fired after it → event loop froze inside fetch()
  if (authMeStart && !authMeFinally && !rafAfterAuthMe && !mtAfterAuthMe && authMeStartIdx >= 0) {
    return {
      rootCause: 'The JavaScript main thread stopped executing after auth.me() started.',
      stuckStep: 'base44.auth.me() → apiFetch() → window.fetch() — same iOS+SW freeze as public-settings',
      pendingRequest: 'GET /api/auth/me (via window.fetch — intercepted by SW)',
      blockingState: `isLoadingAuth=${auth.isLoadingAuth} | sw_controlling=${swActive}`,
      fileLine: 'base44Client.js: apiFetch() → const res = await fetch(url, { credentials:"include" })',
      fix: 'auth/me uses window.fetch which the SW intercepts. The same iOS WebKit+SW freeze that affected public-settings now affects auth/me. Fix: bypass SW for this fetch (use XHR or exclude /api/ from SW).',
      confidence: 'HIGH',
      evidence: [
        find('AUTH_ME_CALL_START') || 'AUTH_ME_CALL_START present',
        'No HEARTBEAT RAF after AUTH_ME_CALL_START',
        'No MICROTASK OK or TIMEOUT OK after AUTH_ME_CALL_START',
        'No AUTH_ME_CALL_FINALLY',
        `sw_controlling=${swActive}`,
      ],
    };
  }

  // AUTH CASE B: auth.me() called, RAF/timers continue, but promise never settled
  if (authMeStart && !authMeFinally && (rafAfterAuthMe || mtAfterAuthMe)) {
    return {
      rootCause: 'auth.me() promise is pending.',
      stuckStep: 'await apiFetch() inside base44.auth.me() — fetch dispatched, no response',
      pendingRequest: 'GET /api/auth/me',
      blockingState: `isLoadingAuth=${auth.isLoadingAuth} | authChecked=${auth.authChecked}`,
      fileLine: 'base44Client.js: apiFetch() → const res = await fetch(url)',
      fix: 'auth/me fetch is stuck in the SW. The SW intercepts it and does not respond on iOS. Use XHR for auth, or add /api/auth/me to SW exclusion list.',
      confidence: 'HIGH',
      evidence: [
        find('AUTH_ME_CALL_START') || 'AUTH_ME_CALL_START present',
        rafAfterAuthMe ? 'HEARTBEAT RAF continues after AUTH_ME_CALL_START' : 'RAF stopped',
        mtAfterAuthMe  ? 'MICROTASK/TIMEOUT OK after AUTH_ME_CALL_START' : 'timers stopped',
        'No AUTH_ME_CALL_FINALLY',
        `sw_controlling=${swActive}`,
      ],
    };
  }

  // AUTH CASE C: auth.me() completed normally (FINALLY present)
  if (authMeFinally && authStuck) {
    return {
      rootCause: 'auth.me() completed but isLoadingAuth is still true — React state not updated',
      stuckStep: 'After AUTH_ME_CALL_FINALLY — setIsLoadingAuth(false) did not fire or did not re-render',
      pendingRequest: 'None — auth.me() returned',
      blockingState: `isLoadingAuth=${auth.isLoadingAuth} | authChecked=${auth.authChecked}`,
      fileLine: 'AuthContext.jsx: checkUserAuth() — after Promise.race resolves, setIsLoadingAuth(false) call',
      fix: 'auth.me() returned but the React state update may be blocked. Check if there is a throw in checkUserAuth after auth.me() resolves.',
      confidence: 'MEDIUM',
      evidence: [
        find('AUTH_ME_CALL_FINALLY') || 'AUTH_ME_CALL_FINALLY present',
        authMeResolved ? find('AUTH_ME_CALL_RESOLVED') || 'AUTH_ME_CALL_RESOLVED' : 'No AUTH_ME_CALL_RESOLVED',
        authMeRejected ? find('AUTH_ME_CALL_REJECTED') || 'AUTH_ME_CALL_REJECTED' : 'No AUTH_ME_CALL_REJECTED',
        `isLoadingAuth=${auth.isLoadingAuth} (still true)`,
      ],
    };
  }

  // AUTH CASE C-OK: auth.me() completed normally (FINALLY present, not stuck)
  if (authMeFinally) {
    return {
      rootCause: 'auth.me() completed normally.',
      stuckStep: 'None — AUTH_ME_CALL_FINALLY was logged',
      pendingRequest: 'None',
      blockingState: `isLoadingAuth=${auth.isLoadingAuth} | authChecked=${auth.authChecked}`,
      fileLine: 'N/A',
      fix: 'No fix needed — auth completed successfully.',
      confidence: 'HIGH',
      evidence: [
        find('AUTH_ME_CALL_FINALLY') || 'AUTH_ME_CALL_FINALLY present',
        authMeResolved ? find('AUTH_ME_CALL_RESOLVED') || 'AUTH_ME_CALL_RESOLVED' : 'No AUTH_ME_CALL_RESOLVED',
        authMeRejected ? find('AUTH_ME_CALL_REJECTED') || 'AUTH_ME_CALL_REJECTED' : 'No AUTH_ME_CALL_REJECTED',
      ],
    };
  }

  // CASE 1: Almost no logs + no heartbeat → JS froze at or before overlay init
  if (!hasHeartbeat && logs.length < 6) {
    return {
      rootCause: 'JS execution stopped before the overlay could initialize',
      stuckStep: 'Before OVERLAY INIT log entry',
      pendingRequest: 'None — too early to determine',
      blockingState: `isLoadingAuth=${auth.isLoadingAuth} | isLoadingPublicSettings=${auth.isLoadingPublicSettings}`,
      fileLine: 'Unknown — no instrumented lines reached',
      fix: 'Hard-reload the page, clear SW cache via the browser. If recurring: the old SW may be serving stale JS.',
      confidence: 'LOW',
      evidence: [`${logs.length} total log entries`, 'No HEARTBEAT entry'],
    };
  }

  // CASE 2: BEFORE_AWAIT_FETCH present, no response, no heartbeat after fetch → event loop froze inside fetch()
  if (psFetchWithNoResponse && !hbAfterFetch && beforeAwaitIdx >= 0) {
    return {
      rootCause: 'fetch() inside createHttpClient.get() froze the JavaScript event loop',
      stuckStep: 'await fetch() — execution entered fetch(), timers stopped firing',
      pendingRequest: 'GET /api/apps/public/.../public-settings/by-id/<appId>',
      blockingState: `sw_controlling=${swActive} | isLoadingPublicSettings=${psStuck}`,
      fileLine: 'client.js → get() → const res = await fetch(_url, { credentials:"include" })',
      fix: 'Remove public-settings from startup entirely. This cross-origin fetch via SW freezes all timers on iOS.',
      confidence: 'HIGH',
      evidence: [
        find('BEFORE_AWAIT_FETCH') || 'BEFORE_AWAIT_FETCH present',
        'No HEARTBEAT after BEFORE_AWAIT_FETCH',
        'No FETCH_RETURNED / no PS_FETCH CATCH / no PS_FETCH FINALLY',
        `sw_controlling=${swActive}`,
      ],
    };
  }

  // CASE 3: BEFORE_AWAIT_FETCH present, no response, but heartbeat continues → fetch stuck but JS alive
  if (psFetchWithNoResponse && hbAfterFetch) {
    return {
      rootCause: 'public-settings fetch() is pending — JS alive but SW never responded',
      stuckStep: 'await fetch() — waiting for SW to return a response',
      pendingRequest: 'GET /api/apps/public/.../public-settings/by-id/<appId>',
      blockingState: `sw_controlling=${swActive} | isLoadingPublicSettings=${psStuck}`,
      fileLine: 'client.js → get() → await fetch(_url, { credentials:"include" })',
      fix: 'Remove public-settings from startup. The SW intercepts this cross-origin fetch and never resolves it on iOS.',
      confidence: 'HIGH',
      evidence: [
        find('BEFORE_AWAIT_FETCH') || 'BEFORE_AWAIT_FETCH present',
        `HEARTBEAT continues (${hbLogs.length} entries after fetch started)`,
        'No FETCH_RETURNED',
        `sw_controlling=${swActive}`,
        psAbortCb ? 'ABORT_SETTIMEOUT_CB present (timer DID fire)' : 'No ABORT_SETTIMEOUT_CB (timer blocked)',
        psTimeout  ? 'TIMEOUT_CB_FIRED present' : 'No TIMEOUT_CB_FIRED (psTimeout blocked)',
      ],
    };
  }

  // CASE 4: auth/me fetch started but never returned, heartbeat running
  if (authMeFetched && !authMeOk && !authMeFail && authStuck && hasHeartbeat) {
    return {
      rootCause: 'auth/me fetch is stuck — request sent, no response, JS alive',
      stuckStep: 'await base44.auth.me() inside checkUserAuth()',
      pendingRequest: `GET ${find('FETCH▶') || '/api/auth/me'}`,
      blockingState: `isLoadingAuth=${auth.isLoadingAuth} | authChecked=${auth.authChecked}`,
      fileLine: 'AuthContext.jsx → checkUserAuth() → await Promise.race([base44.auth.me(), authTimeout])',
      fix: 'auth/me uses window.fetch which SW may intercept. Ensure the /api/auth/me route is NOT in Workbox runtime cache, or bypass via XHR.',
      confidence: 'HIGH',
      evidence: [
        find('FETCH▶') || 'FETCH▶ auth/me present',
        'No FETCH✓ for auth/me',
        'No FETCH✗ for auth/me',
        `isLoadingAuth=${auth.isLoadingAuth}`,
        `sw_controlling=${swActive}`,
        `HEARTBEAT running (${hbLogs.length} entries)`,
      ],
    };
  }

  // CASE 5: PS was skipped, isLoadingPublicSettings still true → default state never cleared
  if (psStuck && psSkipped) {
    return {
      rootCause: 'isLoadingPublicSettings=true despite public-settings being skipped',
      stuckStep: 'Initial useState() value — finally block never ran to clear it',
      pendingRequest: 'None',
      blockingState: `isLoadingPublicSettings=${psStuck} — spinner shows because this is true`,
      fileLine: 'AuthContext.jsx → const [isLoadingPublicSettings] = useState(...) — must default to false',
      fix: 'Change useState(true) to useState(false) for isLoadingPublicSettings in AuthContext.',
      confidence: 'HIGH',
      evidence: [
        `isLoadingPublicSettings=${psStuck}`,
        find('SKIPPED') || 'public-settings SKIPPED log present',
        'No FINALLY_ENTERED (IIFE never ran, state never cleared)',
      ],
    };
  }

  // CASE 6: auth stuck, heartbeat running, no auth/me fetch log
  if (authStuck && hasHeartbeat && !authMeFetched) {
    return {
      rootCause: 'auth/me was never issued — isLoadingAuth stuck before fetch started',
      stuckStep: 'checkUserAuth() → before base44.auth.me() call, OR checkAppState() blocked',
      pendingRequest: 'None — auth/me not dispatched yet',
      blockingState: `isLoadingAuth=${auth.isLoadingAuth} | authChecked=${auth.authChecked}`,
      fileLine: 'AuthContext.jsx → checkAppState() or checkUserAuth() — not reaching auth.me()',
      fix: psSkipped
        ? 'PS is skipped. Something in checkUserAuth() stalled before fetch. Check if useEffect fired.'
        : 'PS IIFE may be running and blocking checkUserAuth via async state.',
      confidence: 'MEDIUM',
      evidence: [
        `isLoadingAuth=${auth.isLoadingAuth}`,
        'No FETCH▶ for auth/me',
        `HEARTBEAT running (${hbLogs.length} entries)`,
        psSkipped ? 'public-settings SKIPPED' : 'PS IIFE state unknown',
      ],
    };
  }

  // CASE 7: nothing blocking
  if (!authStuck && !psStuck) {
    return {
      rootCause: 'No blocking condition detected in this snapshot',
      stuckStep: 'None',
      pendingRequest: 'None',
      blockingState: 'isLoadingAuth=false | isLoadingPublicSettings=false',
      fileLine: 'N/A',
      fix: 'Spinner should have cleared. Capture this report while the spinner is still visible.',
      confidence: 'LOW',
      evidence: ['isLoadingAuth=false', 'isLoadingPublicSettings=false'],
    };
  }

  // Fallback
  return {
    rootCause: 'Cannot determine root cause from available logs',
    stuckStep: 'Unknown',
    pendingRequest: 'Unknown',
    blockingState: `isLoadingAuth=${auth.isLoadingAuth} | isLoadingPublicSettings=${auth.isLoadingPublicSettings}`,
    fileLine: 'Unknown',
    fix: 'Capture report while spinner is active. Ensure HEARTBEAT appears in log.',
    confidence: 'LOW',
    evidence: [`${logs.length} log entries`, 'Pattern did not match any known case'],
  };
}

// ─── Public component ─────────────────────────────────────────────
export default function StartupDebugOverlay() {
  if (!DEBUG_ENABLED) return null;
  return <DebugPanel />;
}

function DebugPanel() {
  const [, redraw] = useState(0);
  const [minimized, setMinimized] = useState(false);
  const [copyStatus, setCopyStatus] = useState('');
  const [swInfo, setSwInfo] = useState({
    registered: false, controlling: false, state: 'unknown',
    waiting: false, scope: '', scriptURL: ''
  });
  const [cacheNames, setCacheNames] = useState([]);
  const [bundleFile, setBundleFile] = useState('');
  const [now, setNow] = useState(() => new Date().toISOString());

  const location = useLocation();
  const auth = useAuth();
  const renderCount = useRef(0);
  const logEndRef = useRef(null);
  const prevPath = useRef(location.pathname + location.search);
  const prevSnap = useRef({});
  const swListening = useRef(false);

  renderCount.current += 1;

  // Subscribe to log updates → redraw
  useEffect(() => {
    const fn = () => redraw(n => n + 1);
    _subs.add(fn);
    return () => _subs.delete(fn);
  }, []);

  // Clock — tick every second
  useEffect(() => {
    const id = setInterval(() => setNow(new Date().toISOString()), 1000);
    return () => clearInterval(id);
  }, []);

  // Auto-scroll log to bottom on every render
  useEffect(() => {
    if (!minimized && logEndRef.current) {
      logEndRef.current.scrollIntoView({ behavior: 'instant' });
    }
  });

  // Route change tracking
  useEffect(() => {
    const curr = location.pathname + location.search;
    if (curr !== prevPath.current) {
      pushLog(`ROUTE: ${prevPath.current} → ${curr}`);
      prevPath.current = curr;
    }
  }, [location.pathname, location.search]);

  // Auth state transition tracking (every render so nothing is missed)
  const {
    isLoadingAuth, isLoadingPublicSettings, isAuthenticated,
    authChecked, user, authError, startupTimedOut
  } = auth;

  useEffect(() => {
    const snap = {
      isLoadingAuth, isLoadingPublicSettings, isAuthenticated,
      authChecked, startupTimedOut,
      userId:    user?.id    ?? null,
      userEmail: user?.email ?? null,
      authErr:   authError ? JSON.stringify(authError) : null,
    };
    const prev = prevSnap.current;
    const bools = ['isLoadingAuth', 'isLoadingPublicSettings', 'isAuthenticated', 'authChecked', 'startupTimedOut'];
    bools.forEach(k => {
      if (k in prev && prev[k] !== snap[k]) pushLog(`STATE: ${k}: ${prev[k]} → ${snap[k]}`);
    });
    if ('userId' in prev && prev.userId !== snap.userId) {
      pushLog(`STATE: user: ${prev.userId ?? 'null'} → ${snap.userId ?? 'null'} (${snap.userEmail ?? ''})`);
    }
    if ('authErr' in prev && prev.authErr !== snap.authErr) {
      pushLog(`STATE: authError: ${prev.authErr} → ${snap.authErr}`);
    }
    prevSnap.current = snap;
  });

  // Service Worker status — poll every 2s
  useEffect(() => {
    async function checkSW() {
      if (!('serviceWorker' in navigator)) {
        setSwInfo(s => ({ ...s, state: 'not supported' }));
        return;
      }
      try {
        const regs = await navigator.serviceWorker.getRegistrations();
        const reg = regs[0];
        if (reg) {
          const state =
            reg.active?.state || reg.waiting?.state || reg.installing?.state || 'none';
          setSwInfo({
            registered:  true,
            controlling: !!navigator.serviceWorker.controller,
            state,
            waiting:     !!reg.waiting,
            scope:       reg.scope,
            scriptURL:   reg.active?.scriptURL || reg.waiting?.scriptURL || reg.installing?.scriptURL || '',
          });
          if (!swListening.current) {
            swListening.current = true;
            if (reg.waiting)    pushLog('SW: has waiting worker on attach');
            if (reg.active)     pushLog(`SW: active state=${reg.active.state} on attach`);
            if (reg.installing) pushLog('SW: installing on attach');
            reg.addEventListener('updatefound', () => {
              pushLog('SW: updatefound');
              const sw = reg.installing;
              if (sw) sw.addEventListener('statechange', () => pushLog(`SW: statechange → ${sw.state}`));
            });
          }
        } else {
          setSwInfo(s => ({ ...s, registered: false, state: 'no registration' }));
        }
        const keys = await caches.keys();
        setCacheNames(keys);
      } catch (e) {
        pushLog(`SW_CHECK_ERR: ${e.message}`);
      }
    }
    checkSW();
    const id = setInterval(checkSW, 2000);
    return () => clearInterval(id);
  }, []);

  // Bundle file detection (read script tag injected by Vite)
  useEffect(() => {
    const el = Array.from(document.querySelectorAll('script[src]'))
      .find(s => s.src.includes('/assets/index-') && s.src.endsWith('.js'));
    if (el) setBundleFile(el.src.split('/').pop());
  }, []);

  // ── Live diagnosis (recomputed each render) ───────────────────────
  const diagnosis = buildDiagnosis(_logs, {
    isLoadingAuth, isLoadingPublicSettings, isAuthenticated,
    authChecked, user, authError, startupTimedOut,
  }, swInfo);

  // ── Copy Full Diagnostic Report ───────────────────────────────────
  const copyReport = async () => {
    const reportTs = new Date().toISOString();
    let buildTs = 'unknown';
    try { buildTs = __BUILD_TS__; } catch {}

    const networkLogs = _logs.filter(l => l.includes('FETCH▶') || l.includes('FETCH✓') || l.includes('FETCH✗'));
    const psLifecycle = _logs.filter(l => l.includes('public-settings:'));
    const psFetchLogs = _logs.filter(l => l.includes('[PS_FETCH]'));
    const swLogs      = _logs.filter(l => l.includes('SW:') || l.includes('SW_CHECK') || l.includes('PERF_RESOURCE'));
    const heartbeats  = _logs.filter(l => l.includes('HEARTBEAT'));

    const ua = navigator.userAgent;
    const browserMatch = ua.match(/(Chrome|CriOS|FxiOS|EdgiOS|OPiOS|Safari)\/[\d.]+/g) || [];
    const osMatch      = ua.match(/\(([^)]+)\)/)?.[1] || 'unknown';
    const lines = (arr) => arr.length ? arr.join('\n') : '  (none)';

    const d = diagnosis;
    const report = [
      '========================',
      'DIAGNOSIS',
      '========================',
      `Root cause      : ${d.rootCause}`,
      `Stuck step      : ${d.stuckStep}`,
      `Pending request : ${d.pendingRequest}`,
      `Blocking state  : ${d.blockingState}`,
      `File/line       : ${d.fileLine}`,
      `Recommended fix : ${d.fix}`,
      `Confidence      : ${d.confidence}`,
      '',
      'Evidence:',
      ...(d.evidence || []).map(e => `  - ${e}`),
      '',
      '========================',
      'BUILD',
      '========================',
      `Build timestamp : ${buildTs}`,
      `JS bundle       : ${bundleFile || 'unknown'}`,
      `SW script URL   : ${swInfo.scriptURL || 'n/a'}`,
      `Browser         : ${browserMatch.join(' | ') || 'unknown'}`,
      `OS              : ${osMatch}`,
      `User agent      : ${ua}`,
      `Report time     : ${reportTs}`,
      '',
      '========================',
      'STATE',
      '========================',
      `isLoadingAuth           : ${isLoadingAuth}`,
      `isLoadingPublicSettings : ${isLoadingPublicSettings}`,
      `startupTimedOut         : ${startupTimedOut}`,
      `authChecked             : ${authChecked}`,
      `isAuthenticated         : ${isAuthenticated}`,
      `user.id                 : ${user?.id || 'null'}`,
      `user.email              : ${user?.email || 'null'}`,
      `current route           : ${location.pathname}${location.search}`,
      `authError               : ${authError ? JSON.stringify(authError) : 'null'}`,
      `navigator.onLine        : ${navigator.onLine}`,
      `visibilityState         : ${document.visibilityState}`,
      '',
      '========================',
      'NETWORK',
      '========================',
      lines(networkLogs),
      '',
      '========================',
      'PUBLIC SETTINGS',
      '========================',
      lines(psLifecycle),
      '',
      '========================',
      'FETCH',
      '========================',
      lines(psFetchLogs),
      '',
      '========================',
      'SERVICE WORKER',
      '========================',
      `registered  : ${swInfo.registered}`,
      `controlling : ${swInfo.controlling}`,
      `state       : ${swInfo.state}`,
      `waiting     : ${swInfo.waiting}`,
      `scope       : ${swInfo.scope || 'n/a'}`,
      `scriptURL   : ${swInfo.scriptURL || 'n/a'}`,
      `caches      : ${cacheNames.join(', ') || 'none'}`,
      '',
      'SW log entries:',
      lines(swLogs),
      '',
      '========================',
      'HEARTBEAT',
      '========================',
      lines(heartbeats),
      '',
      '========================',
      'TIMELINE (all entries chronological)',
      '========================',
      ..._logs,
    ].join('\n');

    try {
      await navigator.clipboard.writeText(report);
      setCopyStatus('✓ Copied!');
    } catch (e) {
      try {
        const ta = document.createElement('textarea');
        ta.value = report;
        ta.style.cssText = 'position:fixed;top:0;left:0;opacity:0';
        document.body.appendChild(ta);
        ta.focus(); ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
        setCopyStatus('✓ Copied (fallback)');
      } catch (e2) {
        setCopyStatus('✗ Failed: ' + e2.message);
      }
    }
    setTimeout(() => setCopyStatus(''), 4000);
  };

  // Derive current startup phase
  const phase = (() => {
    if (isLoadingAuth || isLoadingPublicSettings)
      return startupTimedOut ? 'LOADING_TIMED_OUT' : 'LOADING';
    if (!isAuthenticated && !authChecked) return 'UNAUTH_UNCHECKED';
    if (!isAuthenticated) return 'UNAUTHENTICATED';
    if (!authChecked)     return 'AUTH_PENDING';
    return 'AUTHENTICATED';
  })();

  // ── Inline styles — intentionally not Tailwind for reliability ──
  const S = {
    overlay: {
      position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
      zIndex: 99999,
      background: 'rgba(0,0,0,0.93)',
      color: '#ccc',
      fontFamily: '"Courier New", Courier, monospace',
      fontSize: '11px',
      display: 'flex', flexDirection: 'column',
      WebkitOverflowScrolling: 'touch',
    },
    hdr: {
      display: 'flex', alignItems: 'center', gap: 6,
      padding: '6px 8px',
      background: '#150030',
      borderBottom: '2px solid #6600cc',
      flexShrink: 0, fontSize: '12px',
      color: '#cc88ff', fontWeight: 'bold',
    },
    btn: {
      padding: '3px 10px',
      background: '#330066', color: '#cc88ff',
      border: '1px solid #6600cc', borderRadius: 3,
      cursor: 'pointer', fontSize: '11px',
      fontFamily: 'monospace',
    },
    stateArea: {
      padding: '5px 8px',
      borderBottom: '1px solid #2a2a2a',
      flexShrink: 0, overflowY: 'auto', maxHeight: '44%',
      WebkitOverflowScrolling: 'touch',
    },
    row:  { display: 'flex', alignItems: 'flex-start', gap: 4, marginBottom: 2 },
    lbl:  { color: '#555', minWidth: 185, flexShrink: 0, fontSize: '10px' },
    ok:   { color: '#00ff88', wordBreak: 'break-all' },
    bad:  { color: '#ff5555', wordBreak: 'break-all' },
    warn: { color: '#ffaa00', wordBreak: 'break-all' },
    logWrap: {
      flex: 1, overflowY: 'auto', padding: '3px 6px',
      WebkitOverflowScrolling: 'touch',
    },
  };

  const V = ({ label, value, bad, warn }) => (
    <div style={S.row}>
      <span style={S.lbl}>{label}</span>
      <span style={bad ? S.bad : warn ? S.warn : S.ok}>{String(value ?? '—')}</span>
    </div>
  );

  // Minimized bar
  if (minimized) {
    return (
      <div style={{ ...S.hdr, position: 'fixed', top: 0, left: 0, right: 0, zIndex: 99999 }}>
        <span>DBG</span>
        <span style={{ color: '#888', fontSize: 10 }}>{now.slice(11, 19)}</span>
        <span style={isLoadingAuth             ? S.warn : S.ok}>auth={String(isLoadingAuth)}</span>
        <span style={isLoadingPublicSettings   ? S.warn : S.ok}>ps={String(isLoadingPublicSettings)}</span>
        <span style={startupTimedOut           ? S.bad  : S.ok}>to={String(startupTimedOut)}</span>
        <span style={{ color: '#88ffff', fontSize: 10 }}>{phase}</span>
        <button style={{ ...S.btn, marginLeft: 'auto' }} onClick={() => setMinimized(false)}>EXPAND</button>
      </div>
    );
  }

  return (
    <div style={S.overlay}>

      {/* ── Header ── */}
      <div style={S.hdr}>
        <span>STARTUP DEBUG</span>
        <span style={{ color: '#888', fontSize: 10 }}>{now}</span>
        <span style={{ color: '#888', fontSize: 10 }}>r#{renderCount.current}</span>
        <span style={{ color: '#88ffff', marginLeft: 4 }}>{phase}</span>
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 6 }}>
          {copyStatus && (
            <span style={{ fontSize: 10, color: copyStatus.startsWith('✓') ? '#44ff88' : '#ff5555' }}>
              {copyStatus}
            </span>
          )}
          <button
            style={{ ...S.btn, background: '#002200', color: '#44ff88', borderColor: '#00aa44' }}
            onClick={copyReport}
          >
            📋 Copy Report
          </button>
          <button style={S.btn} onClick={() => setMinimized(true)}>MIN</button>
        </div>
      </div>

      {/* ── State section ── */}
      <div style={S.stateArea}>
        <V label="URL"                     value={window.location.href} />
        <V label="pathname"                value={location.pathname} />
        <V label="search"                  value={location.search || '(none)'} />
        <V label="───────────────────"     value="" />
        <V label="isLoadingAuth"           value={isLoadingAuth}           bad={isLoadingAuth === true} />
        <V label="isLoadingPublicSettings" value={isLoadingPublicSettings} bad={isLoadingPublicSettings === true} />
        <V label="startupTimedOut"         value={startupTimedOut}         bad={startupTimedOut === true} />
        <V label="isAuthenticated"         value={isAuthenticated} />
        <V label="authChecked"             value={authChecked} />
        <V label="user.id"                 value={user?.id    || 'null'} />
        <V label="user.email"              value={user?.email || 'null'} />
        <V label="authError"               value={authError ? JSON.stringify(authError) : 'null'} bad={!!authError} />
        <V label="───────────────────"     value="" />
        <V label="navigator.onLine"        value={navigator.onLine}              bad={!navigator.onLine} />
        <V label="document.visibilityState" value={document.visibilityState}     warn={document.visibilityState !== 'visible'} />
        <V label="───────────────────"     value="" />
        <V label="SW registered"           value={swInfo.registered} />
        <V label="SW controlling"          value={swInfo.controlling}            warn={!swInfo.controlling} />
        <V label="SW state"                value={swInfo.state} />
        <V label="SW waiting"              value={swInfo.waiting}                bad={swInfo.waiting} />
        <V label="SW scope"                value={swInfo.scope   || 'n/a'} />
        <V label="SW scriptURL"            value={swInfo.scriptURL ? swInfo.scriptURL.split('/').pop() : 'n/a'} />
        <V label="caches"                  value={cacheNames.join(', ') || 'none'} />
        <V label="───────────────────"     value="" />
        <V label="bundle"                  value={bundleFile || 'detecting…'} />
        <V label="API host"                value="fitcoach-server-production-19e8.up.railway.app" />
      </div>

      {/* ── DIAGNOSIS ── */}
      {(() => {
        const d = diagnosis;
        const confColor = d.confidence === 'HIGH' ? '#ff5555' : d.confidence === 'MEDIUM' ? '#ffaa00' : '#888';
        const DS = {
          wrap: { padding: '5px 8px', borderBottom: '1px solid #2a2a2a', flexShrink: 0, background: '#0d0d1a' },
          hdr:  { color: confColor, fontWeight: 'bold', fontSize: '11px', marginBottom: 4 },
          row:  { display: 'flex', gap: 4, marginBottom: 2, fontSize: '10px' },
          lbl:  { color: '#666', minWidth: 120, flexShrink: 0 },
          val:  { color: '#ddd', wordBreak: 'break-all' },
          ev:   { color: '#888', fontSize: '9px', marginTop: 3 },
        };
        return (
          <div style={DS.wrap}>
            <div style={DS.hdr}>DIAGNOSIS [{d.confidence}]</div>
            <div style={DS.row}><span style={DS.lbl}>Root cause</span><span style={{ ...DS.val, color: confColor }}>{d.rootCause}</span></div>
            <div style={DS.row}><span style={DS.lbl}>Stuck step</span><span style={DS.val}>{d.stuckStep}</span></div>
            <div style={DS.row}><span style={DS.lbl}>Pending request</span><span style={DS.val}>{d.pendingRequest}</span></div>
            <div style={DS.row}><span style={DS.lbl}>Blocking state</span><span style={DS.val}>{d.blockingState}</span></div>
            <div style={DS.row}><span style={DS.lbl}>File/line</span><span style={{ ...DS.val, color: '#ffcc44' }}>{d.fileLine}</span></div>
            <div style={DS.row}><span style={DS.lbl}>Recommended fix</span><span style={{ ...DS.val, color: '#44ffaa' }}>{d.fix}</span></div>
            <div style={DS.ev}>Evidence: {(d.evidence || []).join(' | ')}</div>
          </div>
        );
      })()}

      {/* ── Log header ── */}
      <div style={{ padding: '2px 8px', color: '#444', fontSize: 10, flexShrink: 0, borderBottom: '1px solid #1a1a1a' }}>
        LOG ↓ ({_logs.length} entries — newest at bottom)
      </div>

      {/* ── Log body ── */}
      <div style={S.logWrap}>
        {_logs.map((line, i) => {
          let color = '#009944';
          if      (line.includes('ERR:')    || line.includes('FETCH✗')) color = '#ff5555';
          else if (line.includes('WARN:'))                               color = '#ffaa00';
          else if (line.includes('FETCH✓'))                             color = '#55ff55';
          else if (line.includes('FETCH▶'))                             color = '#8888ff';
          else if (line.includes('SW:'))                                 color = '#ffff44';
          else if (line.includes('STATE:'))                              color = '#ff88ff';
          else if (line.includes('ROUTE:') || line.includes('REDIRECT')) color = '#44ffff';
          else if (line.includes('NET:')   || line.includes('VIS:'))    color = '#ffcc44';
          else if (line.includes('LOG:'))                                color = '#77bb77';
          return (
            <div key={i} style={{
              color, fontSize: 10,
              padding: '1px 0',
              borderBottom: '1px solid #111',
              wordBreak: 'break-all',
              lineHeight: 1.4,
            }}>
              {line}
            </div>
          );
        })}
        <div ref={logEndRef} />
      </div>

    </div>
  );
}
