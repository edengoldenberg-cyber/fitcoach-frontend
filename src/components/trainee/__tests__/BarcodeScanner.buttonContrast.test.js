/**
 * BarcodeScanner.buttonContrast.test.js
 *
 * Regression guard for the dark-dialog outline-button contrast bug.
 *
 * Root cause: Shadcn Button with variant="outline" applies `bg-background`
 * (opaque white on light themes). When paired with `text-white` on a dark
 * background, the white background makes the button label invisible.
 *
 * Fix: every outline button on the dark scanner dialog must also carry
 * `bg-transparent` to override the Shadcn default.
 *
 * These tests read the BarcodeScanner source and assert structural invariants
 * so a future edit cannot silently re-introduce the invisible-text regression.
 */

import { describe, test, expect } from 'vitest';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SRC_PATH  = path.resolve(__dirname, '../BarcodeScanner.jsx');
const SRC       = readFileSync(SRC_PATH, 'utf8');
const LINES     = SRC.split('\n');

// ─── Helper ───────────────────────────────────────────────────────────────────

/**
 * Returns all lines that contain ALL of the given substrings.
 */
function linesContaining(...strs) {
  return LINES.filter(line => strs.every(s => line.includes(s)));
}

// ─── Invariants ───────────────────────────────────────────────────────────────

describe('dark-dialog outline button contrast', () => {
  test(
    'no className contains text-white + hover:bg-white/10 without bg-transparent',
    () => {
      const violations = linesContaining('text-white', 'hover:bg-white/10')
        .filter(l => !l.includes('bg-transparent'));
      expect(violations).toHaveLength(0);
    }
  );

  test(
    '"הקלד/י ידנית" image-error button has bg-transparent',
    () => {
      // This is the specific button called out in the bug report.
      const btn = LINES.find(l => l.includes('הקלד/י ידנית'));
      // The button className should be on the line immediately before the label
      // or the label shares the line. Walk backwards to find the className.
      const labelIdx = LINES.findIndex(l => l.includes('הקלד/י ידנית'));
      expect(labelIdx).toBeGreaterThan(-1);
      // Find the nearest className within 5 lines above the label text
      const window = LINES.slice(Math.max(0, labelIdx - 5), labelIdx + 1).join('\n');
      expect(window).toContain('bg-transparent');
    }
  );

  test(
    '"הזנה ידנית" camera-mode button has bg-transparent',
    () => {
      const idx = LINES.findIndex(l => l.includes('הזנה ידנית'));
      expect(idx).toBeGreaterThan(-1);
      const window = LINES.slice(Math.max(0, idx - 5), idx + 1).join('\n');
      expect(window).toContain('bg-transparent');
    }
  );

  test(
    '"הזן ידנית" learn-product button has bg-transparent',
    () => {
      const idx = LINES.findIndex(l => l.includes('הזן ידנית') && l.includes('variant'));
      expect(idx).toBeGreaterThan(-1);
      expect(LINES[idx]).toContain('bg-transparent');
    }
  );

  test(
    'all variant="outline" buttons in dark sections that have text-white also have bg-transparent',
    () => {
      // Collect pairs: for each outline variant, find the nearby className string.
      // We use a single-pass scan over lines: if a line has variant="outline",
      // look at that line and the next 4 lines for className. If className
      // contains text-white but not bg-transparent → violation.
      const violations = [];
      for (let i = 0; i < LINES.length; i++) {
        if (!LINES[i].includes('variant="outline"')) continue;
        const chunk = LINES.slice(i, Math.min(LINES.length, i + 5)).join('\n');
        if (chunk.includes('text-white') && chunk.includes('hover:bg-white/10')) {
          if (!chunk.includes('bg-transparent')) {
            violations.push(`Line ${i + 1}: ${LINES[i].trim()}`);
          }
        }
      }
      expect(violations).toHaveLength(0);
    }
  );
});
