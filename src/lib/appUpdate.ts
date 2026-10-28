// Android: new versions are published as GitHub releases named "android-<build number>".

import { Browser } from '@capacitor/browser';

const RELEASES = 'https://api.github.com/repos/decystewart99-sys/FitnessCoach/releases?per_page=20';

export const APP_VERSION = Number(__APP_VERSION_CODE__) || 0;

export interface UpdateInfo {
  current: number;
  latest?: number;
  apkUrl?: string;
  pageUrl?: string;
}

export async function checkForUpdate(): Promise<UpdateInfo> {
  const res = await fetch(RELEASES, { headers: { Accept: 'application/vnd.github+json' } });
  if (!res.ok) throw new Error('Could not reach GitHub to check for updates.');
  const releases: Array<{ tag_name: string; html_url: string; assets: Array<{ name: string; browser_download_url: string }> }> = await res.json();
  const latest = releases
    .filter((r) => r.tag_name.startsWith('android-'))
    .map((r) => ({ n: Number(r.tag_name.slice('android-'.length)), r }))
    .filter((x) => Number.isFinite(x.n))
    .sort((a, b) => b.n - a.n)[0];
  if (!latest) return { current: APP_VERSION };
  const apk = latest.r.assets.find((a) => a.name.endsWith('.apk'));
  return { current: APP_VERSION, latest: latest.n, apkUrl: apk?.browser_download_url, pageUrl: latest.r.html_url };
}

export async function openDownload(url: string): Promise<void> {
  await Browser.open({ url });
}
