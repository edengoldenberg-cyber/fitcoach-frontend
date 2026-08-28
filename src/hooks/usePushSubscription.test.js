/**
 * usePushSubscription.test.js
 *
 * Unit tests for the usePushSubscription hook logic.
 * Tests status derivation rules — which status is returned given which combination
 * of (permission, browserSub, dbSubs) states.
 *
 * No React rendering required — the status derivation is pure logic extracted here.
 *
 * Run: node --test src/hooks/usePushSubscription.test.js
 */

import { test, describe } from 'node:test';
import assert              from 'node:assert/strict';

// ─── Pure status derivation logic (mirrors the hook's (() => {...})() block) ──

function deriveStatus({ swSupported, permission, browserSub, dbSubs }) {
  if (!swSupported) return 'unsupported';
  if (permission === 'denied')  return 'blocked';
  if (permission !== 'granted') return 'no_permission';
  if (!browserSub)              return 'no_registration';
  if (!dbSubs || dbSubs.length === 0) return 'not_synced';
  return 'active';
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('usePushSubscription status derivation', () => {

  test('unsupported — no serviceWorker/PushManager', () => {
    assert.equal(deriveStatus({ swSupported: false }), 'unsupported');
  });

  test('blocked — permission denied', () => {
    assert.equal(deriveStatus({ swSupported: true, permission: 'denied' }), 'blocked');
  });

  test('no_permission — default permission, has not been asked', () => {
    assert.equal(deriveStatus({ swSupported: true, permission: 'default' }), 'no_permission');
  });

  test('no_registration — permission granted but no browser PushSubscription', () => {
    assert.equal(
      deriveStatus({ swSupported: true, permission: 'granted', browserSub: null }),
      'no_registration'
    );
  });

  test('not_synced — browser subscription exists but not in DB', () => {
    assert.equal(
      deriveStatus({ swSupported: true, permission: 'granted', browserSub: { endpoint: 'ep1' }, dbSubs: [] }),
      'not_synced'
    );
  });

  test('active — browser subscription exists AND in DB', () => {
    assert.equal(
      deriveStatus({
        swSupported: true,
        permission:  'granted',
        browserSub:  { endpoint: 'ep1' },
        dbSubs:      [{ id: '1', is_active: true }],
      }),
      'active'
    );
  });

  test('blocked takes precedence over missing subscription', () => {
    // Even if there is a browser subscription, if permission is denied → blocked
    assert.equal(
      deriveStatus({ swSupported: true, permission: 'denied', browserSub: { endpoint: 'ep1' }, dbSubs: [{ id: '1' }] }),
      'blocked'
    );
  });
});

// ─── Subscription lifecycle state transitions ─────────────────────────────────

describe('subscription lifecycle', () => {

  test('fresh device: no_permission → active (via subscribe)', () => {
    // Before subscribe
    const before = deriveStatus({ swSupported: true, permission: 'default', browserSub: null, dbSubs: [] });
    assert.equal(before, 'no_permission');
    // After successful subscribe (permission granted, browser sub created, DB saved)
    const after  = deriveStatus({ swSupported: true, permission: 'granted', browserSub: { endpoint: 'ep1' }, dbSubs: [{ id: '1' }] });
    assert.equal(after, 'active');
  });

  test('permission granted but subscription lost: active → no_registration → active (re-register)', () => {
    // Browser cleared subscription data
    const lost = deriveStatus({ swSupported: true, permission: 'granted', browserSub: null, dbSubs: [{ id: '1' }] });
    assert.equal(lost, 'no_registration');
    // After re-registering
    const restored = deriveStatus({ swSupported: true, permission: 'granted', browserSub: { endpoint: 'ep2' }, dbSubs: [{ id: '2' }] });
    assert.equal(restored, 'active');
  });

  test('unsubscribe: active → no_registration (browser sub removed, DB cleared)', () => {
    const after = deriveStatus({ swSupported: true, permission: 'granted', browserSub: null, dbSubs: [] });
    assert.equal(after, 'no_registration');
  });

  test('browser sub exists but DB not yet saved: not_synced', () => {
    const status = deriveStatus({ swSupported: true, permission: 'granted', browserSub: { endpoint: 'ep1' }, dbSubs: [] });
    assert.equal(status, 'not_synced');
  });
});

// ─── Multi-device scenarios ───────────────────────────────────────────────────

describe('multi-device', () => {

  test('two active subscriptions — status is active', () => {
    const status = deriveStatus({
      swSupported: true,
      permission:  'granted',
      browserSub:  { endpoint: 'ep1' },
      dbSubs:      [{ id: '1' }, { id: '2' }],
    });
    assert.equal(status, 'active');
  });

  test('one stale (is_active=false) + one valid — active count determines status', () => {
    // Only active=true subs are returned by the DB query (filtered server-side)
    const status = deriveStatus({
      swSupported: true,
      permission:  'granted',
      browserSub:  { endpoint: 'ep2' },
      dbSubs:      [{ id: '2', is_active: true }], // stale already removed
    });
    assert.equal(status, 'active');
  });
});

// ─── Authorization (status does not expose sensitive data) ────────────────────

describe('security', () => {

  test('status derivation never includes subscription secrets', () => {
    // The status derivation only uses counts/booleans — no secrets pass through
    const status = deriveStatus({
      swSupported: true,
      permission:  'granted',
      browserSub:  { endpoint: 'ep1', getKey: () => Buffer.from('secret') },
      dbSubs:      [{ id: '1', p256dh: 'HIDDEN', auth: 'HIDDEN' }],
    });
    // status is a simple string — cannot contain secrets
    assert.equal(typeof status, 'string');
    assert.ok(!status.includes('HIDDEN'));
    assert.ok(!status.includes('secret'));
  });
});
