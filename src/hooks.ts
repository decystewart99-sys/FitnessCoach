import { useLiveQuery } from 'dexie-react-hooks';
import { db, DEFAULT_SETTINGS } from './db';
import type { Phase, Settings } from './types';

export function useSettings(): Settings {
  return useLiveQuery(() => db.settings.get('settings'), []) ?? DEFAULT_SETTINGS;
}

/** undefined while loading, null when there is no active phase. */
export function useActivePhase(): Phase | null | undefined {
  return useLiveQuery(async () => (await db.phases.where('status').equals('active').first()) ?? null, []);
}
