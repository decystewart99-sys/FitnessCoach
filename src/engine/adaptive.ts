// The adaptive "coach": smooths daily weigh-ins into a trend, estimates real maintenance
// (TDEE) from logged intake vs trend change, and sets next week's calorie target.

import type { NutritionEntry, WeightEntry } from '../types';
import { addDays, daysBetween } from '../lib/dates';
import { KCAL_PER_KG, MAX_LOSS_PCT } from './energy';
import { roundTo } from '../lib/units';

/** Level smoothing per day: ~the last 1–2 weeks of weigh-ins dominate. */
export const TREND_ALPHA = 0.12;
/** Slope smoothing per day: the rate of change adapts slowly so noise doesn't swing it. */
export const TREND_BETA = 0.08;

export interface TrendPoint {
  date: string;
  kg: number;
  trend: number;
}

/**
 * Smoothed weight trend using Holt's linear (double exponential) smoothing, which tracks the
 * rate of change as well as the level. A plain moving average lags about a week behind
 * during steady loss and overstates current weight; this doesn't. Copes with missed days.
 */
export function weightTrend(entries: WeightEntry[], alpha = TREND_ALPHA, beta = TREND_BETA): TrendPoint[] {
  const sorted = [...entries].sort((a, b) => a.date.localeCompare(b.date));
  const out: TrendPoint[] = [];
  let level: number | undefined;
  let slope = 0; // kg per day
  let prevDate: string | undefined;
  for (const e of sorted) {
    if (level === undefined || prevDate === undefined) {
      level = e.kg;
    } else {
      const gap = Math.max(1, daysBetween(prevDate, e.date));
      const a = 1 - Math.pow(1 - alpha, gap);
      const b = 1 - Math.pow(1 - beta, gap);
      const predicted = level + slope * gap;
      const next = predicted + a * (e.kg - predicted);
      slope = slope + b * ((next - level) / gap - slope);
      level = next;
    }
    prevDate = e.date;
    out.push({ date: e.date, kg: e.kg, trend: level });
  }
  return out;
}

/** Trend value on a given day (last known trend on or before it). */
export function trendOn(points: TrendPoint[], date: string): number | undefined {
  let v: number | undefined;
  for (const p of points) {
    if (p.date > date) break;
    v = p.trend;
  }
  return v;
}

export interface CoachInput {
  /** First day of the week being planned (check-in day). Data before this date is used. */
  asOf: string;
  weights: WeightEntry[];
  nutrition: NutritionEntry[];
  /** Previous maintenance estimate (initially the formula estimate from phase setup). */
  previousTdee: number;
  previousTarget: number;
  /** Planned loss rate, % of body weight per week. */
  plannedLossPct: number;
  floorKcal: number;
  /** Consecutive previous check-ins where weight loss stalled. */
  stalledWeeks: number;
  /** Days since the phase started – the first ~2 weeks include water/glycogen loss. */
  daysIntoPhase: number;
  dietBreakNextWeek: boolean;
}

export type CoachSuggestion = 'diet_break' | 'none';

export interface CoachResult {
  ok: boolean;
  tdee: number;
  observedTdee?: number;
  confidence: 'low' | 'medium' | 'high';
  observedLossKgPerWeek?: number;
  observedLossPct?: number;
  avgIntake?: number;
  loggedDays: number;
  weighIns: number;
  newTarget: number;
  change: number;
  stalled: boolean;
  suggestion: CoachSuggestion;
  reasons: string[];
}

const WINDOW_DAYS = 21;
const MIN_FOOD_DAYS = 10;
const MIN_WEIGH_INS = 8;
const MAX_WEEKLY_CHANGE = 150;

export function weeklyCheckIn(c: CoachInput): CoachResult {
  const reasons: string[] = [];
  const windowDays = Math.min(WINDOW_DAYS, Math.max(7, c.daysIntoPhase));
  const start = addDays(c.asOf, -windowDays);
  const end = addDays(c.asOf, -1);

  const food = c.nutrition.filter((n) => n.date >= start && n.date <= end && n.kcal > 0);
  const weighIns = c.weights.filter((w) => w.date >= start && w.date <= end);
  const points = weightTrend(c.weights.filter((w) => w.date <= end));
  const trendStart = trendOn(points, start) ?? points.find((p) => p.date >= start)?.trend;
  const trendEnd = trendOn(points, end);

  const base: CoachResult = {
    ok: false,
    tdee: c.previousTdee,
    confidence: 'low',
    loggedDays: food.length,
    weighIns: weighIns.length,
    newTarget: c.dietBreakNextWeek ? roundTo(c.previousTdee, 10) : c.previousTarget,
    change: 0,
    stalled: false,
    suggestion: 'none',
    reasons,
  };

  if (food.length < Math.min(MIN_FOOD_DAYS, windowDays - 2) || weighIns.length < Math.min(MIN_WEIGH_INS, windowDays - 3) || trendStart === undefined || trendEnd === undefined) {
    reasons.push(
      `Not enough data yet to re-estimate your maintenance (${food.length} days of food and ${weighIns.length} weigh-ins in the last ${windowDays} days). Targets stay the same – keep logging and the coach will adjust next week.`,
    );
    if (c.dietBreakNextWeek) base.change = base.newTarget - c.previousTarget;
    return base;
  }

  const avgIntake = food.reduce((a, n) => a + n.kcal, 0) / food.length;
  const days = Math.max(1, daysBetween(start, end));
  const trendChange = trendEnd - trendStart;
  const observedTdee = avgIntake - (trendChange * KCAL_PER_KG) / days;
  const observedLossKgPerWeek = (-trendChange / days) * 7;
  const observedLossPct = (observedLossKgPerWeek / trendEnd) * 100;

  // Blend with the previous estimate so one noisy week can't swing the target wildly.
  const coverage = Math.min(1, food.length / windowDays);
  const weight = Math.min(0.6, Math.max(0.2, 0.6 * coverage));
  // Early in a diet, water/glycogen loss makes TDEE look higher than it is – trust it less.
  const earlyFactor = c.daysIntoPhase < 14 ? 0.5 : 1;
  const tdee = c.previousTdee + weight * earlyFactor * (observedTdee - c.previousTdee);
  const confidence = coverage > 0.85 && weighIns.length >= windowDays * 0.7 ? 'high' : coverage > 0.6 ? 'medium' : 'low';

  const plannedLossKg = (Math.min(MAX_LOSS_PCT, c.plannedLossPct) / 100) * trendEnd;
  const desiredDeficit = (plannedLossKg * KCAL_PER_KG) / 7;

  reasons.push(
    `Over the last ${days} days you averaged ${Math.round(avgIntake)} kcal and your trend weight ${
      trendChange <= 0 ? 'fell' : 'rose'
    } ${Math.abs(trendChange).toFixed(1)} kg (${observedLossKgPerWeek >= 0 ? '' : '+'}${Math.abs(observedLossKgPerWeek).toFixed(2)} kg/week). That suggests real maintenance of about ${roundTo(
      observedTdee,
      10,
    )} kcal; blended with the previous estimate the coach now uses ${roundTo(tdee, 10)} kcal.`,
  );

  let target: number;
  let stalled = false;
  let suggestion: CoachSuggestion = 'none';

  if (c.dietBreakNextWeek) {
    target = roundTo(tdee, 10);
    reasons.push('Next week is a planned diet break, so the target is your estimated maintenance.');
  } else {
    target = tdee - desiredDeficit;
    const adherent = Math.abs(avgIntake - c.previousTarget) <= 150;
    stalled = c.daysIntoPhase >= 21 && adherent && observedLossKgPerWeek < plannedLossKg * 0.25;

    if (observedLossPct > MAX_LOSS_PCT && c.daysIntoPhase >= 14) {
      reasons.push(`You're losing faster than ${MAX_LOSS_PCT}% of body weight per week, which risks muscle loss – calories go up.`);
    }
    if (!adherent) {
      reasons.push(
        `Your average intake was ${Math.round(Math.abs(avgIntake - c.previousTarget))} kcal ${avgIntake > c.previousTarget ? 'above' : 'below'} target. The estimate accounts for what you actually ate, so focus on consistency rather than cutting further.`,
      );
    }

    // Limit week-to-week changes.
    let change = target - c.previousTarget;
    change = Math.max(-MAX_WEEKLY_CHANGE, Math.min(MAX_WEEKLY_CHANGE, change));
    if (stalled && c.stalledWeeks >= 1 && change < 0) {
      // Repeated stall: don't keep slashing calories – suggest a break instead.
      change = Math.max(change, -50);
      suggestion = 'diet_break';
      reasons.push(
        'Weight loss has stalled for 2+ weeks despite good adherence. Rather than cutting harder, the coach suggests a 1–2 week diet break at maintenance – it often restarts progress and protects your training.',
      );
    }
    target = c.previousTarget + change;

    if (target < c.floorKcal) {
      target = c.floorKcal;
      suggestion = 'diet_break';
      reasons.push(`The target is held at your safety minimum (${c.floorKcal} kcal). A diet break is a better next step than eating less.`);
    }
  }

  target = roundTo(target, 10);
  const change = target - c.previousTarget;
  if (!c.dietBreakNextWeek) {
    if (change === 0) reasons.push('You are on track – the target stays the same.');
    else
      reasons.push(
        `Target ${change > 0 ? 'raised' : 'lowered'} by ${Math.abs(change)} kcal to aim for about ${plannedLossKg.toFixed(2)} kg/week (changes are limited to ±${MAX_WEEKLY_CHANGE} kcal per week so you can adapt).`,
      );
  }

  return {
    ok: true,
    tdee: roundTo(tdee, 10),
    observedTdee: roundTo(observedTdee, 10),
    confidence,
    observedLossKgPerWeek,
    observedLossPct,
    avgIntake: Math.round(avgIntake),
    loggedDays: food.length,
    weighIns: weighIns.length,
    newTarget: target,
    change,
    stalled,
    suggestion,
    reasons,
  };
}
