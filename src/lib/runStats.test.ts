import { describe, expect, it } from 'vitest';
import type { Profile, RunLog } from '../types';
import { bestEfforts, easyPaceSeries, fiveKEquivalent, longestRun, pace, phaseWithNew5k, predictTime, weeklyTotals } from './runStats';
import { generatePhase } from '../engine/phase';

const run = (date: string, km: number | undefined, min: number, kind: RunLog['kind'] = 'easy'): RunLog => ({ date, distanceKm: km, durationSec: min * 60, kind, source: 'manual' });

describe('run stats', () => {
  const runs = [
    run('2026-10-05', 5, 35),
    run('2026-10-07', 3, 20, 'intervals'),
    run('2026-10-11', 8, 56, 'long'),
    run('2026-10-13', 5.2, 31, 'timetrial'),
    run('2026-10-14', undefined, 30, 'runwalk'),
  ];

  it('totals weeks including empty ones', () => {
    const w = weeklyTotals(runs, '2026-10-14', 4);
    expect(w).toHaveLength(4);
    expect(w[0].km).toBe(0);
    expect(w[2].km).toBeCloseTo(16); // week of Oct 5
    expect(w[3].km).toBeCloseTo(5.2);
    expect(w[3].runs).toBe(2);
  });

  it('computes pace, easy-pace series and longest run', () => {
    expect(pace(runs[0])).toBe(420);
    expect(pace(runs[4])).toBeUndefined();
    expect(easyPaceSeries(runs).map((p) => p.date)).toEqual(['2026-10-05', '2026-10-11']);
    expect(longestRun(runs)?.distanceKm).toBe(8);
  });

  it('finds best efforts only from runs covering the distance', () => {
    const b = bestEfforts(runs);
    const fiveK = b.find((x) => x.label === '5 km')!;
    expect(fiveK.sec).toBeCloseTo((31 * 60 * 5) / 5.2);
    expect(b.find((x) => x.label === '10 km')!.sec).toBeUndefined();
  });

  it('predicts with Riegel and converts time trials to a 5k equivalent', () => {
    expect(predictTime(1500, 5, 10)).toBeCloseTo(3127, -1);
    expect(fiveKEquivalent(runs[3])).toBeCloseTo(predictTime(1860, 5.2, 5));
    expect(fiveKEquivalent(runs[0])).toBeUndefined(); // easy runs don't count
  });
});

describe('updating paces from a time trial', () => {
  const profile: Profile = {
    age: 35, sex: 'male', heightCm: 180, weightKg: 90, jobActivity: 'sedentary', goalRanking: ['run', 'fat', 'muscle'],
    weeklyLossPct: 0.5, runGoal: { kind: '10k' }, liftExperience: 'beginner', runContinuousMin: 30, recent5kSec: 1800,
    trainingDays: [0, 2, 4, 6], allowDoubles: false, sessionMinutes: 60, longRunDay: 6, equipment: 'gym', homeEquipment: [],
    injuries: [], injuryNotes: '', mealsPerDay: 3, nutritionMode: 'calories_protein',
  };

  it('changes future paces but not volume or past weeks', () => {
    const phase = generatePhase(profile, { startDate: '2026-10-12' });
    const updated = phaseWithNew5k(phase, 1680, '2026-10-26'); // week 3
    expect(updated.profile.recent5kSec).toBe(1680);
    for (let i = 0; i < phase.weeks.length; i++) {
      expect(updated.weeks[i].runMinutes).toBe(phase.weeks[i].runMinutes);
      const before = Object.values(phase.weeks[i].runs).find((r) => r.kind === 'easy' || r.kind === 'long');
      const after = Object.values(updated.weeks[i].runs).find((r) => r.kind === 'easy' || r.kind === 'long');
      if (!before?.pace || !after?.pace) continue;
      if (i < 2) expect(after.pace.lo).toBe(before.pace.lo);
      else expect(after.pace.lo).toBeLessThan(before.pace.lo); // faster
    }
  });
});
