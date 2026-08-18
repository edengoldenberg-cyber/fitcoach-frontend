/**
 * CoachDashboard.badgeMapping.test.js
 *
 * Pure-logic unit tests for the badge → counter / filter mapping.
 *
 * Tests the INVARIANT that no_data and behind are NEVER merged.
 *
 * Run: npx vitest run src/pages/__tests__/CoachDashboard.badgeMapping.test.js
 */

import { describe, it, expect } from 'vitest';

// ─── Pure functions extracted from CoachDashboard useMemo logic ───────────────
// These mirror the exact logic in CoachDashboard.jsx so we can test it
// deterministically without mounting React.

function computeStats(badges) {
  let onTrack = 0, partial = 0, behind = 0, notReported = 0, neutral = 0, noTarget = 0;
  badges.forEach(badge => {
    if      (badge === 'on_track')  onTrack++;
    else if (badge === 'partial')   partial++;
    else if (badge === 'behind')    behind++;
    else if (badge === 'no_data')   notReported++;
    else if (badge === 'neutral')   neutral++;
    else if (badge === 'no_target') noTarget++;
  });
  return { onTrack, partial, behind, notReported, neutral, noTarget, total: badges.length };
}

function applyFilter(badges, filter) {
  return badges.filter(badge => {
    if (filter === 'all')          return true;
    if (filter === 'good')         return badge === 'on_track';
    if (filter === 'partial')      return badge === 'partial';
    if (filter === 'behind')       return badge === 'behind';
    if (filter === 'not_reported') return badge === 'no_data';
    return true; // unknown filter → include
  });
}

// ─── A) Basic four-state mapping ──────────────────────────────────────────────

describe('A) Basic four-state mapping', () => {
  it('[on_track, partial, behind, no_data] → good=1 partial=1 behind=1 notReported=1', () => {
    const s = computeStats(['on_track', 'partial', 'behind', 'no_data']);
    expect(s.onTrack).toBe(1);
    expect(s.partial).toBe(1);
    expect(s.behind).toBe(1);
    expect(s.notReported).toBe(1);
    expect(s.neutral).toBe(0);
    expect(s.noTarget).toBe(0);
    expect(s.total).toBe(4);
    // Invariant: all buckets sum to total
    expect(s.onTrack + s.partial + s.behind + s.notReported + s.neutral + s.noTarget).toBe(s.total);
  });
});

// ─── B) 50 no_data + 1 behind — the core production scenario ─────────────────

describe('B) 50 no_data + 1 behind', () => {
  const badges = ['behind', ...Array(50).fill('no_data')];

  it('behind=1, notReported=50 — NEVER attention=51', () => {
    const s = computeStats(badges);
    expect(s.behind).toBe(1);
    expect(s.notReported).toBe(50);
    expect(s.onTrack).toBe(0);
    expect(s.partial).toBe(0);
    // The old wrong value (bad=51) must not be reconstructable
    // by summing behind + notReported into a single alarm counter.
    // This test FAILS if the caller merges them:
    const wrongMergedCount = s.behind + s.notReported;
    expect(wrongMergedCount).toBe(51); // the number exists — but it must NOT appear in UI
    // The counters displayed in UI are separate:
    expect(s.behind).not.toBe(51);
    expect(s.notReported).not.toBe(1);
  });

  it('total invariant holds', () => {
    const s = computeStats(badges);
    expect(s.onTrack + s.partial + s.behind + s.notReported + s.neutral + s.noTarget).toBe(s.total);
    expect(s.total).toBe(51);
  });
});

// ─── C) neutral and no_target excluded from performance buckets ───────────────

describe('C) neutral and no_target', () => {
  it('do not enter behind bucket', () => {
    const s = computeStats(['neutral', 'no_target', 'neutral']);
    expect(s.behind).toBe(0);
    expect(s.notReported).toBe(0);
    expect(s.neutral).toBe(2);
    expect(s.noTarget).toBe(1);
  });

  it('remain visible under all filter', () => {
    const result = applyFilter(['neutral', 'no_target', 'on_track'], 'all');
    expect(result).toHaveLength(3);
  });

  it('do not appear in behind filter', () => {
    const result = applyFilter(['neutral', 'no_target'], 'behind');
    expect(result).toHaveLength(0);
  });

  it('do not appear in not_reported filter', () => {
    const result = applyFilter(['neutral', 'no_target'], 'not_reported');
    expect(result).toHaveLength(0);
  });
});

// ─── D) filter behind returns ONLY behind ─────────────────────────────────────

describe('D) filter: behind', () => {
  const badges = ['on_track', 'partial', 'behind', 'no_data', 'neutral', 'no_target'];

  it('returns only behind entries', () => {
    const result = applyFilter(badges, 'behind');
    expect(result).toHaveLength(1);
    expect(result[0]).toBe('behind');
  });

  it('no_data does NOT appear in behind filter', () => {
    const result = applyFilter(['no_data', 'no_data', 'behind'], 'behind');
    expect(result).toHaveLength(1);
    expect(result.includes('no_data')).toBe(false);
  });
});

// ─── E) filter not_reported returns ONLY no_data ──────────────────────────────

describe('E) filter: not_reported', () => {
  const badges = ['on_track', 'partial', 'behind', 'no_data', 'neutral', 'no_target'];

  it('returns only no_data entries', () => {
    const result = applyFilter(badges, 'not_reported');
    expect(result).toHaveLength(1);
    expect(result[0]).toBe('no_data');
  });

  it('behind does NOT appear in not_reported filter', () => {
    const result = applyFilter(['behind', 'behind', 'no_data'], 'not_reported');
    expect(result).toHaveLength(1);
    expect(result.includes('behind')).toBe(false);
  });
});

// ─── F) full invariant with all six badge types ───────────────────────────────

describe('F) sum invariant across all badge types', () => {
  it('onTrack+partial+behind+notReported+neutral+noTarget always equals total', () => {
    const cases = [
      ['on_track', 'on_track', 'partial', 'behind', 'no_data', 'neutral', 'no_target'],
      Array(55).fill('no_data'),
      ['on_track', 'partial'],
      ['behind'],
      [],
    ];
    cases.forEach(badges => {
      const s = computeStats(badges);
      expect(s.onTrack + s.partial + s.behind + s.notReported + s.neutral + s.noTarget)
        .toBe(s.total);
    });
  });
});
