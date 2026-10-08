// Local database (IndexedDB) – nothing leaves the device.
// When adding tables or indexes later, add a new db.version(n) block; never edit an old one.

import Dexie, { type EntityTable } from 'dexie';
import type { NutritionEntry, Phase, Settings, WeightEntry } from './types';

export class CoachDB extends Dexie {
  settings!: EntityTable<Settings, 'id'>;
  phases!: EntityTable<Phase, 'id'>;
  weights!: EntityTable<WeightEntry, 'date'>;
  nutrition!: EntityTable<NutritionEntry, 'date'>;

  constructor() {
    super('fitness-coach');
    this.version(1).stores({
      settings: 'id',
      phases: '++id, status, startDate',
      weights: 'date',
      nutrition: 'date',
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
