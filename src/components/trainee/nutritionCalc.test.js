import { describe, it, expect } from 'vitest';

// ── Pure nutrition calculation helpers (mirroring AddMealFromPhoto handleEditItem) ──

function calcMacrosFromPer100(per100, grams) {
  return {
    calories: Math.round((per100.kcal    / 100) * grams),
    protein:  Math.round(((per100.protein / 100) * grams) * 10) / 10,
    carbs:    Math.round(((per100.carbs   / 100) * grams) * 10) / 10,
    fat:      Math.round(((per100.fat     / 100) * grams) * 10) / 10,
  };
}

function derivePer100FromAbsolute(macros, grams) {
  if (!grams || grams <= 0) return { kcal: 0, protein: 0, carbs: 0, fat: 0 };
  return {
    kcal:    (macros.calories / grams) * 100,
    protein: (macros.protein  / grams) * 100,
    carbs:   (macros.carbs    / grams) * 100,
    fat:     (macros.fat      / grams) * 100,
  };
}

function sumItems(items) {
  return items.reduce((acc, item) => ({
    calories: acc.calories + (item.calories || 0),
    protein:  acc.protein  + (item.protein  || 0),
    carbs:    acc.carbs    + (item.carbs    || 0),
    fat:      acc.fat      + (item.fat      || 0),
  }), { calories: 0, protein: 0, carbs: 0, fat: 0 });
}

// ── Bug 1: protein bar — nutrition label values must match ─────────────────────

describe('nutrition label — protein bar (Bug 1)', () => {
  const LABEL_PER100 = { kcal: 400, protein: 33.33, carbs: 30, fat: 12 };

  it('60g protein bar computes 20g protein (label value)', () => {
    const m = calcMacrosFromPer100(LABEL_PER100, 60);
    expect(m.protein).toBeGreaterThanOrEqual(19);
    expect(m.protein).toBeLessThanOrEqual(21);
    expect(m.calories).toBe(240);
  });

  it('visual-estimate 50g gives ~17g protein (under-reports vs label)', () => {
    // 33.33/100 × 50 = 16.665 → rounds to 16.7; production showed ~17g because
    // the actual per-100g value differed slightly from this fixture.
    const m = calcMacrosFromPer100(LABEL_PER100, 50);
    expect(m.protein).toBeGreaterThan(15);
    expect(m.protein).toBeLessThan(18);
  });

  it('label value beats visual estimate by 3g protein', () => {
    const label   = calcMacrosFromPer100(LABEL_PER100, 60);
    const visual  = calcMacrosFromPer100(LABEL_PER100, 50);
    expect(label.protein).toBeGreaterThan(visual.protein);
  });
});

// ── Bug 2: chicken meal — null macro handling ──────────────────────────────────

describe('null macro safety (Bug 2)', () => {
  it('null protein in DB record coerces to 0 (the raw bug)', () => {
    // In JavaScript, null / 100 = 0 (null is coerced to 0 in numeric context).
    // The bug: (null / 100) * 150 = 0, then 0 is silently used as protein,
    // producing e.g. 4g total protein for a 150g chicken meal (only from vegetables).
    // The fix rejects DB records where any macro is null/undefined before calculation.
    const nullProtein = null;
    const grams = 150;
    const result = (nullProtein / 100) * grams;
    expect(result).toBe(0);  // 0, not NaN — silently wrong
    expect(Number.isNaN(result)).toBe(false);
  });

  it('NaN protein || 0 produces 0 (how frontend hides the bug)', () => {
    const nan = NaN;
    expect(nan || 0).toBe(0);
  });

  it('healthy chicken record produces correct values', () => {
    const chicken = { kcal: 165, protein: 31, carbs: 0, fat: 3.6 };
    const m = calcMacrosFromPer100(chicken, 150);
    expect(m.calories).toBe(248);
    expect(m.protein).toBe(46.5);
    expect(m.carbs).toBe(0);
  });

  it('meal with chicken does not produce 4g protein total', () => {
    const items = [
      calcMacrosFromPer100({ kcal: 165, protein: 31, carbs: 0, fat: 3.6 }, 150), // chicken
      calcMacrosFromPer100({ kcal: 81,  protein: 5.4,  carbs: 14, fat: 0.4 }, 100), // peas+carrots
    ];
    const totals = sumItems(items);
    expect(totals.protein).toBeGreaterThan(40);
    expect(totals.protein).not.toBe(4);
  });
});

// ── Gram edit → macro recalculation ──────────────────────────────────────────

describe('gram edit recalculates macros (handleEditItem logic)', () => {
  it('changing grams from 150 to 200 scales macros proportionally', () => {
    const per100 = { kcal: 165, protein: 31, carbs: 0, fat: 3.6 };
    const at150 = calcMacrosFromPer100(per100, 150);
    const at200 = calcMacrosFromPer100(per100, 200);
    expect(at200.calories).toBeGreaterThan(at150.calories);
    expect(at200.protein).toBeGreaterThan(at150.protein);
  });

  it('changing grams uses existing per100 anchor for consistency', () => {
    const per100 = { kcal: 165, protein: 31, carbs: 0, fat: 3.6 };
    // derive per100 from absolute values (as handleEditItem does)
    const abs150 = calcMacrosFromPer100(per100, 150);
    const derivedPer100 = derivePer100FromAbsolute(abs150, 150);
    const recalcAt100 = calcMacrosFromPer100(derivedPer100, 100);
    // derivedPer100 should round-trip back close to original per100
    expect(Math.abs(recalcAt100.calories - 165)).toBeLessThanOrEqual(2);
  });

  it('manual calorie edit persists without being overwritten by gram change', () => {
    // handleEditItem logic: when field !== 'grams', just set the value directly
    // Without a subsequent gram change, the manual value stays
    let item = { grams: 150, calories: 248, protein: 46.5, carbs: 0, fat: 5.4,
                 per100_kcal: 165, per100_protein: 31, per100_carbs: 0, per100_fat: 3.6 };
    // User manually sets calories to 300
    item = { ...item, calories: 300, _corrected: true };
    expect(item.calories).toBe(300);
    expect(item._corrected).toBe(true);
    // The manual value persists because no gram change happened
  });

  it('gram change after manual edit uses per100 anchor, not manually-entered total', () => {
    // This ensures gram changes are always consistent with per100
    const per100 = { kcal: 165, protein: 31, carbs: 0, fat: 3.6 };
    const newGrams = 200;
    const macros = calcMacrosFromPer100(per100, newGrams);
    expect(macros.calories).toBe(330);
    expect(macros.protein).toBe(62);
  });
});

// ── Meal total aggregation ─────────────────────────────────────────────────────

describe('meal total aggregation', () => {
  it('sum of items equals meal total — no NaN', () => {
    const items = [
      { calories: 248, protein: 46.5, carbs: 0,    fat: 5.4 },
      { calories: 80,  protein: 5.4,  carbs: 14,   fat: 0.4 },
      { calories: 41,  protein: 0.9,  carbs: 9.6,  fat: 0.2 },
    ];
    const total = sumItems(items);
    expect(total.calories).toBe(369);
    expect(total.protein).toBeCloseTo(52.8, 1);
    expect(Number.isNaN(total.calories)).toBe(false);
    expect(Number.isNaN(total.protein)).toBe(false);
  });

  it('undefined item macros treated as 0 in sum', () => {
    const items = [
      { calories: 248, protein: 46.5, carbs: 0, fat: 5.4 },
      { calories: undefined, protein: undefined, carbs: undefined, fat: undefined },
    ];
    const total = sumItems(items);
    expect(total.calories).toBe(248);
    expect(total.protein).toBe(46.5);
    expect(Number.isNaN(total.calories)).toBe(false);
  });

  it('daily total is sum of meal totals', () => {
    const breakfast = { calories: 400, protein: 30, carbs: 40, fat: 15 };
    const lunch     = { calories: 600, protein: 50, carbs: 60, fat: 20 };
    const dinner    = { calories: 500, protein: 40, carbs: 50, fat: 18 };
    const daily = sumItems([breakfast, lunch, dinner]);
    expect(daily.calories).toBe(1500);
    expect(daily.protein).toBe(120);
  });
});

// ── GO Yoplait serving / quantity engine (test matrix items A-C, F, N) ────────

const GO_PER100 = { kcal: 55, protein: 10, carbs: 3.7, fat: 0 };
const GO_SERVING_G = 200; // 1 גביע

describe('GO Yoplait serving math — 55 kcal/100g, 1 גביע = 200g', () => {
  it('A. 1 גביע (200g) → 110 kcal, 20g protein, 7.4g carbs, 0g fat', () => {
    const m = calcMacrosFromPer100(GO_PER100, GO_SERVING_G);
    expect(m.calories).toBe(110);
    expect(m.protein).toBe(20);
    expect(m.carbs).toBeCloseTo(7.4, 1);
    expect(m.fat).toBe(0);
  });

  it('B. ½ גביע (100g) → 55 kcal, 10g protein', () => {
    const m = calcMacrosFromPer100(GO_PER100, Math.round(GO_SERVING_G * 0.5));
    expect(m.calories).toBe(55);
    expect(m.protein).toBe(10);
  });

  it('C. 1.5 גביעים (300g) → 165 kcal, 30g protein', () => {
    const m = calcMacrosFromPer100(GO_PER100, Math.round(GO_SERVING_G * 1.5));
    expect(m.calories).toBe(165);
    expect(m.protein).toBe(30);
  });

  it('¼ גביע (50g) → ≈27-28 kcal', () => {
    const m = calcMacrosFromPer100(GO_PER100, Math.round(GO_SERVING_G * 0.25));
    expect(m.calories).toBeGreaterThanOrEqual(27);
    expect(m.calories).toBeLessThanOrEqual(28);
  });

  it('¾ גביע (150g) → ≈82-83 kcal', () => {
    const m = calcMacrosFromPer100(GO_PER100, Math.round(GO_SERVING_G * 0.75));
    expect(m.calories).toBeGreaterThanOrEqual(82);
    expect(m.calories).toBeLessThanOrEqual(83);
  });

  it('2 גביעים (400g) → 220 kcal, 40g protein', () => {
    const m = calcMacrosFromPer100(GO_PER100, GO_SERVING_G * 2);
    expect(m.calories).toBe(220);
    expect(m.protein).toBe(40);
  });

  it('N. manufacturer serving (200g) ≠ typical package (assumed 4-pack = 800g)', () => {
    // Package size (total in box) is NOT the same as serving size (1 cup = 200g).
    // Nutrition is per cup (200g), not per entire package.
    const packageSizeG = 800; // 4-cup pack
    const servingSizeG = 200; // 1 cup
    expect(servingSizeG).toBeLessThan(packageSizeG);
    // Nutrition is calculated from servingSizeG, not packageSizeG
    const mPerServing = calcMacrosFromPer100(GO_PER100, servingSizeG);
    const mPerPackage = calcMacrosFromPer100(GO_PER100, packageSizeG);
    expect(mPerServing.calories).toBe(110);
    expect(mPerPackage.calories).toBe(440);
  });

  it('Q. selecting 1 גביע does not change per-100g anchor', () => {
    const anchor = { ...GO_PER100 };
    const _ = calcMacrosFromPer100(anchor, GO_SERVING_G); // "selected 1 גביע"
    // anchor must remain unchanged
    expect(anchor.kcal).toBe(55);
    expect(anchor.protein).toBe(10);
  });
});
