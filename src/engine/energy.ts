// Energy (calorie) and macro calculations used when a phase is generated.
// The adaptive weekly adjustments live in adaptive.ts.

import type { EnergyPlan, Profile } from '../types';
import { roundTo } from '../lib/units';

/** Approximate energy content of 1 kg of body-weight change during a diet. */
export const KCAL_PER_KG = 7700;

/** Rate of loss is always kept inside this window (% of body weight per week). */
export const MIN_LOSS_PCT = 0.25;
export const MAX_LOSS_PCT = 1.0;

/** Lowest calorie target the app will ever set, by sex. */
export const ABSOLUTE_FLOOR = { male: 1500, female: 1200 } as const;

/**
 * Energy availability (calories left for the body after exercise, per kg of lean mass)
 * below ~30 kcal/kg is linked to hormonal and performance problems in endurance athletes.
 * The app never plans below 25 and warns below 30.
 */
export const EA_FLOOR = 25;
export const EA_WARN = 30;

/** Body-fat % estimate: entered value, else Relative Fat Mass from waist, else undefined. */
export function estimateBodyFatPct(p: Profile): number | undefined {
  if (p.bodyFatPct && p.bodyFatPct > 3 && p.bodyFatPct < 70) return p.bodyFatPct;
  if (p.waistCm && p.waistCm > 40) {
    const rfm = (p.sex === 'male' ? 64 : 76) - 20 * (p.heightCm / p.waistCm);
    if (rfm > 3 && rfm < 70) return rfm;
  }
  return undefined;
}

export function leanMassKg(p: Profile): number {
  const bf = estimateBodyFatPct(p);
  if (bf !== undefined) return p.weightKg * (1 - bf / 100);
  // Boer formula
  return p.sex === 'male'
    ? 0.407 * p.weightKg + 0.267 * p.heightCm - 19.2
    : 0.252 * p.weightKg + 0.473 * p.heightCm - 48.3;
}

export function bmr(p: Profile): { value: number; method: string } {
  const bf = estimateBodyFatPct(p);
  if (bf !== undefined) {
    const lbm = p.weightKg * (1 - bf / 100);
    return { value: 370 + 21.6 * lbm, method: 'Katch-McArdle (uses your lean mass)' };
  }
  const base = 10 * p.weightKg + 6.25 * p.heightCm - 5 * p.age;
  return { value: base + (p.sex === 'male' ? 5 : -161), method: 'Mifflin-St Jeor' };
}

/** Multiplier for everything except planned training (job, walking, fidgeting). */
export function lifestyleMultiplier(p: Profile): number {
  if (p.avgSteps && p.avgSteps > 0) {
    // Steps are the more objective measure when available.
    if (p.avgSteps < 4000) return 1.2;
    if (p.avgSteps < 7000) return 1.3;
    if (p.avgSteps < 10000) return 1.4;
    if (p.avgSteps < 13000) return 1.5;
    return 1.6;
  }
  return { sedentary: 1.2, light: 1.3, active: 1.45, very_active: 1.6 }[p.jobActivity];
}

/** Net extra calories from a lifting session (≈3.5 METs, minus resting). */
export function strengthSessionKcal(weightKg: number, minutes: number): number {
  return 2.5 * weightKg * (Math.min(minutes, 90) / 60);
}

/** Net extra calories from running (≈9.5 METs) or run/walk (≈6 METs). */
export function runKcal(weightKg: number, minutes: number, runWalk: boolean): number {
  const netMet = runWalk ? 5 : 8.5;
  return netMet * weightKg * (minutes / 60);
}

/** Reference weight for protein: current weight, unless BMI > 30 (then weight at BMI 27). */
export function proteinReferenceKg(p: Profile): number {
  const h = p.heightCm / 100;
  const bmi = p.weightKg / (h * h);
  return bmi > 30 ? 27 * h * h : p.weightKg;
}

export function proteinTarget(p: Profile): number {
  const bf = estimateBodyFatPct(p);
  const lean = bf !== undefined && bf < (p.sex === 'male' ? 15 : 23);
  // 2.0 g/kg sits mid-range of the 1.6–2.2 g/kg evidence; leaner dieters benefit from the top end.
  const gPerKg = lean ? 2.2 : 2.0;
  return roundTo(proteinReferenceKg(p) * gPerKg, 5);
}

export function macrosFor(kcal: number, proteinG: number, p: Profile): { fatG: number; carbG: number } {
  const ref = proteinReferenceKg(p);
  let fatG = Math.max(0.7 * ref, (0.25 * kcal) / 9);
  let carbG = (kcal - proteinG * 4 - fatG * 9) / 4;
  if (carbG < 50) {
    // Very low budget: drop fat toward 0.5 g/kg before starving carbs.
    fatG = Math.max(0.5 * ref, (kcal - proteinG * 4 - 50 * 4) / 9);
    carbG = Math.max(0, (kcal - proteinG * 4 - fatG * 9) / 4);
  }
  return { fatG: roundTo(fatG, 5), carbG: roundTo(carbG, 5) };
}

export function calorieFloor(p: Profile, exerciseKcalPerDay: number): number {
  const eaFloor = EA_FLOOR * leanMassKg(p) + exerciseKcalPerDay;
  return roundTo(Math.max(ABSOLUTE_FLOOR[p.sex], eaFloor), 10);
}

export function clampLossPct(pct: number): number {
  return Math.min(MAX_LOSS_PCT, Math.max(MIN_LOSS_PCT, pct));
}

export function computeEnergy(
  p: Profile,
  exerciseKcalPerDay: number,
  opts: { weeklyLossPct?: number; kcalOverride?: number; proteinOverride?: number } = {},
): EnergyPlan {
  const notes: string[] = [];
  const b = bmr(p);
  const mult = lifestyleMultiplier(p);
  const maintenance = b.value * mult + exerciseKcalPerDay;

  const lossPct = clampLossPct(opts.weeklyLossPct ?? p.weeklyLossPct);
  const plannedLossKg = (lossPct / 100) * p.weightKg;
  let deficit = (plannedLossKg * KCAL_PER_KG) / 7;

  // Never more than 25% below maintenance – bigger deficits cost muscle and run performance.
  const maxDeficit = 0.25 * maintenance;
  if (deficit > maxDeficit) {
    deficit = maxDeficit;
    notes.push('Deficit capped at 25% below maintenance to protect muscle and training quality.');
  }

  const floor = calorieFloor(p, exerciseKcalPerDay);
  let target = roundTo(maintenance - deficit, 10);
  if (target < floor) {
    target = floor;
    notes.push(
      `Target raised to your safety minimum of ${floor} kcal. Expect slightly slower loss than requested – that's deliberate.`,
    );
  }

  if (opts.kcalOverride) {
    target = roundTo(opts.kcalOverride, 10);
    if (target < floor) notes.push(`⚠️ Your manual target is below the recommended minimum of ${floor} kcal.`);
    notes.push('Calorie target set manually.');
  }

  const ea = (target - exerciseKcalPerDay) / leanMassKg(p);
  if (ea < EA_WARN) {
    notes.push(
      'Energy left over after training is on the low side. If you feel run-down, sleep badly or performance drops, eat closer to maintenance for a week.',
    );
  }

  const proteinG = opts.proteinOverride ? roundTo(opts.proteinOverride, 5) : proteinTarget(p);
  const { fatG, carbG } = macrosFor(target, proteinG, p);
  const actualDeficit = maintenance - target;

  return {
    bmr: Math.round(b.value),
    bmrMethod: b.method,
    lifestyleMultiplier: mult,
    exerciseKcalPerDay: Math.round(exerciseKcalPerDay),
    maintenanceKcal: roundTo(maintenance, 10),
    plannedLossKgPerWeek: Math.max(0, (actualDeficit * 7) / KCAL_PER_KG),
    deficitKcal: Math.round(actualDeficit),
    targetKcal: target,
    floorKcal: floor,
    proteinG,
    fatG,
    carbG,
    notes,
  };
}

/**
 * Daily calorie target with fuelling for that day's training: harder days get more
 * (mostly as carbs), rest days a bit less, and the weekly total stays the same.
 */
export function dayTarget(
  baseKcal: number,
  dayExerciseKcal: number,
  avgExerciseKcalPerDay: number,
  floor: number,
): number {
  const shifted = baseKcal + 0.8 * (dayExerciseKcal - avgExerciseKcalPerDay);
  return roundTo(Math.max(floor, shifted), 10);
}
