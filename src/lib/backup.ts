// Full-data backup as a single JSON file, for safekeeping and for moving to a new phone.

import { db, updateSettings } from '../db';
import { today } from './dates';

const FORMAT = 'fitness-coach-backup';
const FORMAT_VERSION = 1;

interface BackupFile {
  format: typeof FORMAT;
  formatVersion: number;
  exportedAt: string;
  tables: Record<string, unknown[]>;
}

export async function buildBackup(): Promise<BackupFile> {
  const tables: Record<string, unknown[]> = {};
  for (const table of db.tables) tables[table.name] = await table.toArray();
  return { format: FORMAT, formatVersion: FORMAT_VERSION, exportedAt: new Date().toISOString(), tables };
}

/**
 * Hands the backup to the phone's share sheet (iPhone: "Save to Files" → iCloud Drive),
 * falling back to a normal download on desktop browsers.
 */
export async function exportBackup(): Promise<'shared' | 'downloaded' | 'cancelled'> {
  const data = await buildBackup();
  const name = `fitness-coach-backup-${today()}.json`;
  const blob = new Blob([JSON.stringify(data)], { type: 'application/json' });
  const file = new File([blob], name, { type: 'application/json' });

  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: 'Fitness Coach backup' });
      await updateSettings({ lastBackupAt: new Date().toISOString() });
      return 'shared';
    } catch (e) {
      if ((e as Error).name === 'AbortError') return 'cancelled';
      // otherwise fall through to download
    }
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
  await updateSettings({ lastBackupAt: new Date().toISOString() });
  return 'downloaded';
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

/** Replaces everything on this device with the backup's contents. */
export async function restoreBackup(data: BackupFile): Promise<void> {
  await db.transaction('rw', db.tables, async () => {
    for (const table of db.tables) {
      await table.clear();
      const rows = data.tables[table.name];
      if (Array.isArray(rows) && rows.length) await table.bulkPut(rows);
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
