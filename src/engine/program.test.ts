import { describe, expect, it } from 'vitest';
import type { Profile } from '../types';
import { generatePhase } from './phase';
import { buildProgram, exerciseHistory, isStalled, nextTarget, plannedWeeklySets, sessionMinutes, type WorkoutLog } from './program';
import { EXERCISE_BY_ID } from './exercises';

const base: Profile = {
  age: 35, sex: 'male', heightCm: 180, weightKg: 90, jobActivity: 'sedentary',
  goalRanking: ['fat', 'run', 'muscle'], weeklyLossPct: 0.5, runGoal: { kind: '5k' },
  liftExperience: 'intermediate', runContinuousMin: 30, trainingDays: [0, 1, 2, 3, 4, 5], allowDoubles: true,
  sessionMinutes: 60, longRunDay: 5, equipment: 'gym', homeEquipment: [], injuries: [], injuryNotes: '',
  mealsPerDay: 3, nutritionMode: 'calories_protein',
};
const START = '2026-10-12';
const fmt = (kg: number) => `${kg} kg`;
const opts = { incrementKg: 2.5, roundKg: (kg: number) => Math.round(kg * 2) / 2, fmt };

describe('program builder', () => {
  it('builds every strength session within the time available', () => {
    for (const minutes of [45, 60, 75]) {
      const phase = generatePhase({ ...base, sessionMinutes: minutes }, { startDate: START });
      const program = buildProgram(phase);
      expect(program.length).toBe(phase.strength.sessions.length);
      for (const s of program) {
        expect(s.exercises.length).toBeGreaterThanOrEqual(3);
        expect(sessionMinutes(s)).toBeLessThanOrEqual(minutes + 1);
      }
    }
  });

  it('gives A and B days different main lifts', () => {
    const phase = generatePhase({ ...base, goalRanking: ['muscle', 'fat', 'run'] }, { startDate: START });
    const program = buildProgram(phase);
    const uppers = program.filter((s) => s.kind === 'upper');
    expect(uppers.length).toBe(2);
    expect(uppers[0].exercises[0].exerciseId).not.toBe(uppers[1].exercises[0].exerciseId);
  });

  it('avoids exercises that load an injured area when there is an alternative', () => {
    const phase = generatePhase({ ...base, injuries: ['lower_back', 'knee'] }, { startDate: START });
    for (const s of buildProgram(phase)) for (const ex of s.exercises) {
      expect(ex.risky).toBe(false);
      expect(EXERCISE_BY_ID[ex.exerciseId].stress).not.toContain('lower_back');
    }
  });

  it('works with bodyweight only', () => {
    const phase = generatePhase({ ...base, equipment: 'bodyweight' }, { startDate: START });
    const program = buildProgram(phase);
    for (const s of program) {
      expect(s.exercises.length).toBeGreaterThanOrEqual(3);
      for (const ex of s.exercises) expect(EXERCISE_BY_ID[ex.exerciseId].equipment.some((c) => c.includes('none'))).toBe(true);
    }
  });

  it('respects a swap', () => {
    const phase = generatePhase(base, { startDate: START });
    const first = buildProgram(phase)[0].exercises[0];
    const swapped = buildProgram(phase, { [first.slot]: first.alternatives[0] })[0].exercises[0];
    expect(swapped.exerciseId).toBe(first.alternatives[0]);
  });

  it('plans roughly the weekly set targets', () => {
    const phase = generatePhase({ ...base, sessionMinutes: 75 }, { startDate: START });
    const planned = plannedWeeklySets(buildProgram(phase));
    expect(planned.chest).toBeGreaterThanOrEqual(phase.strength.weeklySets.chest * 0.6);
    expect(planned.quads).toBeGreaterThan(0);
  });
});

function log(date: string, exerciseId: string, sets: Array<[number, number]>): WorkoutLog {
  return {
    date,
    label: 'test',
    startedAt: date + 'T10:00',
    finishedAt: date + 'T11:00',
    exercises: [{ exerciseId, repMin: 6, repMax: 10, rir: 2, restSec: 180, sets: sets.map(([w, r]) => ({ weightKg: w, reps: r, done: true })) }],
  };
}

describe('double progression', () => {
  const bench = EXERCISE_BY_ID.bench;
  const plan = { sets: 3, repMin: 6, repMax: 10, rir: 2 };

  it('adds weight after hitting the top of the range on every set', () => {
    const h = exerciseHistory([log('2026-10-01', 'bench', [[60, 10], [60, 10], [60, 10]])], 'bench');
    const t = nextTarget(bench, plan, h, opts);
    expect(t.kind).toBe('increase');
    expect(t.weightKg).toBe(62.5);
    expect(t.reps).toEqual([6, 6, 6]);
  });

  it('adds reps otherwise', () => {
    const h = exerciseHistory([log('2026-10-01', 'bench', [[60, 9], [60, 8], [60, 7]])], 'bench');
    const t = nextTarget(bench, plan, h, opts);
    expect(t.kind).toBe('reps');
    expect(t.weightKg).toBe(60);
    expect(t.reps).toEqual([10, 9, 8]);
  });

  it('drops the weight when reps fall below the range', () => {
    const h = exerciseHistory([log('2026-10-01', 'bench', [[80, 4], [80, 3], [80, 3]])], 'bench');
    expect(nextTarget(bench, plan, h, opts).kind).toBe('decrease');
  });

  it('flags a stall after three sessions without a new best', () => {
    const logs = [
      log('2026-09-01', 'bench', [[60, 10], [60, 9], [60, 8]]),
      log('2026-09-05', 'bench', [[60, 9], [60, 9], [60, 8]]),
      log('2026-09-09', 'bench', [[60, 9], [60, 8], [60, 8]]),
      log('2026-09-13', 'bench', [[60, 10], [60, 8], [60, 7]]),
    ];
    expect(isStalled(exerciseHistory(logs, 'bench'))).toBe(true);
    expect(isStalled(exerciseHistory([...logs, log('2026-09-17', 'bench', [[62.5, 10]])], 'bench'))).toBe(false);
  });

  it('keeps the weight but cuts effort in a deload', () => {
    const h = exerciseHistory([log('2026-10-01', 'bench', [[60, 10], [60, 10], [60, 10]])], 'bench');
    const t = nextTarget(bench, plan, h, { ...opts, deload: true });
    expect(t.kind).toBe('deload');
    expect(t.weightKg).toBe(60);
  });
});
