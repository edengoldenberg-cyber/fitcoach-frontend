/**
 * mealTarget.test.js
 *
 * Covers isValidMealTarget() and normalizeMealTarget() — the canonical meal
 * target validation/normalization used to preserve the originating meal section
 * through a barcode scan round-trip.
 */

import { describe, test, expect } from 'vitest';
import { MEAL_TARGETS, isValidMealTarget, normalizeMealTarget } from '../mealTarget';

describe('MEAL_TARGETS', () => {
  test('contains exactly the four canonical sections', () => {
    expect(MEAL_TARGETS).toEqual(['breakfast', 'lunch', 'dinner', 'snack']);
  });
});

describe('isValidMealTarget', () => {
  test.each(['breakfast', 'lunch', 'dinner', 'snack'])(
    '"%s" is valid', (v) => expect(isValidMealTarget(v)).toBe(true)
  );

  test.each([null, undefined, '', 'brunch', 'Breakfast', 0, false])(
    '"%s" is invalid', (v) => expect(isValidMealTarget(v)).toBe(false)
  );
});

describe('normalizeMealTarget', () => {
  test('valid value passes through unchanged', () => {
    expect(normalizeMealTarget('lunch')).toBe('lunch');
    expect(normalizeMealTarget('breakfast')).toBe('breakfast');
  });

  test('null falls back to default snack', () => {
    expect(normalizeMealTarget(null)).toBe('snack');
  });

  test('undefined falls back to default snack', () => {
    expect(normalizeMealTarget(undefined)).toBe('snack');
  });

  test('unknown string falls back to default snack', () => {
    expect(normalizeMealTarget('brunch')).toBe('snack');
  });

  test('custom fallback used when value is invalid', () => {
    expect(normalizeMealTarget(null, 'breakfast')).toBe('breakfast');
    expect(normalizeMealTarget('bad', 'dinner')).toBe('dinner');
  });

  test('custom fallback ignored when value is valid', () => {
    expect(normalizeMealTarget('lunch', 'snack')).toBe('lunch');
  });

  test('empty string is invalid — falls back to snack', () => {
    expect(normalizeMealTarget('')).toBe('snack');
  });
});
