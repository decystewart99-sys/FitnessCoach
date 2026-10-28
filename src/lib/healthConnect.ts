// Android: syncing from Health Connect (food from MyFitnessPal; weight, steps, resting HR, sleep
// and runs from Garmin Connect). The native side lives in android/…/HealthBridgePlugin.kt.

import { Capacitor, registerPlugin } from '@capacitor/core';
import { db, getActivePhase, getSettings, updateSettings } from '../db';
import type { HealthDay, NutritionEntry, Phase, RunLog, WeightEntry } from '../types';
import { addDays, today } from './dates';
import { guessKind, isDuplicate, matchToPlan } from './garmin';

export interface HCDay {
  date: string;
  kcal?: number;
  proteinG?: number;
  carbG?: number;
  fatG?: number;
  steps?: number;
  restingHr?: number;
  weightKg?: number;
  sleepMin?: number;
  sleepDeepMin?: number;
  sleepRemMin?: number;
  sleepLightMin?: number;
  sleepAwakeMin?: number;
}

export interface HCRun {
  id: string;
  date: string;
  startTime: string;
  durationSec: number;
  distanceM?: number;
  avgHr?: number;
  maxHr?: number;
  title: string;
  origin: string;
  treadmill: boolean;
}

export interface HCDiagnostic {
  type: string;
  granted: boolean;
  records?: number;
  sources?: string[];
  detail?: string;
  error?: string;
}

interface HealthBridgePlugin {
  availability(): Promise<{ status: 'available' | 'update_required' | 'unavailable' }>;
  grantedPermissions(): Promise<{ granted: string[]; all: boolean }>;
  requestHealthPermissions(): Promise<{ granted: string[]; all: boolean }>;
  openSettings(): Promise<void>;
  readDaily(o: { start: string; end: string }): Promise<{ days: HCDay[]; errors?: string[] }>;
  readRuns(o: { start: string; end: string }): Promise<{ runs: HCRun[]; errors?: string[] }>;
  diagnostics(): Promise<{ types: HCDiagnostic[] }>;
}

export const HealthBridge = registerPlugin<HealthBridgePlugin>('HealthBridge');

export const isAndroidApp = () => Capacitor.getPlatform() === 'android';

const FIRST_SYNC_DAYS = 30;
const OVERLAP_DAYS = 3; // re-read recent days: apps sometimes sync to Health Connect late

export interface SyncChanges {
  nutrition: NutritionEntry[];
  weights: WeightEntry[];
  health: HealthDay[];
  runs: RunLog[];
}

/**
 * Turns Health Connect data into app records. Pure, so it can be tested without a phone.
 * - Food totals replace that day's entry (MyFitnessPal is the source of truth).
 * - Weight only fills days you haven't weighed in by hand.
 * - Health numbers merge into the day.
 * - Runs are added once (by Health Connect id, or if they match a run already logged) and
 *   attached to the planned session for that day.
 */
export function planSync(
  days: HCDay[],
  runs: HCRun[],
  existing: { weights: WeightEntry[]; health: HealthDay[]; runs: RunLog[] },
  phase: Phase | undefined,
): SyncChanges {
  const weightDates = new Set(existing.weights.map((w) => w.date));
  const healthByDate = new Map(existing.health.map((h) => [h.date, h]));
  const out: SyncChanges = { nutrition: [], weights: [], health: [], runs: [] };

  for (const d of days) {
    if (d.kcal && d.kcal > 0) {
      out.nutrition.push({
        date: d.date,
        kcal: Math.round(d.kcal),
        proteinG: Math.round(d.proteinG ?? 0),
        carbG: d.carbG !== undefined ? Math.round(d.carbG) : undefined,
        fatG: d.fatG !== undefined ? Math.round(d.fatG) : undefined,
      });
    }
    if (d.weightKg && d.weightKg > 30 && d.weightKg < 350 && !weightDates.has(d.date)) {
      out.weights.push({ date: d.date, kg: Math.round(d.weightKg * 100) / 100 });
    }
    if (d.steps || d.restingHr || d.sleepMin) {
      const prev = healthByDate.get(d.date);
      out.health.push({
        date: d.date,
        steps: d.steps ? Math.round(d.steps) : prev?.steps,
        restingHr: d.restingHr ? Math.round(d.restingHr) : prev?.restingHr,
        sleepMin: d.sleepMin ? Math.round(d.sleepMin) : prev?.sleepMin,
        ...(d.sleepMin && (d.sleepDeepMin || d.sleepRemMin || d.sleepLightMin)
          ? {
              sleepDeepMin: Math.round(d.sleepDeepMin ?? 0),
              sleepRemMin: Math.round(d.sleepRemMin ?? 0),
              sleepLightMin: Math.round(d.sleepLightMin ?? 0),
              sleepAwakeMin: Math.round(d.sleepAwakeMin ?? 0),
            }
          : {
              sleepDeepMin: prev?.sleepDeepMin,
              sleepRemMin: prev?.sleepRemMin,
              sleepLightMin: prev?.sleepLightMin,
              sleepAwakeMin: prev?.sleepAwakeMin,
            }),
      });
    }
  }

  const seenIds = new Set(existing.runs.map((r) => r.externalId).filter(Boolean));
  const fresh: RunLog[] = [];
  for (const r of runs) {
    if (seenIds.has(r.id) || r.durationSec < 300) continue;
    const log: RunLog = {
      date: r.date,
      kind: guessKind(r.title, r.treadmill ? 'Treadmill Running' : 'Running'),
      distanceKm: r.distanceM && r.distanceM > 100 ? Math.round(r.distanceM) / 1000 : undefined,
      durationSec: Math.round(r.durationSec),
      avgHr: r.avgHr ? Math.round(r.avgHr) : undefined,
      maxHr: r.maxHr ? Math.round(r.maxHr) : undefined,
      notes: r.title ? `${r.title}` : undefined,
      source: 'health',
      externalId: r.id,
    };
    if ([...existing.runs, ...fresh].some((e) => isDuplicate(log, e))) continue;
    fresh.push(log);
  }
  out.runs = matchToPlan(phase, fresh, existing.runs);
  return out;
}

export interface SyncResult {
  ok: boolean;
  message: string;
  changes?: { food: number; weights: number; health: number; runs: number };
}

let running: Promise<SyncResult> | undefined;

/** Reads recent Health Connect data and saves it. Safe to call often; only one sync runs at a time. */
export function syncHealthConnect(): Promise<SyncResult> {
  if (!running) running = doSync().finally(() => (running = undefined));
  return running;
}

async function doSync(): Promise<SyncResult> {
  if (!isAndroidApp()) return { ok: false, message: 'Health Connect is only available in the Android app.' };
  const { status } = await HealthBridge.availability();
  if (status !== 'available') return { ok: false, message: status === 'update_required' ? 'Health Connect needs updating from the Play Store.' : 'Health Connect isn\'t available on this phone.' };
  const { granted } = await HealthBridge.grantedPermissions();
  if (!granted.length) return { ok: false, message: 'Coach doesn\'t have Health Connect access yet.' };

  const settings = await getSettings();
  const end = today();
  const start = settings.lastHealthSyncAt ? addDays(settings.lastHealthSyncAt.slice(0, 10), -OVERLAP_DAYS) : addDays(end, -FIRST_SYNC_DAYS);
  // Daily data and runs are read separately so a problem with one never blocks the other.
  const [daily, runRead] = await Promise.allSettled([HealthBridge.readDaily({ start, end }), HealthBridge.readRuns({ start, end })]);
  const days = daily.status === 'fulfilled' ? daily.value.days : [];
  const runs = runRead.status === 'fulfilled' ? runRead.value.runs : [];
  const problems = [
    ...(daily.status === 'rejected' ? [`daily data: ${(daily.reason as Error)?.message}`] : daily.value.errors ?? []),
    ...(runRead.status === 'rejected' ? [`runs: ${(runRead.reason as Error)?.message}`] : runRead.value.errors ?? []),
  ];

  const existing = { weights: await db.weights.toArray(), health: await db.health.toArray(), runs: await db.runs.toArray() };
  const changes = planSync(days, runs, existing, (await getActivePhase()) ?? undefined);
  await db.transaction('rw', db.nutrition, db.weights, db.health, db.runs, async () => {
    if (changes.nutrition.length) await db.nutrition.bulkPut(changes.nutrition);
    if (changes.weights.length) await db.weights.bulkPut(changes.weights);
    if (changes.health.length) await db.health.bulkPut(changes.health);
    if (changes.runs.length) await db.runs.bulkAdd(changes.runs);
  });
  await updateSettings({ lastHealthSyncAt: new Date().toISOString() });
  const counts = { food: changes.nutrition.length, weights: changes.weights.length, health: changes.health.length, runs: changes.runs.length };
  const message = describe(counts) + (problems.length ? ` Some data couldn't be read (${problems.join('; ')}).` : '');
  return { ok: problems.length === 0, message, changes: counts };
}

function describe(c: { food: number; weights: number; health: number; runs: number }): string {
  const parts = [
    c.runs && `${c.runs} new run${c.runs === 1 ? '' : 's'}`,
    c.food && `food for ${c.food} day${c.food === 1 ? '' : 's'}`,
    c.weights && `${c.weights} weigh-in${c.weights === 1 ? '' : 's'}`,
    c.health && `health data for ${c.health} day${c.health === 1 ? '' : 's'}`,
  ].filter(Boolean);
  return parts.length ? `Synced ${parts.join(', ')}.` : 'Up to date – nothing new in Health Connect.';
}
