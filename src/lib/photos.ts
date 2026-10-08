// Progress photos: shrink on the phone before storing, and convert to/from text for backups.
// Photos never leave the device unless the user saves a backup that includes them.

import { db } from '../db';
import type { PhotoPose, ProgressPhoto } from '../types';
import { mondayOf } from './dates';

export const POSES: PhotoPose[] = ['front', 'side', 'back'];
export const POSE_LABEL: Record<PhotoPose, string> = { front: 'Front', side: 'Side', back: 'Back' };

const MAX_SIDE = 1080;
const QUALITY = 0.8;

/** Decodes an image file (respecting the phone's rotation), scales it down and re-encodes as JPEG. */
export async function compressImage(file: File): Promise<{ blob: Blob; width: number; height: number }> {
  const source = await loadImage(file);
  try {
    const scale = Math.min(1, MAX_SIDE / Math.max(source.width, source.height));
    const width = Math.round(source.width * scale);
    const height = Math.round(source.height * scale);
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    canvas.getContext('2d')!.drawImage(source.image, 0, 0, width, height);
    const blob = await new Promise<Blob>((res, rej) => canvas.toBlob((b) => (b ? res(b) : rej(new Error('Could not process photo'))), 'image/jpeg', QUALITY));
    return { blob, width, height };
  } finally {
    source.release();
  }
}

/** createImageBitmap where available (applies the photo's rotation); classic <img> load otherwise. */
async function loadImage(file: File): Promise<{ image: CanvasImageSource; width: number; height: number; release: () => void }> {
  if (typeof createImageBitmap === 'function') {
    try {
      const bmp = await createImageBitmap(file, { imageOrientation: 'from-image' });
      return { image: bmp, width: bmp.width, height: bmp.height, release: () => bmp.close() };
    } catch {
      /* fall back (e.g. HEIC on some browsers) */
    }
  }
  const url = URL.createObjectURL(file);
  const img = new Image();
  await new Promise<void>((res, rej) => {
    img.onload = () => res();
    img.onerror = () => rej(new Error('Could not read photo'));
    img.src = url;
  });
  return { image: img, width: img.naturalWidth, height: img.naturalHeight, release: () => URL.revokeObjectURL(url) };
}

/** Saves (or replaces) the photo for a pose in the week containing `date`. */
export async function savePhoto(file: File, pose: PhotoPose, date: string): Promise<void> {
  const { blob, width, height } = await compressImage(file);
  const week = mondayOf(date);
  await db.transaction('rw', db.photos, async () => {
    await db.photos.where('[week+pose]').equals([week, pose]).delete();
    await db.photos.add({ date, week, pose, blob, width, height });
  });
}

// ---- backup encoding (Blob ⇄ base64 text) ----

export interface EncodedPhoto extends Omit<ProgressPhoto, 'blob'> {
  data: string; // base64
  type: string;
}

function bytesToBase64(bytes: Uint8Array): string {
  let bin = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) bin += String.fromCharCode(...bytes.subarray(i, i + chunk));
  return btoa(bin);
}

export async function encodePhoto(p: ProgressPhoto): Promise<EncodedPhoto> {
  const { blob, ...rest } = p;
  return { ...rest, type: blob.type || 'image/jpeg', data: bytesToBase64(new Uint8Array(await blob.arrayBuffer())) };
}

export function decodePhoto(e: EncodedPhoto): ProgressPhoto {
  const { data, type, ...rest } = e;
  const bin = atob(data);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return { ...rest, blob: new Blob([bytes], { type }) };
}
