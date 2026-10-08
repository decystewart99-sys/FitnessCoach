// Imports daily food totals (from MyFitnessPal via Apple Health) and weight, sent by an
// iPhone Shortcut. The shortcut copies a line like
//   fitnesscoach:date=2026-10-08&kcal=2,140 kcal&protein=162 g&carbs=210&fat=70&weight=94.4 kg
// to the clipboard; the app reads it on a tap. The same parameters also work as a link
// (…/#/import?date=…&kcal=…) – the part after # never leaves the device.
// Values are parsed leniently because Shortcuts formats numbers using the phone's locale.

import { db } from '../db';
import { today } from './dates';
import { KG_PER_LB } from './units';

export interface HealthImport {
  date: string;
  kcal?: number;
  proteinG?: number;
  carbG?: number;
  fatG?: number;
  weightKg?: number;
  steps?: number;
  restingHr?: number;
  sleepMin?: number;
}

const PREFIX = 'fitnesscoach:';

/** Number from text like "2,140", "2.140", "94,4", "162 g", "2140.0". */
export function parseNumber(raw: string, kind: 'integer' | 'decimal'): number | undefined {
  const m = raw.replace(/\s/g, '').match(/-?[\d.,]+/);
  if (!m) return undefined;
  let s = m[0];
  const hasComma = s.includes(',');
  const hasDot = s.includes('.');
  if (hasComma && hasDot) {
    // Whichever comes last is the decimal separator.
    s = s.lastIndexOf(',') > s.lastIndexOf('.') ? s.replace(/\./g, '').replace(',', '.') : s.replace(/,/g, '');
  } else if (hasComma || hasDot) {
    const sep = hasComma ? ',' : '.';
    const groupedThousands = new RegExp(`^\\d{1,3}(\\${sep}\\d{3})+$`).test(s);
    // "2,140" kcal is two thousand; "94,4" kg is ninety-four point four.
    if (groupedThousands && kind === 'integer') s = s.split(sep).join('');
    else s = s.split(sep).join('.');
    if ((s.match(/\./g) ?? []).length > 1) return undefined;
  }
  const n = Number(s);
  return Number.isFinite(n) ? n : undefined;
}

/** Energy in kcal from "2,140 kcal", "2140 Cal", "8954 kJ" or a bare number (+ optional unit hint). */
export function parseEnergy(raw: string, unitHint?: string): number | undefined {
  const n = parseNumber(raw, 'integer');
  if (n === undefined) return undefined;
  const unit = `${raw} ${unitHint ?? ''}`.toLowerCase();
  const kcal = /\bkj\b|kilojoule/.test(unit) ? n / 4.184 : n;
  return Math.round(kcal);
}

/** Weight in kg from "94.4 kg", "208.2 lb", "14.87 st", "14 st 12.1 lb" or bare number + unit hint. */
export function parseWeight(raw: string, unitHint?: string): number | undefined {
  const text = `${raw} ${unitHint ?? ''}`.toLowerCase();
  const stLb = raw.toLowerCase().match(/([\d.,]+)\s*st\w*\s+([\d.,]+)\s*lb/);
  if (stLb) {
    const st = parseNumber(stLb[1], 'decimal');
    const lb = parseNumber(stLb[2], 'decimal');
    return st === undefined || lb === undefined ? undefined : round2((st * 14 + lb) * KG_PER_LB);
  }
  const n = parseNumber(raw, 'decimal');
  if (n === undefined) return undefined;
  if (/\bst\b|stone/.test(text)) return round2(n * 14 * KG_PER_LB);
  if (/\blbs?\b|pound/.test(text)) return round2(n * KG_PER_LB);
  return round2(n);
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * Sleep in minutes from whatever Shortcuts produces: "7.5 hr", "450 min", "27000 s", "7:30",
 * or a bare number (≤ 24 = hours, ≤ 1000 = minutes, else seconds).
 */
export function parseSleep(raw: string): number | undefined {
  const t = raw.trim().toLowerCase();
  const hm = t.match(/^(\d{1,2}):(\d{2})/);
  if (hm) return Number(hm[1]) * 60 + Number(hm[2]);
  const n = parseNumber(t, 'decimal');
  if (n === undefined || n <= 0) return undefined;
  if (/\bh(ou)?rs?\b|\bhr\b|\bh\b/.test(t)) return Math.round(n * 60);
  if (/min/.test(t)) return Math.round(n);
  if (/\bs(ec(ond)?s?)?\b/.test(t)) return Math.round(n / 60);
  return Math.round(n <= 24 ? n * 60 : n <= 1000 ? n : n / 60);
}

/** Pulls the parameters out of clipboard text or a link. Returns undefined if none found. */
export function extractParams(text: string): URLSearchParams | undefined {
  const t = text.trim();
  const i = t.toLowerCase().indexOf(PREFIX);
  if (i >= 0) return new URLSearchParams(t.slice(i + PREFIX.length).split(/\s*\n/)[0]);
  const q = t.indexOf('#/import?');
  if (q >= 0) return new URLSearchParams(t.slice(q + '#/import?'.length));
  return undefined;
}

export function parseImport(params: URLSearchParams, fallbackDate = today()): HealthImport | { error: string } {
  const get = (k: string) => {
    const v = params.get(k)?.trim();
    return v ? v : undefined;
  };
  const dateRaw = get('date');
  const date = dateRaw && /^\d{4}-\d{2}-\d{2}$/.test(dateRaw) ? dateRaw : fallbackDate;
  if (date > today()) return { error: `The date ${date} is in the future.` };

  const out: HealthImport = { date };
  const kcalRaw = get('kcal') ?? get('energy');
  if (kcalRaw) out.kcal = parseEnergy(kcalRaw, get('eunit'));
  const p = get('protein');
  if (p) out.proteinG = roundInt(parseNumber(p, 'decimal'));
  const c = get('carbs');
  if (c) out.carbG = roundInt(parseNumber(c, 'decimal'));
  const f = get('fat');
  if (f) out.fatG = roundInt(parseNumber(f, 'decimal'));
  const w = get('weight');
  if (w) out.weightKg = parseWeight(w, get('wunit'));
  const steps = get('steps');
  if (steps) out.steps = roundInt(parseNumber(steps, 'integer'));
  const rhr = get('rhr');
  if (rhr) out.restingHr = roundInt(parseNumber(rhr, 'decimal'));
  const sleep = get('sleep');
  if (sleep) out.sleepMin = parseSleep(sleep);

  // Sanity limits – anything outside these is almost certainly a formatting problem.
  if (out.kcal !== undefined && (out.kcal < 0 || out.kcal > 10000)) return { error: `Calories value "${kcalRaw}" doesn't look right.` };
  if (out.weightKg !== undefined && (out.weightKg < 30 || out.weightKg > 350)) return { error: `Weight value "${w}" doesn't look right.` };
  if (out.proteinG !== undefined && out.proteinG > 600) return { error: `Protein value "${p}" doesn't look right.` };
  if (out.restingHr !== undefined && (out.restingHr < 25 || out.restingHr > 140)) out.restingHr = undefined;
  if (out.sleepMin !== undefined && (out.sleepMin < 60 || out.sleepMin > 16 * 60)) out.sleepMin = undefined;
  if (out.steps !== undefined && (out.steps < 0 || out.steps > 150000)) out.steps = undefined;
  if (!out.kcal && out.weightKg === undefined && !out.steps && !out.restingHr && !out.sleepMin)
    return { error: 'No calories, weight or health data found – nothing logged in Apple Health for that day yet?' };
  return out;
}

const roundInt = (n: number | undefined) => (n === undefined ? undefined : Math.round(n));

/** Saves an import. Food totals replace that day's entry (MyFitnessPal is the source of truth). */
export async function applyImport(data: HealthImport): Promise<string[]> {
  const done: string[] = [];
  await db.transaction('rw', db.nutrition, db.weights, db.health, async () => {
    if (data.kcal) {
      const existing = await db.nutrition.get(data.date);
      await db.nutrition.put({
        date: data.date,
        kcal: data.kcal,
        proteinG: data.proteinG ?? existing?.proteinG ?? 0,
        carbG: data.carbG ?? existing?.carbG,
        fatG: data.fatG ?? existing?.fatG,
      });
      done.push(`${data.kcal} kcal${data.proteinG !== undefined ? ` · ${data.proteinG} g protein` : ''}`);
    }
    if (data.weightKg !== undefined) {
      await db.weights.put({ date: data.date, kg: data.weightKg });
      done.push('weight');
    }
    if (data.steps || data.restingHr || data.sleepMin) {
      const existing = await db.health.get(data.date);
      await db.health.put({
        date: data.date,
        steps: data.steps ?? existing?.steps,
        restingHr: data.restingHr ?? existing?.restingHr,
        sleepMin: data.sleepMin ?? existing?.sleepMin,
      });
      done.push('health data');
    }
  });
  return done;
}

/** The text the shortcut's final "Text" action should contain (shown in the setup guide). */
export const SHORTCUT_TEMPLATE =
  'fitnesscoach:date=[Day]&kcal=[Calories]&protein=[Protein]&carbs=[Carbs]&fat=[Fat]&weight=[Weight]&steps=[Steps]&rhr=[Resting HR]&sleep=[Sleep]';
