import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '../db';
import { buildBackup, restoreBackup } from './backup';
import { decodePhoto, encodePhoto } from './photos';

const photo = (week: string) => ({ date: week, week, pose: 'front' as const, blob: new Blob([new Uint8Array([1, 2, 3, 250, 255])], { type: 'image/jpeg' }), width: 10, height: 20 });

describe('backup', () => {
  beforeEach(async () => {
    await Promise.all(db.tables.map((t) => t.clear()));
  });

  it('encodes and decodes photos byte-for-byte', async () => {
    const p = photo('2026-10-12');
    const back = decodePhoto(await encodePhoto(p));
    expect(new Uint8Array(await back.blob.arrayBuffer())).toEqual(new Uint8Array([1, 2, 3, 250, 255]));
    expect(back.blob.type).toBe('image/jpeg');
    expect(back.width).toBe(10);
  });

  it('leaves photos out unless asked, and a photo-less restore keeps existing photos', async () => {
    await db.weights.put({ date: '2026-10-12', kg: 90 });
    await db.photos.add(photo('2026-10-12'));
    const without = await buildBackup(false);
    expect(without.tables.photos).toBeUndefined();

    await db.weights.clear();
    await restoreBackup(JSON.parse(JSON.stringify(without)));
    expect(await db.weights.count()).toBe(1);
    expect(await db.photos.count()).toBe(1); // untouched
  });

  it('round-trips photos when included', async () => {
    await db.photos.add(photo('2026-10-12'));
    await db.photos.add(photo('2026-10-19'));
    const withPhotos = JSON.parse(JSON.stringify(await buildBackup(true)));
    await db.photos.clear();
    await restoreBackup(withPhotos);
    const restored = await db.photos.toArray();
    expect(restored).toHaveLength(2);
    expect(restored[0].blob.size).toBe(5);
  });
});
