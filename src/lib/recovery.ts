// Recovery signals from daily health data, used on the Health screen and in the weekly check-in.

import type { HealthDay } from '../types';
import { addDays } from './dates';

const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : undefined);

export interface RecoverySignals {
  steps7?: number;
  rhr7?: number;
  rhrBaseline?: number;
  sleep7?: number;
  rhrElevated: boolean;
  shortSleep: boolean;
  notes: string[];
}

/** Last 7 days vs the 28 days before. */
export function recoverySignals(days: HealthDay[], asOf: string): RecoverySignals {
  const last7 = days.filter((d) => d.date < asOf && d.date >= addDays(asOf, -7));
  const before = days.filter((d) => d.date < addDays(asOf, -7) && d.date >= addDays(asOf, -35));
  const vals = (xs: HealthDay[], k: keyof HealthDay) => xs.map((d) => d[k]).filter((v): v is number => typeof v === 'number' && v > 0);

  const rhr7 = vals(last7, 'restingHr').length >= 3 ? avg(vals(last7, 'restingHr')) : undefined;
  const rhrBaseline = vals(before, 'restingHr').length >= 7 ? avg(vals(before, 'restingHr')) : undefined;
  const sleep7 = vals(last7, 'sleepMin').length >= 3 ? avg(vals(last7, 'sleepMin')) : undefined;
  const rhrElevated = rhr7 !== undefined && rhrBaseline !== undefined && rhr7 - rhrBaseline >= 5;
  const shortSleep = sleep7 !== undefined && sleep7 < 6.5 * 60;

  const notes: string[] = [];
  if (rhrElevated) notes.push(`Resting heart rate is ${Math.round(rhr7! - rhrBaseline!)} bpm above your usual – a sign of incomplete recovery, illness or stress. Keep this week's runs easy.`);
  if (shortSleep) notes.push(`You averaged under 6½ hours of sleep last week. Short sleep makes dieting harder and costs muscle – it's worth protecting.`);
  return { steps7: avg(vals(last7, 'steps')), rhr7, rhrBaseline, sleep7, rhrElevated, shortSleep, notes };
}
