// Garmin Connect "All Activities → Export CSV" import. Garmin writes distances in the account's
// units without saying which, so the user confirms km or miles (the preview shows the pace).

import type { DistanceUnit, Phase, RunLog, RunLogKind } from '../types';
import { parseCsv } from './csv';
import { parseNumber } from './healthImport';
import { KM_PER_MI } from './units';
import { sessionsOn } from './plan';

export interface GarminParse {
  runs: RunLog[];
  skipped: Record<string, number>; // non-running activity types → count
  problems: string[];
}

const RUN_TYPES = /run/i; // Running, Treadmill Running, Trail Running, Track Running, Virtual Run…

function findCol(header: string[], ...names: string[]): number {
  const h = header.map((x) => x.trim().toLowerCase());
  for (const n of names) {
    const i = h.indexOf(n.toLowerCase());
    if (i >= 0) return i;
  }
  return -1;
}

/** "00:32:15", "32:15", "1:02:03.4", "32:15.3" → seconds */
export function parseClock(raw: string | undefined): number | undefined {
  if (!raw) return undefined;
  const t = raw.trim();
  if (!t || t === '--') return undefined;
  const parts = t.split(':').map((p) => Number(p.replace(',', '.')));
  if (parts.some((p) => !Number.isFinite(p))) return undefined;
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  return undefined;
}

function guessKind(title: string, type: string): RunLogKind {
  const t = `${title} ${type}`.toLowerCase();
  if (/race|parkrun|marathon|10k race|5k race/.test(t)) return 'race';
  if (/time ?trial|\btt\b/.test(t)) return 'timetrial';
  if (/interval|repeats|track/.test(t)) return 'intervals';
  if (/tempo|threshold/.test(t)) return 'tempo';
  if (/fartlek/.test(t)) return 'fartlek';
  if (/long/.test(t)) return 'long';
  return 'easy';
}

export function parseGarminCsv(text: string, unit: DistanceUnit): GarminParse {
  const rows = parseCsv(text);
  const problems: string[] = [];
  if (rows.length < 2) return { runs: [], skipped: {}, problems: ['The file is empty or not a CSV.'] };
  const header = rows[0];
  const col = {
    type: findCol(header, 'Activity Type'),
    date: findCol(header, 'Date', 'Start Time'),
    title: findCol(header, 'Title', 'Activity Name'),
    distance: findCol(header, 'Distance'),
    time: findCol(header, 'Time', 'Elapsed Time', 'Moving Time', 'Duration'),
    avgHr: findCol(header, 'Avg HR', 'Average Heart Rate'),
    maxHr: findCol(header, 'Max HR', 'Maximum Heart Rate'),
  };
  if (col.type < 0 || col.date < 0 || col.time < 0) {
    return { runs: [], skipped: {}, problems: ["This doesn't look like a Garmin Connect activities export (missing Activity Type / Date / Time columns)."] };
  }

  const runs: RunLog[] = [];
  const skipped: Record<string, number> = {};
  rows.slice(1).forEach((r, i) => {
    const type = (r[col.type] ?? '').trim();
    if (!RUN_TYPES.test(type)) {
      if (type) skipped[type] = (skipped[type] ?? 0) + 1;
      return;
    }
    const dateMatch = (r[col.date] ?? '').match(/(\d{4})-(\d{2})-(\d{2})/);
    const durationSec = parseClock(r[col.time]);
    if (!dateMatch || !durationSec) {
      problems.push(`Row ${i + 2}: couldn't read the date or time – skipped.`);
      return;
    }
    const rawDist = col.distance >= 0 ? r[col.distance] : undefined;
    const dist = rawDist && rawDist.trim() !== '--' ? parseNumber(rawDist, 'decimal') : undefined;
    const hr = (c: number) => (c >= 0 ? parseNumber(r[c] ?? '', 'integer') : undefined) || undefined;
    const title = col.title >= 0 ? (r[col.title] ?? '').trim() : '';
    runs.push({
      date: `${dateMatch[1]}-${dateMatch[2]}-${dateMatch[3]}`,
      kind: guessKind(title, type),
      distanceKm: dist && dist > 0 ? (unit === 'mi' ? dist * KM_PER_MI : dist) : undefined,
      durationSec: Math.round(durationSec),
      avgHr: hr(col.avgHr),
      maxHr: hr(col.maxHr),
      notes: title ? `Garmin: ${title}` : 'Imported from Garmin',
      source: 'garmin',
    });
  });
  return { runs, skipped, problems };
}

/** Same day and within ~2% on time (and distance if both known) = the same run. */
export function isDuplicate(a: RunLog, b: RunLog): boolean {
  if (a.date !== b.date) return false;
  const close = (x: number, y: number) => Math.abs(x - y) <= Math.max(x, y) * 0.02 + 1;
  if (!close(a.durationSec, b.durationSec)) return false;
  if (a.distanceKm && b.distanceKm && !close(a.distanceKm * 1000, b.distanceKm * 1000)) return false;
  return true;
}

/**
 * Attaches each imported run to the planned run session on that date (if not already logged),
 * taking the planned run type when the title gave no better hint.
 */
export function matchToPlan(phase: Phase | undefined, runs: RunLog[], existing: RunLog[]): RunLog[] {
  if (!phase) return runs;
  const taken = new Set(existing.filter((r) => r.sessionId).map((r) => `${r.date}:${r.sessionId}`));
  return runs.map((r) => {
    const planned = sessionsOn(phase, r.date).sessions.find((s) => s.session.type === 'run' && !taken.has(`${r.date}:${s.session.id}`));
    if (!planned) return r;
    taken.add(`${r.date}:${planned.session.id}`);
    const planKind = planned.run?.kind === 'easy_strides' ? 'easy' : (planned.run?.kind as RunLogKind | undefined);
    return { ...r, sessionId: planned.session.id, kind: r.kind === 'easy' && planKind ? planKind : r.kind };
  });
}
