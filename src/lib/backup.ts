// Full-data backup as a single JSON file, for safekeeping and for moving to a new phone.

import { db, getSettings, updateSettings } from '../db';
import { today } from './dates';
import { saveFile } from './files';
import { decodePhoto, encodePhoto, type EncodedPhoto } from './photos';
import type { ProgressPhoto } from '../types';

const FORMAT = 'fitness-coach-backup';
const FORMAT_VERSION = 1;

interface BackupFile {
  format: typeof FORMAT;
  formatVersion: number;
  exportedAt: string;
  tables: Record<string, unknown[]>;
}

/** Photos are only included when asked – they make the file much bigger. */
export async function buildBackup(includePhotos = false): Promise<BackupFile> {
  const tables: Record<string, unknown[]> = {};
  for (const table of db.tables) {
    if (table.name === 'photos') {
      if (includePhotos) tables.photos = await Promise.all((await db.photos.toArray()).map(encodePhoto));
      continue;
    }
    tables[table.name] = await table.toArray();
  }
  return { format: FORMAT, formatVersion: FORMAT_VERSION, exportedAt: new Date().toISOString(), tables };
}

/** Saves the backup via the share sheet (Drive, Files, email…) or a normal download. */
export async function exportBackup(): Promise<'shared' | 'downloaded' | 'cancelled'> {
  const data = await buildBackup(!!(await getSettings()).backupPhotos);
  const result = await saveFile(`fitness-coach-backup-${today()}.json`, JSON.stringify(data), 'application/json', 'Fitness Coach backup');
  if (result !== 'cancelled') await updateSettings({ lastBackupAt: new Date().toISOString() });
  return result;
}

export async function readBackupFile(file: File): Promise<BackupFile> {
  const text = await file.text();
  let data: BackupFile;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error('That file isn\'t valid JSON.');
  }
  if (data?.format !== FORMAT || typeof data.tables !== 'object') throw new Error('That file isn\'t a Fitness Coach backup.');
  if (data.formatVersion > FORMAT_VERSION) throw new Error('This backup is from a newer version of the app. Update the app first.');
  return data;
}

/**
 * Replaces the data on this device with the backup's contents – but only for the kinds of data
 * the backup contains. A backup saved without photos leaves the photos on this phone alone.
 */
export async function restoreBackup(data: BackupFile): Promise<void> {
  await db.transaction('rw', db.tables, async () => {
    for (const table of db.tables) {
      const rows = data.tables[table.name];
      if (!Array.isArray(rows)) continue;
      await table.clear();
      if (!rows.length) continue;
      if (table.name === 'photos') await db.photos.bulkPut((rows as EncodedPhoto[]).map(decodePhoto) as ProgressPhoto[]);
      else await table.bulkPut(rows);
    }
  });
}

export function summarizeBackup(data: BackupFile): string {
  const counts = Object.entries(data.tables)
    .filter(([name]) => name !== 'settings')
    .map(([name, rows]) => `${rows.length} ${name}`)
    .join(', ');
  return `Backup from ${new Date(data.exportedAt).toLocaleString()}: ${counts}`;
}
