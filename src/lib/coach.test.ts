import { describe, expect, it } from 'vitest';
import type { NutritionEntry, Profile, WeightEntry } from '../types';
import { generatePhase } from '../engine/phase';
import { applyCheckin, buildReview, checkinDue } from './checkin';
import { findMissed, withMove } from './reschedule';
import { sessionsOn } from './plan';
import { addDays } from './dates';
import type { WorkoutLog } from '../engine/program';

const profile: Profile = {
  age: 35, sex: 'male', heightCm: 180, weightKg: 95, jobActivity: 'sedentary', goalRanking: ['fat', 'run', 'muscle'],
  weeklyLossPct: 0.5, runGoal: { kind: '5k' }, liftExperience: 'intermediate', runContinuousMin: 30, recent5kSec: 1700,
  trainingDays: [0, 1, 3, 5, 6], allowDoubles: false, sessionMinutes: 60, longRunDay: 6, equipment: 'gym', homeEquipment: [],
  injuries: [], injuryNotes: '', mealsPerDay: 3, nutritionMode: 'calories_protein',
};
const START = '2026-10-12'; // Monday
const phase = { ...generatePhase(profile, { startDate: START }), id: 1 };

function history(days: number, intake: number, trueTdee: number) {
  const weights: WeightEntry[] = [];
  const nutrition: NutritionEntry[] = [];
  let kg = 95;
  for (let i = 0; i < days; i++) {
    const date = addDays(START, i);
    kg += (intake - trueTdee) / 7700;
    weights.push({ date, kg: kg + Math.sin(i * 1.7) * 0.5 });
    nutrition.push({ date, kcal: intake, proteinG: 180 });
  }
  return { weights, nutrition };
}

describe('weekly check-in', () => {
  it('is due from week 2 and not after it is done', () => {
    expect(checkinDue(phase, addDays(START, 3), []).due).toBe(false);
    const due = checkinDue(phase, addDays(START, 8), []);
    expect(due.due).toBe(true);
    expect(due.weekIndex).toBe(2);
    expect(checkinDue(phase, addDays(START, 8), [{ week: due.weekStart, phaseId: 1 } as never]).due).toBe(false);
  });

  it('re-estimates maintenance and applies the new target to the rest of the phase', () => {
    const { weights, nutrition } = history(28, phase.energy.targetKcal, phase.energy.maintenanceKcal + 300);
    const review = buildReview({ phase, today: addDays(START, 28), checkins: [], weights, nutrition, workouts: [], runs: [] });
    expect(review.weekIndex).toBe(5);
    expect(review.coach.ok).toBe(true);
    expect(review.coach.tdee).toBeGreaterThan(phase.energy.maintenanceKcal);
    const applied = applyCheckin(phase, review, []);
    expect(applied.weeks[3].kcalTarget).toBe(phase.weeks[3].kcalTarget); // past week untouched
    for (const w of applied.weeks.slice(4)) {
      expect(w.kcalTarget).toBe(w.tags.includes('diet_break') ? review.coach.tdee : review.coach.newTarget);
    }
    expect(applied.energy.targetKcal).toBe(review.coach.newTarget);
  });

  it('adds a deload or diet break to the current week when accepted', () => {
    const { weights, nutrition } = history(21, phase.energy.targetKcal, phase.energy.maintenanceKcal);
    const review = buildReview({ phase, today: addDays(START, 21), checkins: [], weights, nutrition, workouts: [], runs: [] });
    const applied = applyCheckin(phase, review, ['deload', 'diet_break']);
    expect(applied.weeks[3].tags).toEqual(expect.arrayContaining(['deload', 'diet_break']));
    expect(applied.weeks[3].kcalTarget).toBe(review.coach.tdee);
    expect(applied.weeks[4].kcalTarget).toBe(review.coach.newTarget);
  });

  it('suggests a deload when several lifts go backwards', () => {
    const w = (date: string, sets: Array<[string, number]>): WorkoutLog => ({
      date,
      label: 'x',
      startedAt: date,
      finishedAt: date,
      exercises: sets.map(([id, kg]) => ({ exerciseId: id, repMin: 6, repMax: 10, rir: 2, restSec: 120, sets: [{ weightKg: kg, reps: 8, done: true }] })),
    });
    const workouts = [
      w(addDays(START, 14), [['bench', 80], ['leg_press', 150], ['pulldown', 60]]),
      w(addDays(START, 18), [['bench', 75], ['leg_press', 140], ['pulldown', 55]]),
    ];
    const review = buildReview({ phase, today: addDays(START, 21), checkins: [], weights: [], nutrition: [], workouts, runs: [] });
    expect(review.lifts.down.length).toBe(3);
    expect(review.suggestDeload).toBe(true);
  });
});

describe('missed sessions', () => {
  it('finds missed sessions and suggests a day that does not clash', () => {
    const today = addDays(START, 3); // Thursday of week 1
    const missed = findMissed(phase, today, new Set());
    expect(missed.length).toBeGreaterThan(0);
    for (const m of missed) {
      if (!m.suggestion) continue;
      expect(m.suggestion >= today).toBe(true);
      const day = sessionsOn(phase, m.suggestion).sessions.map((s) => s.session);
      expect(day.some((s) => s.type === m.session.type)).toBe(false);
    }
  });

  it('moving or skipping a session updates the schedule', () => {
    const today = addDays(START, 3);
    const [m] = findMissed(phase, today, new Set());
    const target = m.suggestion ?? today;
    const moved = withMove(phase, m.weekIndex, m.session.id, target);
    expect(sessionsOn(moved, m.due).sessions.some((s) => s.session.id === m.session.id)).toBe(false);
    expect(sessionsOn(moved, target).sessions.some((s) => s.session.id === m.session.id)).toBe(true);
    const skipped = withMove(phase, m.weekIndex, m.session.id, 'skip');
    expect(findMissed(skipped, today, new Set()).some((x) => x.session.id === m.session.id)).toBe(false);
  });
});
