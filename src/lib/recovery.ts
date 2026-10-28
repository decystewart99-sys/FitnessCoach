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

export interface SleepScore {
  score: number;
  label: 'Good' | 'Fair' | 'Poor';
  /** False when only total sleep is known (no stage data), so the score is duration-based. */
  usedStages: boolean;
  parts: { duration: number; quality?: number; restfulness?: number };
}

/**
 * Coach's own 0–100 sleep score (Garmin's Sleep Score isn't shared with Health Connect).
 * Built from the same ingredients: duration (7½ h+ = full marks, 5 h or less = none),
 * deep + REM share (≥ 40% of sleep = full marks) and time awake (≤ 20 min = full, ≥ 60 min = none).
 */
export function sleepScore(day: HealthDay): SleepScore | undefined {
  const asleep = day.sleepMin;
  if (!asleep || asleep < 60) return undefined;
  const clamp01 = (x: number) => Math.min(1, Math.max(0, x));
  const durationPart = clamp01((asleep - 300) / (450 - 300));
  const hasStages = (day.sleepDeepMin ?? 0) + (day.sleepRemMin ?? 0) + (day.sleepLightMin ?? 0) > 0;
  let score: number;
  const parts: SleepScore['parts'] = { duration: Math.round(durationPart * 100) };
  if (hasStages) {
    const restorative = ((day.sleepDeepMin ?? 0) + (day.sleepRemMin ?? 0)) / asleep;
    const quality = clamp01(restorative / 0.4);
    const restfulness = clamp01(1 - ((day.sleepAwakeMin ?? 0) - 20) / 40);
    parts.quality = Math.round(quality * 100);
    parts.restfulness = Math.round(restfulness * 100);
    score = 60 * durationPart + 25 * quality + 15 * restfulness;
  } else {
    score = 100 * durationPart;
  }
  const rounded = Math.round(score);
  return { score: rounded, label: rounded >= 80 ? 'Good' : rounded >= 60 ? 'Fair' : 'Poor', usedStages: hasStages, parts };
}
