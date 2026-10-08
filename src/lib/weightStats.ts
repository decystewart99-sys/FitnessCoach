// Numbers shown on the Weight tab, all derived from the smoothed trend (not raw weigh-ins).

import type { WeightEntry } from '../types';
import { weightTrend, trendOn, type TrendPoint } from '../engine/adaptive';
import { addDays, daysBetween, today } from './dates';

export interface WeightStats {
  points: TrendPoint[];
  latest?: TrendPoint;
  trendNow?: number;
  change7?: number;
  change30?: number;
  /** kg per week (negative = losing), from the last 28 days of trend (or what's available, ≥10 days). */
  ratePerWeek?: number;
  sinceStart?: number;
  toGoal?: number;
  projectedGoalDate?: string;
  streak: number;
  count: number;
}

export function computeWeightStats(entries: WeightEntry[], opts: { phaseStart?: string; targetKg?: number; asOf?: string } = {}): WeightStats {
  const asOf = opts.asOf ?? today();
  const points = weightTrend(entries.filter((e) => e.date <= asOf));
  const latest = points[points.length - 1];
  const stats: WeightStats = { points, latest, streak: streak(entries, asOf), count: points.length };
  if (!latest) return stats;

  const now = latest.trend;
  stats.trendNow = now;
  const diffSince = (days: number) => {
    const start = addDays(latest.date, -days);
    if (!points.length || points[0].date > start) return undefined;
    const then = trendOn(points, start);
    return then === undefined ? undefined : now - then;
  };
  stats.change7 = diffSince(7);
  stats.change30 = diffSince(30);

  // Rate: over up to 28 days, needs at least 10 days of history to mean anything.
  const span = Math.min(28, daysBetween(points[0].date, latest.date));
  if (span >= 10) {
    const then = trendOn(points, addDays(latest.date, -span))!;
    stats.ratePerWeek = ((now - then) / span) * 7;
  }

  if (opts.phaseStart) {
    const atStart = trendOn(points, opts.phaseStart) ?? points.find((p) => p.date >= opts.phaseStart!)?.trend;
    if (atStart !== undefined && latest.date >= opts.phaseStart) stats.sinceStart = now - atStart;
  }

  if (opts.targetKg !== undefined) {
    stats.toGoal = now - opts.targetKg;
    if (stats.toGoal > 0 && stats.ratePerWeek !== undefined && stats.ratePerWeek < -0.05) {
      const weeks = stats.toGoal / -stats.ratePerWeek;
      if (weeks < 260) stats.projectedGoalDate = addDays(latest.date, Math.round(weeks * 7));
    }
  }
  return stats;
}

/** Consecutive days with a weigh-in, ending today (or yesterday if today isn't logged yet). */
export function streak(entries: WeightEntry[], asOf: string = today()): number {
  const dates = new Set(entries.map((e) => e.date));
  let day = dates.has(asOf) ? asOf : addDays(asOf, -1);
  let n = 0;
  while (dates.has(day)) {
    n++;
    day = addDays(day, -1);
  }
  return n;
}
