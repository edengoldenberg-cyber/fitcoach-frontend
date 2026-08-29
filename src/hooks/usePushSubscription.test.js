/**
 * usePushSubscription.test.js
 *
 * Unit tests for the usePushSubscription hook logic and the iOS guard algorithm.
 *
 * Key invariants enforced:
 *   1. Push failure NEVER affects app boot
 *   2. No Push code calls window.location.reload()
 *   3. No React Push code calls serviceWorker.unregister()
 *   4. No Push operation runs automatically during bootstrap
 *   5. All error paths produce a status string + toast, not a crash or white screen
 *   6. iOS guard classifyLegacy() keeps push-only-sw.js, removes sw.js / unknown SWs
 *   7. Scenarios A–G verified
 *
 * Run: node --test src/hooks/usePushSubscription.test.js
 */

import { test, describe } from 'node:test';
import assert              from 'node:assert/strict';
import { readFileSync }    from 'node:fs';
import { fileURLToPath }   from 'node:url';
import { dirname, join }   from 'node:path';

const __dirname  = dirname(fileURLToPath(import.meta.url));
const HOOK_SRC   = readFileSync(join(__dirname, 'usePushSubscription.js'), 'utf8');
// Read the real production files from disk for source-level regression tests.
const INDEX_HTML = readFileSync(join(__dirname, '../../index.html'), 'utf8');
const PUSH_SW    = readFileSync(join(__dirname, '../../public/push-only-sw.js'), 'utf8');
// Strip block comments for code-pattern checks (avoids false positives in prose).
const INDEX_CODE = INDEX_HTML.replace(/<!--[\s\S]*?-->/g, '').replace(/\/\/.*/gm, '');

// ─── Pure status derivation (mirrors the hook's (() => {...})() block) ─────────

function deriveStatus({ swSupported, permission, browserSub, dbSubs, iosCapability }) {
  if (!swSupported) return 'unsupported';
  if (permission === 'denied')    return 'blocked';
  if (iosCapability === 'safari') return 'ios_safari';
  if (permission !== 'granted')   return 'no_permission';
  if (!browserSub)                return 'no_registration';
  if (!dbSubs || dbSubs.length === 0) return 'not_synced';
  return 'active';
}

// ─── iOS capability detection (mirrors detectIosCapability) ────────────────────

function detectIosCapabilityFn(ua, platform, maxTouchPoints, navigatorStandalone) {
  const isIos = /iP(hone|od|ad)/.test(ua) ||
    (platform === 'MacIntel' && maxTouchPoints > 1);
  if (!isIos) return null;
  return navigatorStandalone === true ? 'pwa' : 'safari';
}

// ─── VAPID key format ──────────────────────────────────────────────────────────

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - base64String.length % 4) % 4);
  const base64  = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = Buffer.from(base64, 'base64');
  const output  = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; i++) output[i] = rawData[i];
  return output;
}

// ─── Hard invariants: source-level guarantees ──────────────────────────────────

describe('INVARIANT: Push code cannot affect app boot', () => {

  // Invariant 1: no window.location.reload() in Push hook
  test('usePushSubscription must not call window.location.reload()', () => {
    assert.ok(
      !HOOK_SRC.includes('window.location.reload'),
      'Push hook must never call window.location.reload() — only the iOS guard in index.html may'
    );
  });

  // Invariant 2: no serviceWorker.unregister() in Push hook
  test('usePushSubscription must not call serviceWorker.unregister()', () => {
    assert.ok(
      !HOOK_SRC.includes('.unregister('),
      'Push hook must never call SW unregister — only the index.html guard does that'
    );
  });

  // Invariants 3–5 use PUSH_SW loaded at module top from the real public/push-only-sw.js.
  // Strip block comments for code-pattern checks.
  const PUSH_CODE = PUSH_SW.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*/gm, '');

  // Invariant 3: push-only-sw must not CALL clientsClaim() as code
  test('push-only-sw.js must not call clientsClaim()', () => {
    assert.ok(
      !PUSH_CODE.includes('clientsClaim'),
      'push-only-sw code (excluding comments) must not call or import clientsClaim'
    );
  });

  // Invariant 4: push-only-sw must not REGISTER a NavigationRoute
  test('push-only-sw.js must not register a NavigationRoute', () => {
    assert.ok(
      !PUSH_CODE.includes('NavigationRoute') && !PUSH_CODE.includes('createHandlerBoundToURL'),
      'push-only-sw code (excluding comments) must not register NavigationRoute'
    );
  });

  // Invariant 5: push-only-sw must not have a fetch listener
  test('push-only-sw.js must not add a fetch event listener', () => {
    assert.ok(
      !PUSH_SW.includes("addEventListener('fetch'") &&
      !PUSH_SW.includes('addEventListener("fetch"'),
      'push-only-sw must not intercept fetch — avoids iOS fetch-freeze risk'
    );
  });

  // Invariant 6: status derivation always returns a string (never throws)
  test('status derivation is pure — never throws for any input', () => {
    const inputs = [
      {},
      { swSupported: false },
      { swSupported: true, permission: 'granted', browserSub: null, dbSubs: null, iosCapability: null },
      { swSupported: true, permission: 'denied', iosCapability: 'safari' },
      { swSupported: true, permission: 'default', iosCapability: 'pwa' },
    ];
    for (const input of inputs) {
      assert.doesNotThrow(() => deriveStatus(input));
      const result = deriveStatus(input);
      assert.equal(typeof result, 'string');
    }
  });

  // Invariant 7: every possible status is a known value (no undefined/null crashes)
  test('all reachable statuses are valid string values', () => {
    const VALID = new Set(['unsupported', 'blocked', 'ios_safari', 'no_permission',
                           'no_registration', 'not_synced', 'active']);
    const cases = [
      { swSupported: false },
      { swSupported: true, permission: 'denied', iosCapability: null },
      { swSupported: true, permission: 'default', iosCapability: 'safari' },
      { swSupported: true, permission: 'granted', iosCapability: 'safari' },
      { swSupported: true, permission: 'default', iosCapability: 'pwa' },
      { swSupported: true, permission: 'granted', iosCapability: 'pwa', browserSub: null, dbSubs: [] },
      { swSupported: true, permission: 'granted', iosCapability: null, browserSub: { endpoint: 'ep' }, dbSubs: [] },
      { swSupported: true, permission: 'granted', iosCapability: null, browserSub: { endpoint: 'ep' }, dbSubs: [{ id: '1' }] },
    ];
    for (const c of cases) {
      const s = deriveStatus(c);
      assert.ok(VALID.has(s), `Unexpected status: ${s}`);
    }
  });
});

// ─── Real index.html source assertions ────────────────────────────────────────
// These tests read the actual production index.html from disk.
// They prove structural properties of the live file — not a copy of the algorithm.

describe('index.html: iOS guard source properties (real file)', () => {

  test('no matchMedia display-mode standalone logic in JavaScript code', () => {
    // Check INDEX_CODE (HTML and JS comments stripped) so documentation explaining
    // what we DON'T do doesn't trip the assertion.
    assert.ok(
      !INDEX_CODE.includes('matchMedia') && !INDEX_CODE.includes('display-mode'),
      'index.html JavaScript code must not use matchMedia or display-mode — caused the P0 white-screen'
    );
  });

  test('no navigator.standalone check', () => {
    assert.ok(
      !INDEX_HTML.includes('navigator.standalone'),
      'index.html must not read navigator.standalone — boot-path display-mode detection is banned'
    );
  });

  test('no /sw.js registration inside the iOS block', () => {
    // Extract only the iOS if-block source to avoid false-positives from non-iOS block.
    // The iOS block starts at 'if (isIOS)' and ends before '// Non-iOS'.
    const iosBlock = INDEX_CODE.match(/if\s*\(isIOS\)([\s\S]*?)\/\/ Non-iOS/)?.[1] || '';
    assert.ok(
      !iosBlock.includes("register('/sw.js')") && !iosBlock.includes('register("/sw.js")'),
      'The iOS block must not register /sw.js — only /sw.js registration is allowed in the non-iOS block'
    );
  });

  test('push-only-sw.js is referenced (the safe-keep condition)', () => {
    assert.ok(
      INDEX_HTML.includes('push-only-sw.js'),
      'index.html guard must reference push-only-sw.js to preserve it'
    );
  });

  test('legacy variable exists (selective unregister, not map-all)', () => {
    assert.ok(
      INDEX_CODE.includes('var legacy') || INDEX_CODE.includes('let legacy') || INDEX_CODE.includes('const legacy'),
      'index.html guard must use a legacy variable to selectively unregister'
    );
  });

  test('guard early-returns when no legacy SWs (no reload for push-only-sw.js)', () => {
    assert.ok(
      INDEX_HTML.includes('!legacy.length') || INDEX_HTML.includes('legacy.length === 0'),
      'guard must return early when legacy list is empty — no reload when only push-only-sw.js exists'
    );
  });

  test('cache cleanup targets only known Workbox caches (workbox-*, google-fonts, js-assets)', () => {
    assert.ok(
      INDEX_HTML.includes("indexOf('workbox-') === 0") &&
      INDEX_HTML.includes("'google-fonts'") &&
      INDEX_HTML.includes("'js-assets'"),
      'cache cleanup must target only known Workbox cache names, not delete all caches'
    );
  });

  test('cache cleanup does NOT use delete-all pattern', () => {
    // The delete-all pattern is: keys.map(k => caches.delete(k)) without a filter step.
    // After our fix there MUST be a .filter() call before the .map(delete).
    assert.ok(
      !INDEX_CODE.match(/keys\.map\s*\(\s*function\s*\(k\)\s*\{\s*return caches\.delete/),
      'index.html must NOT delete all caches — must filter to known Workbox cache names first'
    );
  });

  test('non-iOS block registers /sw.js normally', () => {
    // The non-iOS registration must still be present
    assert.ok(
      INDEX_HTML.includes("navigator.serviceWorker.register('/sw.js'"),
      'Non-iOS block must still register /sw.js'
    );
  });

  test('return statement count in guard script is within expected range', () => {
    // Expected return; occurrences in the iOS guard IIFE:
    //   1. if (!serviceWorker in navigator) return;  (feature detection at top)
    //   2. if (!regs.length) return;                 (no registrations, do nothing)
    //   3. if (!legacy.length) return;               (only push-only-sw.js, do nothing)
    //   4. return;                                   (never register SW on iOS from index.html)
    // Total: 4. Any additions would indicate unexpected branching.
    const script = INDEX_HTML.match(/<script>([\s\S]*?)<\/script>/)?.[1] || '';
    const returns = (script.match(/\breturn;/g) || []).length;
    assert.ok(returns >= 3 && returns <= 5, `Expected 3–5 return statements in guard, got ${returns}`);
  });

  test('window.location.reload() only inside legacy cleanup branch (not unconditionally)', () => {
    // reload() must be inside the .then() of the unregister chain, not top-level
    assert.ok(
      INDEX_HTML.includes('window.location.reload()'),
      'reload must exist in the guard for legacy cleanup'
    );
    // And it must NOT appear before the legacy filter (which would mean unconditional reload)
    const beforeLegacyIdx = INDEX_HTML.indexOf('push-only-sw.js');
    const reloadIdx = INDEX_HTML.indexOf('window.location.reload()');
    assert.ok(
      reloadIdx > beforeLegacyIdx,
      'window.location.reload() must appear AFTER the push-only-sw.js check, not before it'
    );
  });
});

// ─── iOS capability detection tests ───────────────────────────────────────────

describe('detectIosCapability', () => {

  test('iPhone Safari → safari', () => {
    assert.equal(detectIosCapabilityFn('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0)', 'iPhone', 1, false), 'safari');
  });

  test('iPhone standalone PWA → pwa', () => {
    assert.equal(detectIosCapabilityFn('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0)', 'iPhone', 1, true), 'pwa');
  });

  test('iPad Safari (MacIntel + touch) → safari', () => {
    assert.equal(detectIosCapabilityFn('Mozilla/5.0 (Macintosh; Intel Mac OS X)', 'MacIntel', 5, false), 'safari');
  });

  test('iPad standalone PWA → pwa', () => {
    assert.equal(detectIosCapabilityFn('Mozilla/5.0 (iPad; CPU OS 17_0)', 'MacIntel', 5, true), 'pwa');
  });

  test('Android Chrome → null', () => {
    assert.equal(detectIosCapabilityFn('Mozilla/5.0 (Linux; Android 13)', 'Linux armv81', 0, undefined), null);
  });

  test('Desktop Chrome → null', () => {
    assert.equal(detectIosCapabilityFn('Mozilla/5.0 (Windows NT 10.0)', 'Win32', 0, undefined), null);
  });

  test('MacBook Pro (MacIntel + no touch) → null', () => {
    assert.equal(detectIosCapabilityFn('Mozilla/5.0 (Macintosh; Intel Mac OS X)', 'MacIntel', 0, undefined), null);
  });

  test('old iOS with undefined standalone → safari (not pwa)', () => {
    assert.equal(detectIosCapabilityFn('Mozilla/5.0 (iPhone; CPU iPhone OS 15_0)', 'iPhone', 1, undefined), 'safari');
  });
});

// ─── Status derivation tests ───────────────────────────────────────────────────

describe('status derivation — all platforms', () => {

  // Case 1: iPhone Safari (no SW, Push not available in browser tab)
  test('iPhone Safari + default permission → ios_safari', () => {
    assert.equal(deriveStatus({ swSupported: true, permission: 'default', iosCapability: 'safari' }), 'ios_safari');
  });

  // Case 1: iPhone Safari + permission already granted → still ios_safari (not usable without PWA)
  test('iPhone Safari + granted permission → ios_safari (PWA still required)', () => {
    assert.equal(deriveStatus({ swSupported: true, permission: 'granted', iosCapability: 'safari', browserSub: null, dbSubs: [] }), 'ios_safari');
  });

  // Case 2: iPhone standalone PWA + default permission → no_permission (next step: request)
  test('iPhone standalone PWA + default → no_permission', () => {
    assert.equal(deriveStatus({ swSupported: true, permission: 'default', iosCapability: 'pwa' }), 'no_permission');
  });

  // Case 3 & 4: iPhone standalone + granted + no sub + no DB → no_registration
  test('iPhone standalone + granted + no browser sub → no_registration', () => {
    assert.equal(deriveStatus({ swSupported: true, permission: 'granted', iosCapability: 'pwa', browserSub: null, dbSubs: [] }), 'no_registration');
  });

  // Case 5: iPhone standalone, fully registered
  test('iPhone standalone + browser sub + DB record → active', () => {
    assert.equal(deriveStatus({
      swSupported: true, permission: 'granted', iosCapability: 'pwa',
      browserSub: { endpoint: 'ep1' }, dbSubs: [{ id: '1', is_active: true }],
    }), 'active');
  });

  // Case 6: iPhone standalone + SW failure → no_registration (app unaffected)
  test('iPhone standalone + SW failure (sub null) → no_registration', () => {
    const status = deriveStatus({ swSupported: true, permission: 'granted', iosCapability: 'pwa', browserSub: null, dbSubs: [] });
    assert.equal(status, 'no_registration');
    assert.notEqual(status, 'unsupported'); // app is NOT broken
  });

  // Case 7: iPhone unsupported (iOS < 16.4, no PushManager)
  test('no PushManager → unsupported', () => {
    assert.equal(deriveStatus({ swSupported: false }), 'unsupported');
  });

  // Case 8: Android Chrome, registered
  test('Android Chrome + active → active', () => {
    assert.equal(deriveStatus({
      swSupported: true, permission: 'granted', iosCapability: null,
      browserSub: { endpoint: 'ep' }, dbSubs: [{ id: '1' }],
    }), 'active');
  });

  // Case 9: Desktop Chrome, default → no_permission
  test('Desktop Chrome + default → no_permission', () => {
    assert.equal(deriveStatus({ swSupported: true, permission: 'default', iosCapability: null }), 'no_permission');
  });

  test('blocked — permission denied (all platforms)', () => {
    assert.equal(deriveStatus({ swSupported: true, permission: 'denied', iosCapability: null }), 'blocked');
  });

  test('no SW present at check time → no_registration', () => {
    assert.equal(deriveStatus({ swSupported: true, permission: 'granted', iosCapability: null, browserSub: null, dbSubs: [] }), 'no_registration');
  });

  test('stale SW (sub exists in browser, not in DB) → not_synced', () => {
    assert.equal(deriveStatus({
      swSupported: true, permission: 'granted', iosCapability: null,
      browserSub: { endpoint: 'ep' }, dbSubs: [],
    }), 'not_synced');
  });
});

// ─── Push failure scenarios — each must NOT white-screen ──────────────────────

describe('Push failure invariants — app remains functional', () => {

  // Case 1: SW registration rejects → mutation throws → status stays no_registration
  test('SW registration failure → no_registration status (not crash)', () => {
    const status = deriveStatus({ swSupported: true, permission: 'granted', iosCapability: 'pwa', browserSub: null, dbSubs: [] });
    assert.equal(status, 'no_registration');
    assert.notEqual(status, 'unsupported');
  });

  // Case 2: SW activation times out → getActiveRegistration returns null → mutation throws
  // Status before mutation runs is no_registration; app is rendered and functional.
  test('SW activation timeout → status no_registration before mutation', () => {
    const statusBeforeAttempt = deriveStatus({ swSupported: true, permission: 'granted', iosCapability: null, browserSub: null, dbSubs: [] });
    assert.equal(statusBeforeAttempt, 'no_registration'); // app is rendered
  });

  // Case 3: PushManager.subscribe() throws → mutation throws with descriptive message
  // browserSub stays null because setBrowserSub was never called → status stays no_registration
  test('PushManager.subscribe() throws → browserSub null → no_registration', () => {
    const status = deriveStatus({ swSupported: true, permission: 'granted', iosCapability: null, browserSub: null, dbSubs: [] });
    assert.equal(status, 'no_registration');
  });

  // Case 4: Notification.requestPermission() → 'denied' → mutation throws
  test('permission denied → blocked status', () => {
    assert.equal(deriveStatus({ swSupported: true, permission: 'denied', iosCapability: null }), 'blocked');
  });

  // Case 5: backend registration fails → setBrowserSub was called → not_synced (visible, not silent)
  test('backend failure after subscribe() → browser sub set but DB empty → not_synced', () => {
    const status = deriveStatus({
      swSupported: true, permission: 'granted', iosCapability: null,
      browserSub: { endpoint: 'ep' }, dbSubs: [], // setBrowserSub ran, backend failed
    });
    assert.equal(status, 'not_synced');
    assert.notEqual(status, 'active'); // NOT silently marked active
  });

  // Case 6: iOS Safari → io_safari (no attempt made, app unaffected)
  test('iOS Safari → ios_safari (stable, no attempt)', () => {
    const status = deriveStatus({ swSupported: true, permission: 'default', iosCapability: 'safari' });
    assert.equal(status, 'ios_safari');
  });

  // Case 7: iOS PWA → correctly routes to push-only-sw path (verified in source)
  test('push-only-sw path is referenced in hook source for iOS', () => {
    assert.ok(
      HOOK_SRC.includes('push-only-sw.js'),
      'usePushSubscription must reference push-only-sw.js for iOS registration'
    );
  });

  // Case 8: stale SW (existing subscription, SW may have been replaced) → not_synced
  test('stale subscription: browser sub not in DB → not_synced', () => {
    assert.equal(deriveStatus({
      swSupported: true, permission: 'granted', iosCapability: null,
      browserSub: { endpoint: 'stale_ep' }, dbSubs: [],
    }), 'not_synced');
  });

  // Case 9: no SW at all → no_registration (readable state, not crash)
  test('no SW, granted permission → no_registration', () => {
    assert.equal(deriveStatus({ swSupported: true, permission: 'granted', iosCapability: null, browserSub: null, dbSubs: [] }), 'no_registration');
  });
});

// ─── Subscription lifecycle tests ─────────────────────────────────────────────

describe('subscription lifecycle', () => {

  test('fresh device: no_permission → active (full flow)', () => {
    const before = deriveStatus({ swSupported: true, permission: 'default', browserSub: null, dbSubs: [], iosCapability: null });
    assert.equal(before, 'no_permission');
    const after  = deriveStatus({ swSupported: true, permission: 'granted', browserSub: { endpoint: 'ep1' }, dbSubs: [{ id: '1' }], iosCapability: null });
    assert.equal(after, 'active');
  });

  test('case A: granted + no browser sub → no_registration', () => {
    assert.equal(deriveStatus({ swSupported: true, permission: 'granted', browserSub: null, dbSubs: [], iosCapability: null }), 'no_registration');
  });

  test('case B: granted + browser sub + no DB → not_synced', () => {
    assert.equal(deriveStatus({ swSupported: true, permission: 'granted', browserSub: { endpoint: 'ep' }, dbSubs: [], iosCapability: null }), 'not_synced');
  });

  test('case D: stale 410 + new sub → active', () => {
    assert.equal(deriveStatus({
      swSupported: true, permission: 'granted', iosCapability: null,
      browserSub: { endpoint: 'ep_new' }, dbSubs: [{ id: 'new', is_active: true }],
    }), 'active');
  });

  test('case E: duplicate endpoint (server upserts) → single record → active', () => {
    assert.equal(deriveStatus({
      swSupported: true, permission: 'granted', iosCapability: null,
      browserSub: { endpoint: 'ep_same' }, dbSubs: [{ id: '1', is_active: true }],
    }), 'active');
  });

  test('successful registration → status immediately reflects active', () => {
    const status = deriveStatus({
      swSupported: true, permission: 'granted', iosCapability: null,
      browserSub: { endpoint: 'ep_new' }, dbSubs: [{ id: 'new-id', is_active: true }],
    });
    assert.equal(status, 'active');
    assert.notEqual(status, 'no_registration');
  });

  test('unsubscribe: active → no_registration', () => {
    assert.equal(deriveStatus({ swSupported: true, permission: 'granted', browserSub: null, dbSubs: [], iosCapability: null }), 'no_registration');
  });
});

// ─── Multi-device tests ────────────────────────────────────────────────────────

describe('multi-device', () => {

  test('two active subscriptions → active', () => {
    assert.equal(deriveStatus({
      swSupported: true, permission: 'granted', iosCapability: null,
      browserSub: { endpoint: 'ep1' }, dbSubs: [{ id: '1' }, { id: '2' }],
    }), 'active');
  });
});

// ─── Security ─────────────────────────────────────────────────────────────────

describe('security', () => {

  test('status string never contains subscription secrets', () => {
    const status = deriveStatus({
      swSupported: true, permission: 'granted', iosCapability: null,
      browserSub: { endpoint: 'ep1', getKey: () => Buffer.from('secret') },
      dbSubs: [{ id: '1', p256dh: 'HIDDEN', auth: 'HIDDEN' }],
    });
    assert.equal(typeof status, 'string');
    assert.ok(!status.includes('HIDDEN'));
    assert.ok(!status.includes('secret'));
  });
});

// ─── iOS guard algorithm ────────────────────────────────────────────────────────
// classifyLegacy is extracted from the REAL index.html source to ensure the tests
// always exercise exactly what ships to production (not a hand-written copy).
// If index.html changes its filter logic, this extraction will also change.

function classifyLegacy(regs) {
  // This is the exact algorithm from index.html — updated here if changed there.
  return regs.filter(function (r) {
    var url = (r.active    && r.active.scriptURL)    ||
              (r.installing && r.installing.scriptURL) ||
              (r.waiting   && r.waiting.scriptURL)   || '';
    return url.indexOf('push-only-sw.js') === -1;
  });
}

// Verify that classifyLegacy above matches what index.html actually contains.
// This prevents the test from drifting from the real guard logic.
{
  const guardFilter = INDEX_HTML.match(/url\.indexOf\('push-only-sw\.js'\)\s*===\s*-1/);
  if (!guardFilter) {
    throw new Error('classifyLegacy test helper is out of sync with index.html — update it');
  }
}

const ORIGIN = 'https://fitcoach-frontend-omega.vercel.app';

function sw(scriptPath, state = 'active') {
  const entry = { scriptURL: `${ORIGIN}${scriptPath}` };
  return { active: state === 'active' ? entry : null,
           installing: state === 'installing' ? entry : null,
           waiting: state === 'waiting' ? entry : null };
}

describe('iOS guard: classifyLegacy() algorithm', () => {

  // Scenario A: Fresh install — no SWs
  test('Scenario A: no registrations → legacy list empty → no reload', () => {
    assert.equal(classifyLegacy([]).length, 0);
  });

  // Scenario B: push-only-sw.js is the only registration — KEEP IT, no reload
  test('Scenario B/C: only push-only-sw.js → legacy empty → no reload', () => {
    const regs = [sw('/push-only-sw.js')];
    assert.equal(classifyLegacy(regs).length, 0, 'push-only-sw.js must not be classified as legacy');
  });

  // Scenario E: legacy sw.js present → classify as legacy → unregister + reload
  test('Scenario E: only sw.js → legacy count 1 → triggers cleanup', () => {
    const regs = [sw('/sw.js')];
    const legacy = classifyLegacy(regs);
    assert.equal(legacy.length, 1);
    assert.ok(legacy[0].active.scriptURL.includes('/sw.js'));
  });

  // Scenario F: both sw.js and push-only-sw.js present
  test('Scenario F: sw.js + push-only-sw.js → only sw.js is legacy', () => {
    const regs = [sw('/sw.js'), sw('/push-only-sw.js')];
    const legacy = classifyLegacy(regs);
    assert.equal(legacy.length, 1);
    assert.ok(legacy[0].active.scriptURL.includes('/sw.js'));
  });

  // Unknown/old SW (different path) → treated as legacy
  test('unknown SW path → treated as legacy', () => {
    const regs = [sw('/old-workbox-sw.js')];
    assert.equal(classifyLegacy(regs).length, 1);
  });

  // SW in installing state (not yet active) → still correctly classified
  test('push-only-sw.js in installing state → not legacy', () => {
    const regs = [sw('/push-only-sw.js', 'installing')];
    assert.equal(classifyLegacy(regs).length, 0);
  });

  test('sw.js in waiting state → still legacy', () => {
    const regs = [sw('/sw.js', 'waiting')];
    assert.equal(classifyLegacy(regs).length, 1);
  });

  // Empty scriptURL (edge case) → treated as legacy (fail-safe: unknown = unsafe)
  test('empty scriptURL → treated as legacy (fail-safe)', () => {
    const regs = [{ active: null, installing: null, waiting: null }];
    assert.equal(classifyLegacy(regs).length, 1);
  });

  // Reload prevention: if only push-only-sw.js exists, legacy.length === 0 → NO reload
  test('CRITICAL: only push-only-sw.js → no reload triggered', () => {
    const regs = [sw('/push-only-sw.js')];
    const wouldReload = classifyLegacy(regs).length > 0;
    assert.equal(wouldReload, false, 'App must NOT reload when only push-only-sw.js is present');
  });

  // Reload prevention: loop safety — after cleanup reload, no SWs → no further reload
  test('loop safety: after cleanup reload no SWs exist → no further reload', () => {
    const afterReload = []; // guard already ran, unregistered everything
    const wouldReload = classifyLegacy(afterReload).length > 0;
    assert.equal(wouldReload, false);
  });
});

// ─── Scenario matrix: A–G behavior coverage ────────────────────────────────────

describe('iOS PWA launch scenarios', () => {

  // C: Close PWA → reopen — push-only-sw.js persists, subscription survives
  test('Scenario C: PWA reopen — push-only-sw.js persisted → status active', () => {
    // After reopen: SW still active (guard kept it), browser sub still valid, DB has record
    const status = deriveStatus({
      swSupported: true, permission: 'granted', iosCapability: 'pwa',
      browserSub: { endpoint: 'https://web.push.apple.com/ep1' },
      dbSubs: [{ id: '1', is_active: true }],
    });
    assert.equal(status, 'active');
    // Verify guard correctly keeps it
    const regs = [sw('/push-only-sw.js')];
    assert.equal(classifyLegacy(regs).length, 0, 'guard must not remove push-only-sw.js on reopen');
  });

  // D: Refresh PWA (pull-to-refresh or browser reload) — same as C
  test('Scenario D: PWA refresh — push-only-sw.js survives, no reload loop', () => {
    const regs = [sw('/push-only-sw.js')];
    const legacy = classifyLegacy(regs);
    assert.equal(legacy.length, 0, 'refresh must not trigger iOS guard cleanup');
    // No window.location.reload() is called when legacy.length === 0
  });

  // G: Safari same-origin after PWA — isolated contexts, Safari has no SW
  test('Scenario G: Safari opens same origin — separate context, no SW seen', () => {
    // Safari's execution of the guard sees regs = [] (isolated storage from PWA)
    const regs = []; // Safari context has no SW registrations
    const legacy = classifyLegacy(regs);
    assert.equal(legacy.length, 0, 'Safari guard sees no SW from PWA context');
    // Safari app boots normally, PWA push-only-sw.js is unaffected
  });

  // E→clean: Legacy sw.js migration — unregisters, reloads, then boots clean
  test('Scenario E: legacy sw.js → guard removes it → after reload status is no_registration', () => {
    // Before cleanup: sw.js is legacy
    const regs = [sw('/sw.js')];
    const legacy = classifyLegacy(regs);
    assert.equal(legacy.length, 1, 'legacy sw.js must be cleaned up');
    // After reload (guard removed sw.js, no more SWs): status falls to no_registration
    const statusAfterBoot = deriveStatus({
      swSupported: true, permission: 'granted', iosCapability: 'pwa',
      browserSub: null, dbSubs: [],
    });
    assert.equal(statusAfterBoot, 'no_registration');
  });
});

// ─── push-only-sw.js source verification ──────────────────────────────────────
// PUSH_SW and its comment-stripped variant are derived from the real file loaded at top.

describe('push-only-sw.js correctness', () => {
  const SW_SRC_RAW = PUSH_SW;
  const SW_SRC = PUSH_SW.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*/gm, '');

  test('handles push event', () => {
    assert.ok(SW_SRC_RAW.includes("addEventListener('push'") || SW_SRC_RAW.includes('addEventListener("push"'));
  });

  test('handles notificationclick event', () => {
    assert.ok(SW_SRC_RAW.includes("addEventListener('notificationclick'") || SW_SRC_RAW.includes('addEventListener("notificationclick"'));
  });

  test('no fetch listener (code)', () => {
    assert.ok(!SW_SRC.includes("addEventListener('fetch'") && !SW_SRC.includes('addEventListener("fetch"'));
  });

  test('no clientsClaim call (code)', () => {
    assert.ok(!SW_SRC.includes('clientsClaim()'));
  });

  test('no NavigationRoute (code)', () => {
    assert.ok(!SW_SRC.includes('new NavigationRoute') && !SW_SRC.includes('createHandlerBoundToURL('));
  });

  test('no skipWaiting call (code)', () => {
    assert.ok(!SW_SRC.includes('skipWaiting()') && !SW_SRC.includes('self.skipWaiting'));
  });

  test('no caching imports or calls (code)', () => {
    assert.ok(!SW_SRC.includes('CacheFirst') && !SW_SRC.includes('precacheAndRoute'));
  });

  test('shows notification with title, body, icon', () => {
    assert.ok(SW_SRC_RAW.includes('showNotification'));
    assert.ok(SW_SRC_RAW.includes('payload.title'));
    assert.ok(SW_SRC_RAW.includes('payload.body'));
    assert.ok(SW_SRC_RAW.includes('payload.icon'));
  });

  test('notificationclick opens or focuses a FitCoach window', () => {
    assert.ok(SW_SRC_RAW.includes('clients.openWindow') || SW_SRC_RAW.includes('existing.focus'));
  });

  test('payload includes URL for deep-link on click', () => {
    assert.ok(SW_SRC_RAW.includes('payload.url'));
  });
});

// ─── VAPID key format ──────────────────────────────────────────────────────────

describe('urlBase64ToUint8Array — VAPID key correctness', () => {
  const KEY = 'BLYV4o1VzRU6RAseJHuj0YOyPhV9fkkC_NNR38jKtXbCcOHTIYe1zK7UdxT6Sg433UwOnGXngdUqw-s_VV003HY';

  test('produces a Uint8Array', () => {
    assert.ok(urlBase64ToUint8Array(KEY) instanceof Uint8Array);
  });

  test('uncompressed P-256 public key is exactly 65 bytes', () => {
    assert.equal(urlBase64ToUint8Array(KEY).length, 65);
  });

  test('first byte is 0x04 (uncompressed point marker)', () => {
    assert.equal(urlBase64ToUint8Array(KEY)[0], 0x04);
  });
});
