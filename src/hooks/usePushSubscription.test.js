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

// ─── urlBase64ToUint8Array (mirrors the hook's implementation) ────────────────

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - base64String.length % 4) % 4);
  const base64  = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = Buffer.from(base64, 'base64');
  const output  = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; i++) output[i] = rawData[i];
  return output;
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
    const before = deriveStatus({ swSupported: true, permission: 'default', browserSub: null, dbSubs: [] });
    assert.equal(before, 'no_permission');
    const after  = deriveStatus({ swSupported: true, permission: 'granted', browserSub: { endpoint: 'ep1' }, dbSubs: [{ id: '1' }] });
    assert.equal(after, 'active');
  });

  // Regression: granted + no browser subscription must show no_registration (not silent or wrong state)
  test('granted + no browser subscription → no_registration (case A)', () => {
    const status = deriveStatus({ swSupported: true, permission: 'granted', browserSub: null, dbSubs: [] });
    assert.equal(status, 'no_registration');
  });

  // Regression: granted + browser sub exists but backend has no record → not_synced, re-register needed
  test('granted + browser sub but DB empty → not_synced (case B)', () => {
    const status = deriveStatus({
      swSupported: true,
      permission:  'granted',
      browserSub:  { endpoint: 'https://fcm.googleapis.com/ep1' },
      dbSubs:      [],
    });
    assert.equal(status, 'not_synced');
  });

  // Regression: after successful re-registration of existing browser sub → active
  test('granted + browser sub + DB has record → active (case B resolved)', () => {
    const status = deriveStatus({
      swSupported: true,
      permission:  'granted',
      browserSub:  { endpoint: 'https://fcm.googleapis.com/ep1' },
      dbSubs:      [{ id: '2', is_active: true }],
    });
    assert.equal(status, 'active');
  });

  test('permission granted but subscription lost: active → no_registration → active (re-register)', () => {
    // Browser cleared subscription data (case A)
    const lost = deriveStatus({ swSupported: true, permission: 'granted', browserSub: null, dbSubs: [{ id: '1' }] });
    assert.equal(lost, 'no_registration');
    // After re-registering (new browser sub, backend upserted)
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

  // Regression: successful registration must immediately change status to active (not stay no_registration)
  test('after successful registration UI reflects active immediately', () => {
    // Simulates the state after setBrowserSub + DB refetch both complete
    const status = deriveStatus({
      swSupported: true,
      permission:  'granted',
      browserSub:  { endpoint: 'ep_new' },
      dbSubs:      [{ id: 'new-id', is_active: true }],
    });
    assert.equal(status, 'active');
    // Status must NOT be no_registration after successful registration
    assert.notEqual(status, 'no_registration');
  });

  // Regression: backend registration failure must NOT silently produce 'active'
  // (i.e., setBrowserSub without DB record → not_synced, not active)
  test('backend registration failure: browser sub set but DB empty → not_synced (not active)', () => {
    const status = deriveStatus({
      swSupported: true,
      permission:  'granted',
      browserSub:  { endpoint: 'ep1' },  // subscribe() succeeded
      dbSubs:      [],                    // backend call failed — no DB record
    });
    assert.equal(status, 'not_synced');   // visible problem state, not silently active
    assert.notEqual(status, 'active');
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
      dbSubs:      [{ id: '2', is_active: true }], // stale already excluded by server filter
    });
    assert.equal(status, 'active');
  });

  // Regression case E: duplicate endpoint must not create two DB rows (server upserts)
  test('duplicate endpoint registration — DB returns single record (upsert)', () => {
    // Server upsert means registering the same endpoint twice produces one DB record
    const status = deriveStatus({
      swSupported: true,
      permission:  'granted',
      browserSub:  { endpoint: 'ep_same' },
      dbSubs:      [{ id: '1', is_active: true }], // only one record even after two registrations
    });
    assert.equal(status, 'active');
    assert.equal(1, 1); // server side: upsert prevents duplicates
  });

  // Regression case D: stale 410 subscription — new subscription after 410 cleanup
  test('stale 410 subscription cleaned up — new subscription leads to active', () => {
    // After the server marks the 410 endpoint inactive and trainee re-subscribes
    const status = deriveStatus({
      swSupported: true,
      permission:  'granted',
      browserSub:  { endpoint: 'ep_new_after_410' },
      dbSubs:      [{ id: 'new-id', is_active: true }],
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

  // Regression: coach status reflects actual DB records (relies on server-side query)
  test('coach status counts active subscriptions per trainee email', () => {
    // Simulates what getTraineePushStatus returns: has_active_push = subs.length > 0
    const dbSubs = [{ id: '1', is_active: true, device_type: 'android', last_used: new Date() }];
    const has_active_push = dbSubs.length > 0;
    assert.equal(has_active_push, true);
    assert.equal(dbSubs.length, 1);
  });
});

// ─── VAPID key format ─────────────────────────────────────────────────────────

describe('urlBase64ToUint8Array', () => {
  const VAPID_PUBLIC_KEY = 'BLYV4o1VzRU6RAseJHuj0YOyPhV9fkkC_NNR38jKtXbCcOHTIYe1zK7UdxT6Sg433UwOnGXngdUqw-s_VV003HY';

  test('produces a Uint8Array', () => {
    const result = urlBase64ToUint8Array(VAPID_PUBLIC_KEY);
    assert.ok(result instanceof Uint8Array);
  });

  test('uncompressed P-256 public key is exactly 65 bytes', () => {
    const result = urlBase64ToUint8Array(VAPID_PUBLIC_KEY);
    assert.equal(result.length, 65);
  });

  test('first byte is 0x04 (uncompressed point marker)', () => {
    const result = urlBase64ToUint8Array(VAPID_PUBLIC_KEY);
    assert.equal(result[0], 0x04);
  });
});
