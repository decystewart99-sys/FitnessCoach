// Saving a file the user can keep or send on. In the Android app this goes through the share
// sheet (Drive, Gmail, Files…); in a browser it uses the share sheet or a normal download.

import { Capacitor } from '@capacitor/core';
import { Directory, Encoding, Filesystem } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';

export async function saveFile(name: string, content: string, mime: string, title: string): Promise<'shared' | 'downloaded' | 'cancelled'> {
  if (Capacitor.isNativePlatform()) {
    const { uri } = await Filesystem.writeFile({ path: name, data: content, directory: Directory.Cache, encoding: Encoding.UTF8 });
    try {
      await Share.share({ title, files: [uri] });
      return 'shared';
    } catch {
      return 'cancelled';
    }
  }
  const file = new File([content], name, { type: mime });
  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title });
      return 'shared';
    } catch (e) {
      if ((e as Error).name === 'AbortError') return 'cancelled';
    }
  }
  const url = URL.createObjectURL(file);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
  return 'downloaded';
}
