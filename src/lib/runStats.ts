// Running analytics: weekly distance, pace trends, bests, and turning a time trial into
// updated training paces.

import type { Phase, RunLog, RunLogKind, RunPrescription } from '../types';
import { addDays, daysBetween, mondayOf } from './dates';
import { paceZones } from '../engine/running';

export const RUN_KIND_LABEL: Record<RunLogKind, string> = {
  easy: 'Easy',
  long: 'Long',
  runwalk: 'Run/walk',
  fartlek: 'Fartlek',
  tempo: 'Tempo',
  intervals: 'Intervals',
  timetrial: 'Time trial',
  race: 'Race',
  other: 'Other',
};

/** Seconds per km, when distance is known. */
export function pace(r: RunLog): number | undefined {
  return r.distanceKm && r.distanceKm > 0.2 ? r.durationSec / r.distanceKm : undefined;
}

export interface WeekTotal {
  weekStart: string;
  km: number;
  minutes: number;
  runs: number;
}

/** Totals for the last `weeks` Monday-starting weeks, oldest first, including empty weeks. */
export function weeklyTotals(runs: RunLog[], asOf: string, weeks = 12): WeekTotal[] {
  const thisWeek = mondayOf(asOf);
  const out: WeekTotal[] = [];
  for (let i = weeks - 1; i >= 0; i--) {
    const start = addDays(thisWeek, -7 * i);
    const end = addDays(start, 6);
    const inWeek = runs.filter((r) => r.date >= start && r.date <= end);
    out.push({
      weekStart: start,
      km: inWeek.reduce((a, r) => a + (r.distanceKm ?? 0), 0),
      minutes: inWeek.reduce((a, r) => a + r.durationSec / 60, 0),
      runs: inWeek.length,
    });
  }
  return out;
}

/** Easy-effort runs only – their pace is the cleanest signal of aerobic fitness. */
export function easyPaceSeries(runs: RunLog[]): Array<{ date: string; secPerKm: number }> {
  return runs
    .filter((r) => (r.kind === 'easy' || r.kind === 'long') && pace(r))
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((r) => ({ date: r.date, secPerKm: pace(r)! }));
}

export const BEST_DISTANCES: Array<{ label: string; km: number }> = [
  { label: '1 km', km: 1 },
  { label: '5 km', km: 5 },
  { label: '10 km', km: 10 },
  { label: 'Half marathon', km: 21.0975 },
];

/**
 * Best time for each distance, from runs that covered that distance (up to 10% further),
 * scaled to exactly the distance at the run's average pace. Without per-km splits this
 * is the honest version of a "PB".
 */
export function bestEfforts(runs: RunLog[]): Array<{ label: string; km: number; sec: number; date: string } | { label: string; km: number; sec?: undefined }> {
  return BEST_DISTANCES.map(({ label, km }) => {
    let best: { sec: number; date: string } | undefined;
    for (const r of runs) {
      const p = pace(r);
      if (!p || !r.distanceKm || r.distanceKm < km * 0.99 || r.distanceKm > km * 1.1) continue;
      const sec = p * km;
      if (!best || sec < best.sec) best = { sec, date: r.date };
    }
    return best ? { label, km, ...best } : { label, km };
  });
}

export function longestRun(runs: RunLog[]): RunLog | undefined {
  return runs.reduce<RunLog | undefined>((best, r) => ((r.distanceKm ?? 0) > (best?.distanceKm ?? 0) ? r : best), undefined);
}

/** Riegel's formula: predicted time over another distance from one result. */
export function predictTime(sec: number, km: number, targetKm: number): number {
  return sec * Math.pow(targetKm / km, 1.06);
}

/** 5k-equivalent time from a time trial or race of 3–21 km, for updating paces. */
export function fiveKEquivalent(r: RunLog): number | undefined {
  if (!r.distanceKm || r.distanceKm < 3 || r.distanceKm > 21.2) return undefined;
  if (r.kind !== 'timetrial' && r.kind !== 'race') return undefined;
  return predictTime(r.durationSec, r.distanceKm, 5);
}

/**
 * Updates pace targets on runs from `fromDate` onward using a new 5k time. Volume and
 * session structure are left alone – a time trial changes how fast, not how much.
 */
export function phaseWithNew5k(phase: Phase, fiveKSec: number, fromDate: string): Phase {
  const zones = paceZones(fiveKSec / 5);
  const fromWeek = Math.max(1, Math.floor(daysBetween(phase.startDate, fromDate) / 7) + 1);
  const zoneFor = (kind: RunPrescription['kind']) =>
    kind === 'tempo' || kind === 'fartlek' ? zones.tempo : kind === 'intervals' ? zones.interval : kind === 'timetrial' || kind === 'race' ? undefined : zones.easy;
  return {
    ...phase,
    profile: { ...phase.profile, recent5kSec: Math.round(fiveKSec) },
    weeks: phase.weeks.map((w) =>
      w.index < fromWeek
        ? w
        : { ...w, runs: Object.fromEntries(Object.entries(w.runs).map(([id, r]) => [id, { ...r, pace: zoneFor(r.kind) }])) },
    ),
  };
}
