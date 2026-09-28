/**
 * decodeBarcodeFromImage.test.js
 *
 * Tests for the V2 barcode photo decoder helpers that can run in Node (no DOM):
 *  - EAN-13 checksum (including the regression barcode 7290011017873)
 *  - HEIC file detection
 *  - Normalised-dimension calculation (max-edge downscale / no-upscale)
 *  - Rotation-dimension calculation
 *  - Crop-rectangle calculation
 *  - DECODE_PASSES ordering and completeness
 *  - decodeBarcodeFromImage error classifications (mocked browser APIs)
 *
 * NOTE: The full ZXing decode pipeline requires a browser canvas environment
 * (HTMLCanvasElement + @zxing/browser's HTMLCanvasElementLuminanceSource).
 * Those paths are covered by integration / manual tests; only pure helper logic
 * and error-classification branches are tested here.
 */

import { describe, test, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  validateEan13Checksum,
  isHeicFile,
  computeNormalizedDimensions,
  computeRotatedDimensions,
  computeCropRect,
  DECODE_PASSES,
  decodeBarcodeFromImage,
} from '../decodeBarcodeFromImage';

// ─── EAN-13 checksum ──────────────────────────────────────────────────────────

describe('validateEan13Checksum', () => {
  test('7290011017873 is a valid EAN-13 (regression barcode)', () => {
    expect(validateEan13Checksum('7290011017873')).toBe(true);
  });

  test('checksum digit changed by 1 is rejected', () => {
    expect(validateEan13Checksum('7290011017872')).toBe(false);
  });

  test('all zeros has a valid checksum (trivial case)', () => {
    expect(validateEan13Checksum('0000000000000')).toBe(true);
  });

  test('wrong length rejected', () => {
    expect(validateEan13Checksum('729001101787')).toBe(false);  // 12 digits
    expect(validateEan13Checksum('72900110178733')).toBe(false); // 14 digits
  });

  test('non-string rejected', () => {
    expect(validateEan13Checksum(7290011017873)).toBe(false);
    expect(validateEan13Checksum(null)).toBe(false);
  });

  test('string with non-digits rejected', () => {
    expect(validateEan13Checksum('729001101787X')).toBe(false);
  });

  test('another known valid barcode (4006381333931)', () => {
    // 4 0 0 6 3 8 1 3 3 3 9 3 1
    // sum = 4×1+0×3+0×1+6×3+3×1+8×3+1×1+3×3+3×1+3×3+9×1+3×3
    //     = 4+0+0+18+3+24+1+9+3+9+9+9 = 89
    // check = (10 - 89%10)%10 = (10-9)%10 = 1
    expect(validateEan13Checksum('4006381333931')).toBe(true);
  });
});

// ─── HEIC detection ───────────────────────────────────────────────────────────

describe('isHeicFile', () => {
  test('detects image/heic MIME type', () => {
    expect(isHeicFile({ type: 'image/heic', name: 'photo.jpg' })).toBe(true);
  });

  test('detects image/heif MIME type', () => {
    expect(isHeicFile({ type: 'image/heif', name: 'photo.jpg' })).toBe(true);
  });

  test('detects by .heic extension when MIME is empty', () => {
    expect(isHeicFile({ type: '', name: 'IMG_0001.heic' })).toBe(true);
  });

  test('detects by .heif extension', () => {
    expect(isHeicFile({ type: '', name: 'photo.HEIF' })).toBe(true);
  });

  test('JPEG is not HEIC', () => {
    expect(isHeicFile({ type: 'image/jpeg', name: 'photo.jpg' })).toBe(false);
  });

  test('PNG is not HEIC', () => {
    expect(isHeicFile({ type: 'image/png', name: 'photo.png' })).toBe(false);
  });
});

// ─── Normalised dimensions ────────────────────────────────────────────────────

describe('computeNormalizedDimensions', () => {
  test('landscape wider than max: longest edge clamps to 1600', () => {
    const { width, height } = computeNormalizedDimensions(3200, 2400, 1600);
    expect(width).toBe(1600);
    expect(height).toBe(1200);
  });

  test('portrait taller than max: tallest edge clamps to 1600', () => {
    const { width, height } = computeNormalizedDimensions(1200, 3200, 1600);
    expect(width).toBe(600);
    expect(height).toBe(1600);
  });

  test('image already within budget: not upscaled', () => {
    const { width, height, scale } = computeNormalizedDimensions(800, 600, 1600);
    expect(width).toBe(800);
    expect(height).toBe(600);
    expect(scale).toBe(1);
  });

  test('square image: both edges equal after clamp', () => {
    const { width, height } = computeNormalizedDimensions(2000, 2000, 1600);
    expect(width).toBe(1600);
    expect(height).toBe(1600);
  });

  test('throws on zero dimensions', () => {
    expect(() => computeNormalizedDimensions(0, 100)).toThrow();
  });
});

// ─── Rotation dimensions ──────────────────────────────────────────────────────

describe('computeRotatedDimensions', () => {
  test('0° preserves width and height', () => {
    expect(computeRotatedDimensions(400, 300, 0)).toEqual({ width: 400, height: 300 });
  });

  test('90° swaps width and height', () => {
    expect(computeRotatedDimensions(400, 300, 90)).toEqual({ width: 300, height: 400 });
  });

  test('180° preserves width and height', () => {
    expect(computeRotatedDimensions(400, 300, 180)).toEqual({ width: 400, height: 300 });
  });

  test('270° swaps width and height', () => {
    expect(computeRotatedDimensions(400, 300, 270)).toEqual({ width: 300, height: 400 });
  });

  test('360° treated as 0°', () => {
    expect(computeRotatedDimensions(400, 300, 360)).toEqual({ width: 400, height: 300 });
  });
});

// ─── Crop rectangle ───────────────────────────────────────────────────────────

describe('computeCropRect', () => {
  test('2/3 crop of 600×400 is 400×267 centred', () => {
    const r = computeCropRect(600, 400, 2 / 3);
    expect(r.width).toBe(400);
    expect(r.height).toBe(267);
    expect(r.x).toBe(100);  // (600-400)/2
    expect(r.y).toBe(67);   // Math.round((400-267)/2)
  });

  test('half crop of 200×100', () => {
    const r = computeCropRect(200, 100, 0.5);
    expect(r.width).toBe(100);
    expect(r.height).toBe(50);
    expect(r.x).toBe(50);
    expect(r.y).toBe(25);
  });
});

// ─── Pass ordering ────────────────────────────────────────────────────────────

describe('DECODE_PASSES', () => {
  test('exactly 8 passes', () => {
    expect(DECODE_PASSES).toHaveLength(8);
  });

  test('full-image passes come before crop passes', () => {
    const firstCropIdx  = DECODE_PASSES.findIndex(p => p.phase === 'crop');
    const lastFullIdx   = DECODE_PASSES.map(p => p.phase).lastIndexOf('full');
    expect(lastFullIdx).toBeLessThan(firstCropIdx);
  });

  test('each phase has exactly 4 rotations: 0, 90, 180, 270', () => {
    for (const phase of ['full', 'crop']) {
      const rotations = DECODE_PASSES
        .filter(p => p.phase === phase)
        .map(p => p.rotation);
      expect(rotations.sort((a, b) => a - b)).toEqual([0, 90, 180, 270]);
    }
  });
});

// ─── decodeBarcodeFromImage error classification ──────────────────────────────

describe('decodeBarcodeFromImage — error classification (mocked browser APIs)', () => {
  let windowMock;

  beforeEach(() => {
    vi.useFakeTimers();
    // Minimal window stub for HEIC path (createImageBitmap etc. not needed — HEIC
    // is detected before any image loading)
    windowMock = { location: { pathname: '/' } };
    vi.stubGlobal('window', windowMock);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  test('HEIC file throws { type: "heic" }', async () => {
    const file = { type: 'image/heic', name: 'photo.heic', size: 1024 };
    await expect(decodeBarcodeFromImage(file)).rejects.toMatchObject({ type: 'heic' });
  });

  test('HEIF file throws { type: "heic" }', async () => {
    const file = { type: 'image/heif', name: 'photo.heif', size: 1024 };
    await expect(decodeBarcodeFromImage(file)).rejects.toMatchObject({ type: 'heic' });
  });

  test('image load failure throws { type: "load_failed" }', async () => {
    const file = { type: 'image/jpeg', name: 'broken.jpg', size: 100 };
    // Stub createImageBitmap to always fail
    vi.stubGlobal('createImageBitmap', vi.fn().mockRejectedValue(new Error('decode failed')));
    // Stub URL methods for the HTMLImageElement fallback
    vi.stubGlobal('URL', {
      createObjectURL: () => 'blob:fake',
      revokeObjectURL: () => {},
    });
    // Stub Image to fire onerror
    vi.stubGlobal('Image', class {
      set src(_) { setTimeout(() => this.onerror?.(), 0); }
    });

    const p = decodeBarcodeFromImage(file).catch(e => e);
    await vi.runAllTimersAsync();
    const err = await p;
    expect(err.type).toBe('load_failed');
  });

  test('timeout flag fires { type: "timeout" } after budget expires', async () => {
    const file = { type: 'image/jpeg', name: 'ok.jpg', size: 100 };
    // createImageBitmap hangs forever → budget timer fires
    vi.stubGlobal('createImageBitmap', vi.fn().mockReturnValue(new Promise(() => {})));

    const p = decodeBarcodeFromImage(file).catch(e => e);
    await vi.runAllTimersAsync();
    const err = await p;
    expect(err.type).toBe('timeout');
  });
});
