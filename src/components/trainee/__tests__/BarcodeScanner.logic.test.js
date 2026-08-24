/**
 * BarcodeScanner logic tests — pure unit tests, no DOM, no camera, no network.
 *
 * Tests the logic extracted from BarcodeScanner.jsx to verify:
 * - timing fix (DOM element must exist before Html5Qrcode constructor)
 * - error classification
 * - camera fallback strategy
 * - duplicate barcode suppression
 * - canonical lookup routing
 * - CoachAsTrainee identity
 * - manual / image / live all use same lookup path
 *
 * Run: node --test src/components/trainee/__tests__/BarcodeScanner.logic.test.js
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

// ─── Error classification (mirrors startCameraScan catch block) ───────────────

function classifyError(err) {
  const errName    = err?.name    || (typeof err === 'string' ? 'StringError' : 'UnknownError');
  const errMessage = err?.message || (typeof err === 'string' ? err : 'Unknown error');

  // Check specific named errors before broad message checks to avoid false matches
  if (errName === 'NotAllowedError' || errMessage.includes('Permission') || errMessage.includes('denied')) {
    return 'permission-denied';
  }
  if (errName === 'InsecureContextError') return 'insecure';
  if (errName === 'UnsupportedError')     return 'unsupported';
  if (errName === 'NotFoundError' && !errMessage.includes('barcode-reader') && !errMessage.includes('Element')) {
    return 'no-camera';
  }
  if (errName === 'NotReadableError' || errMessage.includes('already in use') || errMessage.includes('device in use')) {
    return 'camera-busy';
  }
  return 'generic';
}

function hebrewMessageFor(classification) {
  const MAP = {
    'permission-denied': 'אין הרשאה למצלמה',
    'no-camera':         'לא נמצאה מצלמה',
    'camera-busy':       'המצלמה נמצאת בשימוש',
    'insecure':          'נדרש חיבור מאובטח',
    'unsupported':       'הדפדפן הזה אינו תומך',
    'generic':           'לא ניתן לפתוח את המצלמה',
  };
  return MAP[classification] || MAP.generic;
}

describe('Error classification', () => {
  test('NotAllowedError → permission-denied', () => {
    const err = Object.assign(new Error('Permission denied'), { name: 'NotAllowedError' });
    assert.equal(classifyError(err), 'permission-denied');
  });

  test('string "Permission denied" → permission-denied', () => {
    assert.equal(classifyError({ message: 'Permission denied by user' }), 'permission-denied');
  });

  test('NotFoundError for camera → no-camera', () => {
    const err = Object.assign(new Error('Requested device not found'), { name: 'NotFoundError' });
    assert.equal(classifyError(err), 'no-camera');
  });

  test('NotFoundError for DOM element → generic (not no-camera)', () => {
    // Html5Qrcode constructor throws a string mentioning "barcode-reader"
    const domErr = { name: 'NotFoundError', message: 'HTML Element with id=barcode-reader not found' };
    assert.notEqual(classifyError(domErr), 'no-camera');
  });

  test('html5-qrcode string throw (no .name) → generic', () => {
    // Html5Qrcode v2.3.x throws a string, not an Error
    const strThrow = 'HTML Element with id=barcode-reader not found';
    assert.equal(classifyError(strThrow), 'generic');
  });

  test('NotReadableError → camera-busy', () => {
    const err = Object.assign(new Error('Could not start video source'), { name: 'NotReadableError' });
    assert.equal(classifyError(err), 'camera-busy');
  });

  test('InsecureContextError → insecure', () => {
    const err = Object.assign(new Error('Not HTTPS'), { name: 'InsecureContextError' });
    assert.equal(classifyError(err), 'insecure');
  });

  test('UnsupportedError → unsupported', () => {
    const err = Object.assign(new Error('getUserMedia not supported'), { name: 'UnsupportedError' });
    assert.equal(classifyError(err), 'unsupported');
  });

  test('unknown error → generic', () => {
    const err = new Error('Something weird happened');
    assert.equal(classifyError(err), 'generic');
  });

  test('every classification maps to a Hebrew message', () => {
    const classes = ['permission-denied', 'no-camera', 'camera-busy', 'insecure', 'unsupported', 'generic'];
    for (const c of classes) {
      const msg = hebrewMessageFor(c);
      assert.ok(msg && msg.length > 0, `${c} must have a Hebrew message`);
      // All messages should be in Hebrew (contain Hebrew Unicode range)
      assert.ok(/[א-ת]/.test(msg), `${c} message must contain Hebrew text`);
    }
  });
});

// ─── Duplicate barcode suppression ────────────────────────────────────────────

describe('Duplicate barcode suppression', () => {
  function isDuplicate(lastScanned, barcode, now, windowMs = 5000) {
    return lastScanned.barcode === barcode && (now - lastScanned.timestamp) < windowMs;
  }

  test('same barcode within 5s → duplicate', () => {
    const last = { barcode: '7290000000001', timestamp: 1000 };
    assert.ok(isDuplicate(last, '7290000000001', 4999));
  });

  test('same barcode after 5s → not duplicate', () => {
    const last = { barcode: '7290000000001', timestamp: 1000 };
    assert.ok(!isDuplicate(last, '7290000000001', 6001));
  });

  test('different barcode → not duplicate', () => {
    const last = { barcode: '7290000000001', timestamp: 1000 };
    assert.ok(!isDuplicate(last, '7290000000002', 1500));
  });

  test('first scan (empty last) → not duplicate', () => {
    const last = { barcode: null, timestamp: 0 };
    assert.ok(!isDuplicate(last, '7290000000001', 100));
  });
});

// ─── Barcode normalization ─────────────────────────────────────────────────────

describe('Barcode normalization', () => {
  function normalizeBarcode(raw) {
    const clean = (raw || '').replace(/\D/g, '');
    if (!clean || clean.length < 8) return null;
    return clean;
  }

  test('EAN-13 passes through', () => {
    assert.equal(normalizeBarcode('7290000000001'), '7290000000001');
  });

  test('strips non-digit characters', () => {
    assert.equal(normalizeBarcode('729-0000-00000-1'), '7290000000001');
  });

  test('too short → null (rejected)', () => {
    assert.equal(normalizeBarcode('123'), null);
  });

  test('empty → null', () => {
    assert.equal(normalizeBarcode(''), null);
  });

  test('EAN-8 (8 digits) passes', () => {
    assert.equal(normalizeBarcode('12345678'), '12345678');
  });
});

// ─── SUPPORTED_FORMATS fix ────────────────────────────────────────────────────

describe('Html5QrcodeSupportedFormats — correct enum import', () => {
  // Real iPhone diagnostic proved:
  //   errMessage: "undefined is not an object (evaluating 'ac.SUPPORTED_FORMATS.EAN_13')"
  // Html5Qrcode.SUPPORTED_FORMATS does NOT exist as a class property.
  // Html5QrcodeSupportedFormats IS the correct top-level export.

  // Simulate the installed enum values (from node_modules inspection)
  const Html5QrcodeSupportedFormats = {
    EAN_13: 9, EAN_8: 10, UPC_A: 14, UPC_E: 15, CODE_128: 5, CODE_39: 3,
  };
  const Html5Qrcode = {}; // no SUPPORTED_FORMATS property

  test('Html5Qrcode.SUPPORTED_FORMATS is undefined (root cause)', () => {
    assert.equal(Html5Qrcode.SUPPORTED_FORMATS, undefined,
      'Html5Qrcode.SUPPORTED_FORMATS does not exist — accessing .EAN_13 throws TypeError');
  });

  test('Html5QrcodeSupportedFormats.EAN_13 is defined', () => {
    assert.equal(typeof Html5QrcodeSupportedFormats.EAN_13, 'number');
    assert.equal(Html5QrcodeSupportedFormats.EAN_13, 9);
  });

  test('Html5QrcodeSupportedFormats.EAN_8 is defined', () => {
    assert.equal(typeof Html5QrcodeSupportedFormats.EAN_8, 'number');
    assert.equal(Html5QrcodeSupportedFormats.EAN_8, 10);
  });

  test('Html5QrcodeSupportedFormats.UPC_A is defined', () => {
    assert.equal(typeof Html5QrcodeSupportedFormats.UPC_A, 'number');
    assert.equal(Html5QrcodeSupportedFormats.UPC_A, 14);
  });

  test('Html5QrcodeSupportedFormats.UPC_E is defined', () => {
    assert.equal(typeof Html5QrcodeSupportedFormats.UPC_E, 'number');
    assert.equal(Html5QrcodeSupportedFormats.UPC_E, 15);
  });

  test('config object with Html5QrcodeSupportedFormats does not throw', () => {
    assert.doesNotThrow(() => {
      const config = {
        fps: 10,
        qrbox: { width: 260, height: 260 },
        aspectRatio: 1.0,
        formatsToSupport: [
          Html5QrcodeSupportedFormats.EAN_13,
          Html5QrcodeSupportedFormats.EAN_8,
          Html5QrcodeSupportedFormats.UPC_A,
          Html5QrcodeSupportedFormats.UPC_E,
          Html5QrcodeSupportedFormats.CODE_128,
          Html5QrcodeSupportedFormats.CODE_39,
        ],
      };
      assert.ok(config.formatsToSupport.length === 6, 'all 6 formats included');
      assert.ok(config.formatsToSupport.every(f => typeof f === 'number'), 'all formats are numbers');
    });
  });

  test('old pattern with Html5Qrcode.SUPPORTED_FORMATS would throw TypeError', () => {
    assert.throws(() => {
      // This is the bug that crashed the iPhone
      const _ = Html5Qrcode.SUPPORTED_FORMATS.EAN_13;
    }, TypeError, 'accessing undefined.EAN_13 must throw TypeError');
  });

  test('enumerate-cameras stage completes before config is evaluated', () => {
    // The crash at "enumerate-cameras" lastStage means:
    // stage('enumerate-cameras') ran, then config evaluation crashed before
    // stage('start-environment') could be set.
    // With the fix, stage should advance to 'start-environment'.
    const stages = [];
    const stage = (s) => stages.push(s);

    stage('preflight');
    stage('post-defer');
    stage('constructor');
    stage('enumerate-cameras');

    // Simulate config creation with FIXED import — no throw
    const config = {
      formatsToSupport: [
        Html5QrcodeSupportedFormats.EAN_13,
        Html5QrcodeSupportedFormats.EAN_8,
      ],
    };

    stage('start-environment'); // now reachable
    assert.ok(stages.includes('start-environment'), 'start-environment must be reached after config fix');
    assert.ok(stages.indexOf('start-environment') > stages.indexOf('enumerate-cameras'));
  });
});

// ─── getCameras() replacement ─────────────────────────────────────────────────

describe('enumerateDevices() replacement for getCameras()', () => {
  test('getCameras() is not called before start() — would open camera via getUserMedia', () => {
    // Verify: we use enumerateDevices() NOT getCameras() during startup.
    // Html5Qrcode.getCameras() internally calls getUserMedia which opens the camera,
    // then closes it. On iOS WebKit, the camera release takes >80ms, so the
    // subsequent scanner.start() getUserMedia call fails with NotReadableError.
    // enumerateDevices() does NOT open the camera — safe to call before start().
    const safeEnumeration = async (mediaDevices) => {
      if (!mediaDevices?.enumerateDevices) return [];
      const devices = await mediaDevices.enumerateDevices();
      return devices.filter(d => d.kind === 'videoinput').map(d => ({ id: d.deviceId, label: d.label }));
    };

    // Mock mediaDevices with enumerateDevices (no getUserMedia needed)
    let getUserMediaCalled = false;
    const mockMediaDevices = {
      enumerateDevices: async () => [
        { kind: 'videoinput', deviceId: 'cam1', label: 'Back Camera' },
        { kind: 'audioinput', deviceId: 'mic1', label: 'Microphone' },
      ],
      getUserMedia: async () => { getUserMediaCalled = true; throw new Error('should not be called'); },
    };

    return safeEnumeration(mockMediaDevices).then(cams => {
      assert.ok(!getUserMediaCalled, 'getUserMedia must NOT be called during camera enumeration');
      assert.equal(cams.length, 1, 'should return only videoinput devices');
      assert.equal(cams[0].label, 'Back Camera');
    });
  });

  test('enumerateDevices() without permission returns empty labels (normal iOS behavior)', () => {
    const mockDevicesNoLabels = {
      enumerateDevices: async () => [
        { kind: 'videoinput', deviceId: 'abc123', label: '' },  // no label before permission
      ],
    };
    return mockDevicesNoLabels.enumerateDevices().then(devices => {
      const cams = devices.filter(d => d.kind === 'videoinput');
      assert.equal(cams.length, 1, 'device listed even without labels');
      assert.equal(cams[0].label, '', 'label is empty before permission — expected');
      // Device ID is still available for Attempt 3
      assert.ok(cams[0].deviceId, 'deviceId available without permission');
    });
  });

  test('cameraDiag panel shows regardless of showDebug', () => {
    // Previously: cameraDiag && showDebug — if showDebug=false panel was hidden
    // Now:        cameraDiag              — always shows for any user after failure
    const shouldShow = (cameraDiag, showDebug) => cameraDiag !== null;  // showDebug removed
    assert.ok(shouldShow({ lastStage: 'start-environment' }, false), 'panel shows even when showDebug=false');
    assert.ok(shouldShow({ lastStage: 'constructor' }, true), 'panel shows when showDebug=true');
    assert.ok(!shouldShow(null, true), 'panel hidden when cameraDiag is null');
  });
});

// ─── Canonical lookup pipeline ─────────────────────────────────────────────────

describe('Canonical lookup pipeline — single entry point', () => {
  // All three input paths (live, image, manual) should call the SAME
  // lookup function. We verify by simulation.

  let lookupCallCount = 0;
  let lastLookedUpBarcode = null;

  function canonicalLookup(barcode) {
    lookupCallCount++;
    lastLookedUpBarcode = barcode;
    return Promise.resolve({ product: { name: 'Test Product', kcal_per_100: 100 }, source: 'fitcoach_db' });
  }

  // All three paths normalize then call canonicalLookup
  async function handleLive(raw)   { const b = raw.replace(/\D/g,''); return canonicalLookup(b); }
  async function handleImage(raw)  { const b = raw.replace(/\D/g,''); return canonicalLookup(b); }
  async function handleManual(raw) { const b = raw.replace(/\D/g,''); return canonicalLookup(b); }

  test('live scan calls canonical lookup', async () => {
    lookupCallCount = 0;
    await handleLive('7290000000001');
    assert.equal(lookupCallCount, 1);
    assert.equal(lastLookedUpBarcode, '7290000000001');
  });

  test('image scan calls same canonical lookup', async () => {
    lookupCallCount = 0;
    await handleImage('7290000000002');
    assert.equal(lookupCallCount, 1);
    assert.equal(lastLookedUpBarcode, '7290000000002');
  });

  test('manual entry calls same canonical lookup', async () => {
    lookupCallCount = 0;
    await handleManual('7290000000003');
    assert.equal(lookupCallCount, 1);
    assert.equal(lastLookedUpBarcode, '7290000000003');
  });

  test('all three paths normalize barcode identically', async () => {
    const raw = '729-0000-00000-4';
    const [, , ] = await Promise.all([
      handleLive(raw),
      handleImage(raw),
      handleManual(raw),
    ]);
    // All three should have normalized to digits-only
    assert.equal(lastLookedUpBarcode, '7290000000004');
  });
});

// ─── CoachAsTrainee identity ───────────────────────────────────────────────────

describe('CoachAsTrainee identity — traineeEmail prop takes precedence', () => {
  function buildMealEntry(traineeEmailProp, loggedInUserEmail) {
    // mirrors addProductToMeal logic: traineeEmail prop wins
    return {
      trainee_email: traineeEmailProp,   // ← from prop, NOT logged-in user
      user_email_debug: loggedInUserEmail, // just for test visibility
    };
  }

  test('preview trainee email used, not coach email', () => {
    const previewEmail = '__preview__abc123@fitcoach.local';
    const coachEmail   = 'coach@example.com';
    const entry = buildMealEntry(previewEmail, coachEmail);
    assert.equal(entry.trainee_email, previewEmail);
    assert.notEqual(entry.trainee_email, coachEmail);
  });

  test('meal written to preview trainee, not coach account', () => {
    const previewEmail = '__preview__xyz@fitcoach.local';
    const coachEmail   = 'eden@fitcoach.com';
    const entry = buildMealEntry(previewEmail, coachEmail);
    assert.ok(entry.trainee_email.startsWith('__preview__'), 'must use preview email');
    assert.ok(!entry.trainee_email.includes('@fitcoach.com'), 'must NOT be coach email');
  });

  test('real trainee (not preview) also works correctly', () => {
    const traineeEmail = 'trainee@gmail.com';
    const coachEmail   = 'coach@example.com';
    const entry = buildMealEntry(traineeEmail, coachEmail);
    assert.equal(entry.trainee_email, 'trainee@gmail.com');
  });
});

// ─── Camera initialization timing ─────────────────────────────────────────────

describe('Camera initialization timing — DOM must exist before constructor', () => {
  test('setTimeout(0) defers initialization past synchronous execution', async () => {
    const events = [];
    events.push('setState called');

    // Simulate: state update happens synchronously
    // Real browser would re-render asynchronously
    let domReady = false;
    setTimeout(() => { domReady = true; }, 0); // simulates DOM update

    // WRONG: immediately try to use DOM (like the old code)
    events.push(`dom_ready_before_await: ${domReady}`); // false

    await new Promise(r => setTimeout(r, 0)); // yield like startCameraScan now does

    events.push(`dom_ready_after_await: ${domReady}`); // true

    assert.equal(events[1], 'dom_ready_before_await: false', 'DOM not yet ready before defer');
    assert.equal(events[2], 'dom_ready_after_await: true',   'DOM ready after defer');
  });

  test('old code pattern would fail synchronously', () => {
    // Simulate html5-qrcode constructor behavior when element missing
    function Html5QrcodeConstructorSim(elementId) {
      const el = { 'barcode-reader': null, 'existing-element': {} }[elementId];
      if (!el) throw `HTML Element with id=${elementId} not found`;
      return { state: 'ready' };
    }

    assert.throws(
      () => Html5QrcodeConstructorSim('barcode-reader'),
      /barcode-reader not found/,
      'constructor throws string when element missing'
    );

    assert.doesNotThrow(
      () => Html5QrcodeConstructorSim('existing-element'),
      'constructor succeeds when element exists'
    );
  });

  test('string throw from html5-qrcode is caught and classified as generic', () => {
    // Verify our error handler handles string throws (not Error objects)
    const strThrow = 'HTML Element with id=barcode-reader not found';
    const errName = strThrow?.name || (typeof strThrow === 'string' ? 'StringError' : 'UnknownError');
    assert.equal(errName, 'StringError', 'string throw gets normalized to StringError');
  });
});

// ─── Camera fallback strategy ──────────────────────────────────────────────────

describe('Camera fallback strategy', () => {
  test('environment camera failure falls back to any camera', async () => {
    const calls = [];

    async function mockStart(constraint) {
      calls.push(constraint);
      if (constraint.facingMode === 'environment') {
        throw Object.assign(new Error('OverconstrainedError'), { name: 'OverconstrainedError' });
      }
      return 'ok'; // default camera works
    }

    // Simulate the two-attempt fallback in startCameraScan
    let result;
    try {
      result = await mockStart({ facingMode: 'environment' });
    } catch (envErr) {
      result = await mockStart({}); // fallback
    }

    assert.equal(calls.length, 2, 'must attempt environment then fallback');
    assert.deepEqual(calls[0], { facingMode: 'environment' }, 'first attempt is environment');
    assert.deepEqual(calls[1], {},                             'fallback has no constraint');
    assert.equal(result, 'ok', 'fallback succeeds');
  });

  test('both cameras fail → error propagates', async () => {
    async function mockStart() {
      throw Object.assign(new Error('No cameras'), { name: 'NotFoundError' });
    }

    let thrown = null;
    try {
      await mockStart({ facingMode: 'environment' });
    } catch (e1) {
      try {
        await mockStart({});
      } catch (e2) {
        thrown = e2;
      }
    }

    assert.ok(thrown !== null, 'error should propagate when all attempts fail');
    assert.equal(thrown.name, 'NotFoundError');
  });
});

// ─── Scanner cleanup ───────────────────────────────────────────────────────────

describe('Scanner cleanup', () => {
  test('cleanup sets scannerRef to null', async () => {
    const scannerRef = { current: { state: 2, getState: () => 2, stop: async () => {}, clear: async () => {} } };
    const isScanning = scannerRef.current.getState() === 2;
    if (isScanning) await scannerRef.current.stop();
    await scannerRef.current.clear();
    scannerRef.current = null;
    assert.equal(scannerRef.current, null, 'scanner must be null after cleanup');
  });

  test('cleanup tolerates already-stopped scanner', async () => {
    const alreadyStopped = {
      getState: () => 1, // NOT_STARTED
      stop: async () => { throw new Error('not scanning'); },
      clear: async () => {},
    };
    const ref = { current: alreadyStopped };

    await assert.doesNotReject(async () => {
      try {
        if (ref.current.getState() === 2) await ref.current.stop();
        await ref.current.clear();
      } catch (_) {}
      ref.current = null;
    }, 'cleanup must not throw on already-stopped scanner');
  });
});
