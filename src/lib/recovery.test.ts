import { describe, expect, it } from 'vitest';
import { recoverySignals } from './recovery';
import { addDays } from './dates';
import type { HealthDay } from '../types';

const AS_OF = '2026-11-02';
const series = (rhrRecent: number, sleepRecent: number): HealthDay[] =>
  Array.from({ length: 35 }, (_, i) => {
    const date = addDays(AS_OF, -35 + i);
    const recent = i >= 28;
    return { date, steps: 8000, restingHr: recent ? rhrRecent : 52, sleepMin: recent ? sleepRecent : 450 };
  });

describe('recovery signals', () => {
  it('flags resting HR 5+ above baseline and short sleep', () => {
    const s = recoverySignals(series(59, 360), AS_OF);
    expect(s.rhrElevated).toBe(true);
    expect(s.shortSleep).toBe(true);
    expect(s.notes).toHaveLength(2);
  });

  it('stays quiet when things are normal', () => {
    const s = recoverySignals(series(53, 440), AS_OF);
    expect(s.rhrElevated).toBe(false);
    expect(s.shortSleep).toBe(false);
    expect(s.notes).toHaveLength(0);
    expect(s.steps7).toBe(8000);
  });

  it('needs enough data before judging', () => {
    expect(recoverySignals(series(70, 300).slice(-2), AS_OF).notes).toHaveLength(0);
  });
});
