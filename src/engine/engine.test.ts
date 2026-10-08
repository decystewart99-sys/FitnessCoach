import { describe, expect, it } from 'vitest';
import type { Profile, WeightEntry, NutritionEntry } from '../types';
import { bmr, computeEnergy, dayTarget, ABSOLUTE_FLOOR } from './energy';
import { generatePhase } from './phase';
import { scoreTemplate } from './schedule';
import { weeklyCheckIn, weightTrend } from './adaptive';
import { addDays } from '../lib/dates';

const base: Profile = {
  age: 35,
  sex: 'male',
  heightCm: 180,
  weightKg: 90,
  jobActivity: 'sedentary',
  goalRanking: ['fat', 'run', 'muscle'],
  weeklyLossPct: 0.75,
  runGoal: { kind: '5k' },
  liftExperience: 'beginner',
  runContinuousMin: 0,
  trainingDays: [0, 1, 3, 5, 6],
  allowDoubles: false,
  sessionMinutes: 60,
  longRunDay: 6,
  equipment: 'gym',
  homeEquipment: [],
  injuries: [],
  injuryNotes: '',
  mealsPerDay: 3,
  nutritionMode: 'calories_protein',
};

const START = '2026-10-12'; // a Monday

describe('energy', () => {
  it('Mifflin-St Jeor matches the textbook value', () => {
    expect(Math.round(bmr(base).value)).toBe(1855); // 900 + 1125 - 175 + 5
  });

  it('applies a deficit, a floor, and protein in the 1.6–2.2 g/kg range', () => {
    const e = computeEnergy(base, 300);
    expect(e.targetKcal).toBeLessThan(e.maintenanceKcal);
    expect(e.targetKcal).toBeGreaterThanOrEqual(e.floorKcal);
    expect(e.proteinG / 90).toBeGreaterThanOrEqual(1.6);
    expect(e.proteinG / 90).toBeLessThanOrEqual(2.2);
    expect(e.proteinG * 4 + e.fatG * 9 + e.carbG * 4).toBeLessThan(e.targetKcal + 40);
  });

  it('never goes below the absolute floor even when asked to', () => {
    const tiny: Profile = { ...base, sex: 'female', weightKg: 50, heightCm: 155, age: 60, weeklyLossPct: 1 };
    const e = computeEnergy(tiny, 0);
    expect(e.targetKcal).toBeGreaterThanOrEqual(ABSOLUTE_FLOOR.female);
  });

  it('keeps the weekly total when shifting calories to training days', () => {
    const avg = 300;
    const days = [600, 0, 300, 0, 600, 300, 300];
    const total = days.reduce((a, d) => a + dayTarget(2200, d, avg, 1500), 0);
    expect(Math.abs(total - 2200 * 7)).toBeLessThanOrEqual(70);
  });
});

describe('phase generation', () => {
  it('builds a complete phase for a beginner runner', () => {
    const phase = generatePhase(base, { startDate: START });
    expect(phase.lengthWeeks).toBeGreaterThanOrEqual(6);
    expect(phase.weeks).toHaveLength(phase.lengthWeeks);
    // Beginner who can't run yet starts with run/walk
    const firstRuns = Object.values(phase.weeks[0].runs);
    expect(firstRuns.every((r) => r.kind === 'runwalk')).toBe(true);
    // Long run on the preferred day
    expect(phase.template[6].sessions.some((s) => s.runSlot === 'long')).toBe(true);
    // Only training days are used
    for (const d of phase.template) if (!base.trainingDays.includes(d.day)) expect(d.sessions).toHaveLength(0);
  });

  it('never increases running by much more than 10% between normal weeks', () => {
    const phase = generatePhase({ ...base, runContinuousMin: 30, weeklyRunKm: 15 }, { startDate: START, lengthWeeks: 16 });
    for (let i = 1; i < phase.weeks.length; i++) {
      const prev = phase.weeks[i - 1];
      const cur = phase.weeks[i];
      if (prev.tags.length || cur.tags.length) continue;
      // rounding to 5-min chunks allows a little slack
      expect(cur.runMinutes).toBeLessThanOrEqual(prev.runMinutes * 1.1 + 10);
    }
  });

  it('keeps heavy leg days away from the day before the long run', () => {
    const p: Profile = { ...base, goalRanking: ['muscle', 'run', 'fat'], liftExperience: 'intermediate', trainingDays: [0, 1, 2, 3, 4, 5, 6], allowDoubles: true };
    const phase = generatePhase(p, { startDate: START });
    const longDay = phase.template.findIndex((d) => d.sessions.some((s) => s.runSlot === 'long'));
    const before = phase.template[(longDay + 6) % 7].sessions;
    expect(before.some((s) => s.strengthKind === 'lower' || s.strengthKind === 'legs')).toBe(false);
    expect(scoreTemplate(phase.template).penalty).toBeLessThan(40);
  });

  it('ends the phase with the race when the race date is within 16 weeks', () => {
    const phase = generatePhase({ ...base, runContinuousMin: 30, runGoal: { kind: '10k', raceDate: addDays(START, 7 * 9 + 5) } }, { startDate: START });
    expect(phase.lengthWeeks).toBe(10);
    expect(phase.weeks[9].tags).toContain('race');
    expect(phase.weeks[8].tags).toContain('taper');
  });

  it('works with only three days and no doubles', () => {
    const phase = generatePhase({ ...base, trainingDays: [0, 2, 4], longRunDay: undefined }, { startDate: START });
    const total = phase.template.reduce((a, d) => a + d.sessions.length, 0);
    expect(total).toBe(3);
  });
});

describe('adaptive coach', () => {
  function simulate(days: number, intake: number, trueTdee: number, startKg = 90) {
    const weights: WeightEntry[] = [];
    const nutrition: NutritionEntry[] = [];
    let kg = startKg;
    for (let i = 0; i < days; i++) {
      const date = addDays(START, i);
      kg += (intake - trueTdee) / 7700;
      const noise = Math.sin(i * 1.7) * 0.6; // water fluctuation
      weights.push({ date, kg: kg + noise });
      nutrition.push({ date, kcal: intake, proteinG: 180 });
    }
    return { weights, nutrition };
  }

  it('smooths daily noise into a trend', () => {
    const { weights } = simulate(28, 2200, 2700);
    const t = weightTrend(weights);
    const rawSwing = Math.max(...weights.map((w) => w.kg)) - Math.min(...weights.map((w) => w.kg));
    const trendSwing = t[0].trend - t[t.length - 1].trend;
    expect(trendSwing).toBeGreaterThan(0);
    expect(trendSwing).toBeLessThan(rawSwing);
  });

  it('moves the TDEE estimate toward the truth', () => {
    const { weights, nutrition } = simulate(28, 2200, 2700);
    const r = weeklyCheckIn({
      asOf: addDays(START, 28),
      weights,
      nutrition,
      previousTdee: 2400,
      previousTarget: 2200,
      plannedLossPct: 0.5,
      floorKcal: 1800,
      stalledWeeks: 0,
      daysIntoPhase: 28,
      dietBreakNextWeek: false,
    });
    expect(r.ok).toBe(true);
    expect(r.tdee).toBeGreaterThan(2400);
    expect(Math.abs(r.change)).toBeLessThanOrEqual(150);
  });

  it('suggests a diet break instead of cutting harder after repeated stalls', () => {
    const { weights, nutrition } = simulate(28, 2200, 2200);
    const r = weeklyCheckIn({
      asOf: addDays(START, 28),
      weights,
      nutrition,
      previousTdee: 2700,
      previousTarget: 2200,
      plannedLossPct: 0.5,
      floorKcal: 1800,
      stalledWeeks: 1,
      daysIntoPhase: 28,
      dietBreakNextWeek: false,
    });
    expect(r.stalled).toBe(true);
    expect(r.suggestion).toBe('diet_break');
    expect(r.change).toBeGreaterThanOrEqual(-50);
  });

  it('holds targets when there is not enough data', () => {
    const r = weeklyCheckIn({
      asOf: addDays(START, 21),
      weights: [],
      nutrition: [],
      previousTdee: 2600,
      previousTarget: 2100,
      plannedLossPct: 0.5,
      floorKcal: 1800,
      stalledWeeks: 0,
      daysIntoPhase: 21,
      dietBreakNextWeek: false,
    });
    expect(r.ok).toBe(false);
    expect(r.newTarget).toBe(2100);
  });
});
