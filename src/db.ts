// Local database (IndexedDB) – nothing leaves the device.
// When adding tables or indexes later, add a new db.version(n) block; never edit an old one.

import Dexie, { type EntityTable } from 'dexie';
import type { CheckIn, HealthDay, NutritionEntry, Phase, ProgressPhoto, RunLog, Settings, WeightEntry } from './types';
import type { WorkoutLog } from './engine/program';

export interface SwapEntry {
  /** `${phaseId}:${slot}` */
  key: string;
  exerciseId: string;
}

export class CoachDB extends Dexie {
  settings!: EntityTable<Settings, 'id'>;
  phases!: EntityTable<Phase, 'id'>;
  weights!: EntityTable<WeightEntry, 'date'>;
  nutrition!: EntityTable<NutritionEntry, 'date'>;
  workouts!: EntityTable<WorkoutLog, 'id'>;
  swaps!: EntityTable<SwapEntry, 'key'>;
  runs!: EntityTable<RunLog, 'id'>;
  photos!: EntityTable<ProgressPhoto, 'id'>;
  checkins!: EntityTable<CheckIn, 'week'>;
  health!: EntityTable<HealthDay, 'date'>;

  constructor() {
    super('fitness-coach');
    this.version(1).stores({
      settings: 'id',
      phases: '++id, status, startDate',
      weights: 'date',
      nutrition: 'date',
    });
    this.version(2).stores({
      workouts: '++id, date, sessionId, finishedAt',
      swaps: 'key',
    });
    this.version(3).stores({
      runs: '++id, date, sessionId',
    });
    this.version(4).stores({
      photos: '++id, week, date, [week+pose]',
    });
    this.version(5).stores({
      checkins: 'week, phaseId',
    });
    this.version(6).stores({
      health: 'date',
    });
  }
}

export const db = new CoachDB();

export const DEFAULT_SETTINGS: Settings = {
  id: 'settings',
  weightUnit: 'kg',
  distanceUnit: 'km',
  heightUnit: 'cm',
};

export async function getSettings(): Promise<Settings> {
  return (await db.settings.get('settings')) ?? DEFAULT_SETTINGS;
}

/** Read-modify-write inside a transaction so quick successive updates can't overwrite each other. */
export async function updateSettings(patch: Partial<Settings>): Promise<void> {
  await db.transaction('rw', db.settings, async () => {
    const current = (await db.settings.get('settings')) ?? DEFAULT_SETTINGS;
    await db.settings.put({ ...current, ...patch, id: 'settings' });
  });
}

export async function getActivePhase(): Promise<Phase | undefined> {
  return db.phases.where('status').equals('active').first();
}

/** Saves a phase as the active one, archiving any previous active phase. */
export async function activatePhase(phase: Phase, replaceId?: number): Promise<number> {
  return db.transaction('rw', db.phases, async () => {
    const active = await db.phases.where('status').equals('active').toArray();
    for (const p of active) {
      if (p.id !== replaceId) await db.phases.update(p.id!, { status: 'archived' });
    }
    if (replaceId !== undefined) {
      await db.phases.put({ ...phase, id: replaceId, status: 'active' });
      return replaceId;
    }
    return (await db.phases.add({ ...phase, status: 'active' })) as number;
  });
}

/**
 * When the app's training logic improves, bring the active phase's lifting targets and
 * explanations up to date. Calories, schedule, dates and logged data are left untouched.
 */
export async function refreshStrengthPlan(phase: Phase): Promise<void> {
  if (phase.id === undefined) return;
  const { generatePhase } = await import('./engine/phase');
  const fresh = generatePhase(phase.profile, phase.options);
  const changed = JSON.stringify(fresh.strength) !== JSON.stringify(phase.strength) || JSON.stringify(fresh.rationale) !== JSON.stringify(phase.rationale);
  if (changed) await db.phases.update(phase.id, { strength: fresh.strength, rationale: fresh.rationale });
}

/** Ask the browser not to evict our data under storage pressure. */
export async function requestPersistence(): Promise<boolean> {
  try {
    if (navigator.storage?.persisted && (await navigator.storage.persisted())) return true;
    if (navigator.storage?.persist) return await navigator.storage.persist();
  } catch {
    /* not supported */
  }
  return false;
}
