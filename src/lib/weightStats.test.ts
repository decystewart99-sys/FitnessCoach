import { describe, expect, it } from 'vitest';
import { computeWeightStats, streak } from './weightStats';
import { addDays } from './dates';
import type { WeightEntry } from '../types';

const START = '2026-10-12';

function series(days: number, startKg: number, perDay: number, skip: number[] = []): WeightEntry[] {
  const out: WeightEntry[] = [];
  for (let i = 0; i < days; i++) {
    if (skip.includes(i)) continue;
    out.push({ date: addDays(START, i), kg: startKg + perDay * i + (i % 2 ? 0.4 : -0.4) });
  }
  return out;
}

describe('weight stats', () => {
  it('reports a losing rate close to the real one', () => {
    const entries = series(42, 95, -0.07); // ≈ -0.49 kg/week
    const s = computeWeightStats(entries, { phaseStart: START, targetKg: 85, asOf: addDays(START, 41) });
    expect(s.ratePerWeek!).toBeLessThan(-0.3);
    expect(s.ratePerWeek!).toBeGreaterThan(-0.7);
    expect(s.change7!).toBeLessThan(0);
    expect(s.sinceStart!).toBeLessThan(0);
    expect(s.projectedGoalDate).toBeDefined();
  });

  it('trend tracks steady loss without lagging behind', () => {
    const entries = series(42, 95, -0.075);
    const s = computeWeightStats(entries, { asOf: addDays(START, 41) });
    const truth = 95 - 0.075 * 41;
    expect(Math.abs(s.trendNow! - truth)).toBeLessThan(0.3);
  });

  it('has no rate or projection with too little data', () => {
    const s = computeWeightStats(series(5, 90, -0.1), { targetKg: 80, asOf: addDays(START, 4) });
    expect(s.ratePerWeek).toBeUndefined();
    expect(s.projectedGoalDate).toBeUndefined();
    expect(s.change7).toBeUndefined();
  });

  it('counts the streak, tolerating today not logged yet', () => {
    const entries = series(10, 90, 0, [3]);
    expect(streak(entries, addDays(START, 9))).toBe(6);
    expect(streak(entries, addDays(START, 10))).toBe(6);
    expect(streak(entries, addDays(START, 12))).toBe(0);
  });
});
