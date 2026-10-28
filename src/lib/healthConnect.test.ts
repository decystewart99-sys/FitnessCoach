import { describe, expect, it } from 'vitest';
import { planSync, type HCDay, type HCRun } from './healthConnect';
import { generatePhase } from '../engine/phase';
import type { Profile, RunLog } from '../types';

const days: HCDay[] = [
  { date: '2026-10-26', kcal: 2140.4, proteinG: 162.6, carbG: 210.2, fatG: 70.1, steps: 9123, restingHr: 54, weightKg: 94.42, sleepMin: 431 },
  { date: '2026-10-27', steps: 4000 },
  { date: '2026-10-28', kcal: 0, weightKg: 94.1 },
];

const run = (over: Partial<HCRun> = {}): HCRun => ({
  id: 'hc-1',
  date: '2026-10-27',
  startTime: '2026-10-27T07:00:00Z',
  durationSec: 1900,
  distanceM: 5020,
  avgHr: 148.6,
  maxHr: 165,
  title: 'Leeds Running',
  origin: 'com.garmin.android.apps.connectmobile',
  treadmill: false,
  ...over,
});

describe('Health Connect sync planning', () => {
  it('maps food, health and weight', () => {
    const c = planSync(days, [], { weights: [], health: [], runs: [] }, undefined);
    expect(c.nutrition).toEqual([{ date: '2026-10-26', kcal: 2140, proteinG: 163, carbG: 210, fatG: 70 }]);
    expect(c.weights.map((w) => w.date)).toEqual(['2026-10-26', '2026-10-28']);
    expect(c.health.find((h) => h.date === '2026-10-26')).toEqual({ date: '2026-10-26', steps: 9123, restingHr: 54, sleepMin: 431 });
  });

  it('never overwrites a weigh-in you entered yourself, and merges health data', () => {
    const c = planSync(days, [], { weights: [{ date: '2026-10-26', kg: 95 }], health: [{ date: '2026-10-27', sleepMin: 400 }], runs: [] }, undefined);
    expect(c.weights.map((w) => w.date)).toEqual(['2026-10-28']);
    expect(c.health.find((h) => h.date === '2026-10-27')).toEqual({ date: '2026-10-27', steps: 4000, restingHr: undefined, sleepMin: 400 });
  });

  it('adds runs once, skipping duplicates and very short sessions', () => {
    const existingManual: RunLog = { date: '2026-10-27', kind: 'easy', distanceKm: 5.0, durationSec: 1905, source: 'manual' };
    expect(planSync([], [run()], { weights: [], health: [], runs: [existingManual] }, undefined).runs).toHaveLength(0);
    const first = planSync([], [run(), run({ id: 'hc-2', durationSec: 120 })], { weights: [], health: [], runs: [] }, undefined).runs;
    expect(first).toHaveLength(1);
    expect(first[0]).toMatchObject({ distanceKm: 5.02, durationSec: 1900, avgHr: 149, source: 'health', externalId: 'hc-1' });
    expect(planSync([], [run()], { weights: [], health: [], runs: first }, undefined).runs).toHaveLength(0);
  });

  it('attaches runs to the planned session that day', () => {
    const profile: Profile = {
      age: 35, sex: 'male', heightCm: 180, weightKg: 90, jobActivity: 'sedentary', goalRanking: ['run', 'fat', 'muscle'],
      weeklyLossPct: 0.5, runGoal: { kind: '10k' }, liftExperience: 'beginner', runContinuousMin: 30, trainingDays: [0, 1, 2, 3, 4, 5, 6],
      allowDoubles: false, sessionMinutes: 60, longRunDay: 6, equipment: 'gym', homeEquipment: [], injuries: [], injuryNotes: '',
      mealsPerDay: 3, nutritionMode: 'calories_protein',
    };
    const phase = generatePhase(profile, { startDate: '2026-10-26' });
    const runDay = phase.template.findIndex((d) => d.sessions.some((s) => s.type === 'run'));
    const date = ['2026-10-26', '2026-10-27', '2026-10-28', '2026-10-29', '2026-10-30', '2026-10-31', '2026-11-01'][runDay];
    const [r] = planSync([], [run({ date })], { weights: [], health: [], runs: [] }, phase).runs;
    expect(r.sessionId).toBeDefined();
  });
});
