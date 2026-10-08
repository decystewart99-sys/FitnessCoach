import type { DistanceUnit, WeightUnit } from '../types';

export const KG_PER_LB = 0.45359237;
export const KM_PER_MI = 1.609344;
export const CM_PER_IN = 2.54;

export function kgToLb(kg: number): number {
  return kg / KG_PER_LB;
}

export function lbToKg(lb: number): number {
  return lb * KG_PER_LB;
}

export function kgToStLb(kg: number): { st: number; lb: number } {
  const totalLb = kgToLb(kg);
  let st = Math.floor(totalLb / 14);
  let lb = Math.round((totalLb - st * 14) * 10) / 10;
  if (lb >= 14) {
    st += 1;
    lb -= 14;
  }
  return { st, lb };
}

export function cmToFtIn(cm: number): { ft: number; inch: number } {
  const totalIn = cm / CM_PER_IN;
  let ft = Math.floor(totalIn / 12);
  let inch = Math.round(totalIn - ft * 12);
  if (inch === 12) {
    ft += 1;
    inch = 0;
  }
  return { ft, inch };
}

export function formatWeight(kg: number, unit: WeightUnit, decimals = 1): string {
  if (unit === 'kg') return `${kg.toFixed(decimals)} kg`;
  if (unit === 'lb') return `${kgToLb(kg).toFixed(decimals)} lb`;
  const { st, lb } = kgToStLb(kg);
  return `${st} st ${lb.toFixed(decimals === 0 ? 0 : 1)} lb`;
}

/** For a change in weight (e.g. "-0.4 kg/week") – stones make no sense for small deltas. */
export function formatWeightDelta(kg: number, unit: WeightUnit, decimals = 1): string {
  const sign = kg > 0 ? '+' : kg < 0 ? '−' : '';
  const v = Math.abs(kg);
  return unit === 'kg' ? `${sign}${v.toFixed(decimals)} kg` : `${sign}${kgToLb(v).toFixed(decimals)} lb`;
}

export function formatDistance(km: number, unit: DistanceUnit, decimals = 1): string {
  return unit === 'km' ? `${km.toFixed(decimals)} km` : `${(km / KM_PER_MI).toFixed(decimals)} mi`;
}

/** Seconds per km → "m:ss /km" or "/mi". */
export function formatPace(secPerKm: number, unit: DistanceUnit): string {
  const s = unit === 'km' ? secPerKm : secPerKm * KM_PER_MI;
  return `${formatDuration(s)} /${unit}`;
}

/** 1234 → "20:34", 4000 → "1:06:40" */
export function formatDuration(totalSec: number): string {
  const sec = Math.round(totalSec);
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  const ss = String(s).padStart(2, '0');
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${m}:${ss}`;
}

/** Parses "25:30", "1:52:00" or "25" (minutes). Returns seconds or undefined. */
export function parseDuration(text: string): number | undefined {
  const t = text.trim();
  if (!t) return undefined;
  const parts = t.split(':').map((p) => Number(p));
  if (parts.some((p) => !Number.isFinite(p) || p < 0)) return undefined;
  if (parts.length === 1) return parts[0] * 60;
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  return undefined;
}

export function roundTo(n: number, step: number): number {
  return Math.round(n / step) * step;
}
