/**
 * decodeBarcodeFromImage.js  —  Barcode Photo Decoder V2
 *
 * Multi-pass ZXing decode of a photo file with an Html5Qrcode fallback.
 *
 * Pass order:
 *   full-0 → full-90 → full-180 → full-270
 *   crop-0 → crop-90 → crop-180 → crop-270
 *
 * Fallback (ZXing all-miss): Html5Qrcode.scanFile, ~4 s budget.
 *
 * Total budget: ~11 s enforced via a top-level Promise.race so any hanging
 * await (image load, ZXing pass) is cleanly interrupted when the deadline fires.
 * An `aborted` flag is also checked between passes so no unnecessary work starts
 * after the deadline.
 *
 * Error shapes: thrown errors carry a `.type` property:
 *   'heic'        — HEIC/HEIF file detected (iOS default photo format)
 *   'load_failed' — image could not be loaded at all
 *   'timeout'     — total budget expired
 *   'not_found'   — all passes exhausted, no barcode found
 */

// ─── EAN-13 checksum ──────────────────────────────────────────────────────────

/**
 * Returns true iff the 13-digit string passes the GS1 EAN-13 check digit.
 * Used to reject coincidental ZXing matches on noise.
 */
export function validateEan13Checksum(barcode) {
  if (typeof barcode !== 'string' || barcode.length !== 13 || !/^\d{13}$/.test(barcode)) {
    return false;
  }
  const digits = barcode.split('').map(Number);
  let sum = 0;
  for (let i = 0; i < 12; i++) {
    sum += digits[i] * (i % 2 === 0 ? 1 : 3);
  }
  const check = (10 - (sum % 10)) % 10;
  return check === digits[12];
}

// ─── HEIC detection ───────────────────────────────────────────────────────────

const HEIC_MIMES = new Set([
  'image/heic', 'image/heif', 'image/heics', 'image/heic-sequence',
]);
const HEIC_EXT_RE = /\.hei[cfs]s?$/i;

export function isHeicFile(file) {
  if (HEIC_MIMES.has((file?.type || '').toLowerCase())) return true;
  if (HEIC_EXT_RE.test(file?.name || '')) return true;
  return false;
}

// ─── Canvas normalization helpers ─────────────────────────────────────────────

const MAX_EDGE = 1600;

/**
 * Compute output dimensions that fit srcWidth×srcHeight within maxEdge on the
 * longest side, without upscaling.  Returns { width, height, scale }.
 */
export function computeNormalizedDimensions(srcWidth, srcHeight, maxEdge = MAX_EDGE) {
  if (srcWidth <= 0 || srcHeight <= 0) throw new Error('invalid source dimensions');
  const longest = Math.max(srcWidth, srcHeight);
  if (longest <= maxEdge) return { width: srcWidth, height: srcHeight, scale: 1 };
  const scale = maxEdge / longest;
  return {
    width:  Math.round(srcWidth  * scale),
    height: Math.round(srcHeight * scale),
    scale,
  };
}

/**
 * Compute the output canvas dimensions for a rotation of `degrees`.
 * 90° and 270° swap width↔height; 0° and 180° preserve them.
 */
export function computeRotatedDimensions(width, height, degrees) {
  const d = ((degrees % 360) + 360) % 360;
  return (d === 90 || d === 270)
    ? { width: height, height: width }
    : { width, height };
}

/**
 * Compute the { x, y, width, height } rectangle of a center crop at `fraction`
 * of the source canvas dimensions.
 */
export function computeCropRect(width, height, fraction = 2 / 3) {
  const cropW = Math.round(width  * fraction);
  const cropH = Math.round(height * fraction);
  return {
    x: Math.round((width  - cropW) / 2),
    y: Math.round((height - cropH) / 2),
    width:  cropW,
    height: cropH,
  };
}

// ─── Pass descriptor ──────────────────────────────────────────────────────────

/** Ordered decode passes: full image first, then center crop, each 0–270°. */
export const DECODE_PASSES = Object.freeze([
  { phase: 'full', rotation: 0   },
  { phase: 'full', rotation: 90  },
  { phase: 'full', rotation: 180 },
  { phase: 'full', rotation: 270 },
  { phase: 'crop', rotation: 0   },
  { phase: 'crop', rotation: 90  },
  { phase: 'crop', rotation: 180 },
  { phase: 'crop', rotation: 270 },
]);

// ─── Canvas builders (DOM-dependent) ─────────────────────────────────────────

function buildNormalizedCanvas(bitmap) {
  const { width, height } = computeNormalizedDimensions(bitmap.width, bitmap.height);
  const canvas = document.createElement('canvas');
  canvas.width  = width;
  canvas.height = height;
  canvas.getContext('2d').drawImage(bitmap, 0, 0, width, height);
  return canvas;
}

function buildRotatedCanvas(src, degrees) {
  const { width: cw, height: ch } = computeRotatedDimensions(src.width, src.height, degrees);
  const canvas = document.createElement('canvas');
  canvas.width  = cw;
  canvas.height = ch;
  const ctx = canvas.getContext('2d');
  ctx.translate(cw / 2, ch / 2);
  ctx.rotate((degrees * Math.PI) / 180);
  ctx.drawImage(src, -src.width / 2, -src.height / 2);
  return canvas;
}

function buildCroppedCanvas(src, fraction = 2 / 3) {
  const { x, y, width: cw, height: ch } = computeCropRect(src.width, src.height, fraction);
  const canvas = document.createElement('canvas');
  canvas.width  = cw;
  canvas.height = ch;
  canvas.getContext('2d').drawImage(src, x, y, cw, ch, 0, 0, cw, ch);
  return canvas;
}

// ─── Image loading ────────────────────────────────────────────────────────────

async function loadBitmap(file) {
  // Primary: with EXIF orientation
  try { return await createImageBitmap(file, { imageOrientation: 'from-image' }); }
  catch (_) { /* fall through */ }

  // Secondary: without options
  try { return await createImageBitmap(file); }
  catch (_) { /* fall through */ }

  // Final: HTMLImageElement + object URL
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(Object.assign(new Error('Image load failed'), { type: 'load_failed' }));
    };
    img.src = url;
  });
}

// ─── ZXing single-pass decode ─────────────────────────────────────────────────

async function tryZxingPass(reader, canvas) {
  try {
    const result = reader.decodeFromCanvas(canvas);
    return typeof result?.getText === 'function' ? result.getText() : (result?.text ?? null);
  } catch {
    return null;
  }
}

// ─── Html5Qrcode fallback ─────────────────────────────────────────────────────

async function runH5QFallback(file, scanner, budgetMs = 4000) {
  const timeoutErr = Object.assign(new Error('fallback timeout'), { type: 'timeout' });
  const timeout  = new Promise((_, r) => setTimeout(() => r(timeoutErr), budgetMs));
  return Promise.race([scanner.scanFile(file, false), timeout]);
}

// ─── Core decode work (runs inside the top-level budget race) ─────────────────

async function _decodeWork(file, html5QrcodeFallback, abortedRef) {
  // Load image
  let bitmap;
  try {
    bitmap = await loadBitmap(file);
  } catch (e) {
    throw Object.assign(new Error('Failed to load image'), { type: e.type || 'load_failed' });
  }
  if (abortedRef.v) throw Object.assign(new Error('Decode timeout'), { type: 'timeout' });

  // Render to normalised canvas
  const baseCanvas = buildNormalizedCanvas(bitmap);
  const cropCanvas = buildCroppedCanvas(baseCanvas);

  // ZXing reader with retail formats + TRY_HARDER
  const { BrowserMultiFormatReader } = await import('@zxing/browser');
  const { BarcodeFormat, DecodeHintType } = await import('@zxing/library');

  const hints = new Map();
  // Food-product barcodes are numeric retail formats only (EAN/UPC family).
  // CODE_128 and CODE_39 are alphanumeric industrial formats that .replace(/\D/g,'')
  // would silently corrupt — they serve no purpose in a grocery-product flow.
  hints.set(DecodeHintType.POSSIBLE_FORMATS, [
    BarcodeFormat.EAN_13,
    BarcodeFormat.EAN_8,
    BarcodeFormat.UPC_A,
    BarcodeFormat.UPC_E,
  ]);
  hints.set(DecodeHintType.TRY_HARDER, true);
  const reader = new BrowserMultiFormatReader(hints);

  // Multi-pass decode
  for (const pass of DECODE_PASSES) {
    if (abortedRef.v) break;

    const src    = pass.phase === 'crop' ? cropCanvas : baseCanvas;
    const canvas = pass.rotation === 0 ? src : buildRotatedCanvas(src, pass.rotation);

    const text = await tryZxingPass(reader, canvas);
    if (!text) continue;

    const clean = text.replace(/\D/g, '');
    if (clean.length < 8) continue;

    // EAN-13: validate checksum before accepting
    if (clean.length === 13 && !validateEan13Checksum(clean)) continue;

    return clean;
  }

  if (abortedRef.v) throw Object.assign(new Error('Decode timeout'), { type: 'timeout' });

  // Html5Qrcode fallback (~4 s)
  if (html5QrcodeFallback) {
    try {
      const text  = await runH5QFallback(file, html5QrcodeFallback, 4000);
      const clean = text.replace(/\D/g, '');
      if (clean.length >= 8) return clean;
    } catch (e) {
      if (e.type === 'timeout') throw e;
    }
  }

  throw Object.assign(new Error('No barcode found in image'), { type: 'not_found' });
}

// ─── Main export ──────────────────────────────────────────────────────────────

/**
 * decodeBarcodeFromImage(file, options?)
 *
 * Returns the decoded barcode string (digits only, ≥8 chars).
 * Throws an Error with .type in {'heic','load_failed','timeout','not_found'}.
 *
 * Options:
 *   html5QrcodeFallback — an initialised Html5Qrcode instance; when supplied,
 *                         it is used as a final fallback if all ZXing passes miss.
 */
export async function decodeBarcodeFromImage(file, { html5QrcodeFallback = null } = {}) {
  // HEIC guard — before any async work
  if (isHeicFile(file)) {
    throw Object.assign(
      new Error('HEIC/HEIF format is not supported for barcode decoding'),
      { type: 'heic' }
    );
  }

  // Shared abort flag — set by the budget timer, checked between passes
  const abortedRef = { v: false };

  // Top-level budget promise (~11 s).  Racing it against the work promise
  // ensures any hanging await (image load, ZXing) is interrupted cleanly.
  let _clearBudget = () => {};
  const budgetPromise = new Promise((_, reject) => {
    const t = setTimeout(() => {
      abortedRef.v = true;
      reject(Object.assign(new Error('Decode timeout'), { type: 'timeout' }));
    }, 11000);
    _clearBudget = () => clearTimeout(t);
  });

  try {
    return await Promise.race([
      _decodeWork(file, html5QrcodeFallback, abortedRef),
      budgetPromise,
    ]);
  } finally {
    _clearBudget();
  }
}
