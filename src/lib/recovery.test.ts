import { describe, expect, it } from 'vitest';
import { recoverySignals, sleepScore } from './recovery';
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

describe('sleep score', () => {
  it('rewards a long night with plenty of deep and REM sleep and little time awake', () => {
    const s = sleepScore({ date: 'x', sleepMin: 480, sleepDeepMin: 90, sleepRemMin: 110, sleepLightMin: 280, sleepAwakeMin: 15 })!;
    expect(s.score).toBe(100);
    expect(s.label).toBe('Good');
    expect(s.usedStages).toBe(true);
  });

  it('marks a short, broken night as poor', () => {
    const s = sleepScore({ date: 'x', sleepMin: 330, sleepDeepMin: 30, sleepRemMin: 40, sleepLightMin: 260, sleepAwakeMin: 55 })!;
    expect(s.score).toBeLessThan(60);
    expect(s.label).toBe('Poor');
  });

  it('falls back to duration only when there are no stages', () => {
    const s = sleepScore({ date: 'x', sleepMin: 420 })!;
    expect(s.usedStages).toBe(false);
    expect(s.score).toBe(80);
    expect(sleepScore({ date: 'x' })).toBeUndefined();
  });
});
