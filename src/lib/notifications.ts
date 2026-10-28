// Android reminders. Planned two weeks ahead and re-planned every time the app opens, so they
// always reflect the current plan (moved sessions, deloads, new targets).

import { LocalNotifications } from '@capacitor/local-notifications';
import { db, getActivePhase, getSettings } from '../db';
import type { Phase, ReminderKind, Settings } from '../types';
import { addDays, mondayOf, today, weekday } from './dates';
import { kcalFor, sessionsOn, sportOn } from './plan';
import { weekRange } from './checkin';
import { isAndroidApp } from './healthConnect';

export const REMINDER_DEFAULTS: Record<ReminderKind, string> = {
  weighIn: '07:15',
  training: '07:30',
  food: '20:30',
  checkin: '08:00',
  photos: '09:00',
};

export const REMINDER_LABEL: Record<ReminderKind, { title: string; sub: string }> = {
  weighIn: { title: 'Morning weigh-in', sub: 'Every day – after the toilet, before eating' },
  training: { title: "Today's training", sub: 'On training days: what\'s planned and your calorie target' },
  food: { title: 'Evening food check', sub: 'Every day – finish logging in MyFitnessPal and check protein' },
  checkin: { title: 'Weekly check-in', sub: 'The morning it opens' },
  photos: { title: 'Progress photos', sub: 'On your photo day, if not done yet' },
};

export function reminderTime(settings: Settings, kind: ReminderKind): string | null {
  const v = settings.reminders?.[kind];
  return v === undefined ? REMINDER_DEFAULTS[kind] : v;
}

export interface PlannedReminder {
  id: number;
  at: Date;
  title: string;
  body: string;
}

const HORIZON_DAYS = 14;
const KIND_INDEX: Record<ReminderKind, number> = { weighIn: 1, training: 2, food: 3, checkin: 4, photos: 5 };

function at(date: string, time: string): Date {
  const [y, m, d] = date.split('-').map(Number);
  const [hh, mm] = time.split(':').map(Number);
  return new Date(y, m - 1, d, hh, mm);
}

/** Pure planner: which reminders to schedule over the next two weeks. */
export function planReminders(
  phase: Phase,
  settings: Settings,
  now: Date,
  status: { weighedToday: boolean; proteinToday?: number; photosThisWeek: number },
): PlannedReminder[] {
  const out: PlannedReminder[] = [];
  const t = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  const end = addDays(phase.startDate, phase.lengthWeeks * 7 - 1);
  const push = (kind: ReminderKind, offset: number, date: string, title: string, body: string) => {
    const time = reminderTime(settings, kind);
    if (!time) return;
    const when = at(date, time);
    if (when <= now) return;
    out.push({ id: KIND_INDEX[kind] * 1000 + offset, at: when, title, body });
  };

  for (let i = 0; i < HORIZON_DAYS; i++) {
    const date = addDays(t, i);
    if (date > end) break;
    const isToday = i === 0;

    if (!(isToday && status.weighedToday)) push('weighIn', i, date, '⚖️ Weigh in', 'Morning weigh-in – after the toilet, before eating or drinking.');

    if (date >= phase.startDate) {
      const day = sessionsOn(phase, date);
      const sport = sportOn(phase, date);
      if (day.sessions.length || sport) {
        const parts = [...day.sessions.map(({ session, run }) => run?.title ?? session.label), ...(sport ? [sport.name] : [])];
        const deload = phase.weeks[day.weekIndex - 1]?.tags.includes('deload');
        push(
          'training',
          i,
          date,
          `🏋️ Today: ${parts.join(' + ')}`,
          `${deload ? 'Deload week – lighter sessions. ' : ''}Target ${kcalFor(phase, date)} kcal · ${phase.energy.proteinG} g protein.`,
        );
      }

      const proteinDone = isToday && status.proteinToday !== undefined && status.proteinToday >= phase.energy.proteinG;
      if (!proteinDone) push('food', i, date, '🍽️ Food check', `Finish logging in MyFitnessPal. Protein target: ${phase.energy.proteinG} g.`);

      // Check-in opens on the first day of each phase-week from week 2.
      const w = day.weekIndex;
      if (w >= 2 && weekRange(phase, w).from === date) push('checkin', i, date, '📋 Weekly check-in ready', 'See how last week went and get this week\'s targets.');
    }

    const photoDay = settings.photoDay ?? 6;
    if (photoDay >= 0 && weekday(date) === photoDay) {
      const thisWeekDone = mondayOf(date) === mondayOf(t) && status.photosThisWeek >= 3;
      if (!thisWeekDone) push('photos', i, date, '📸 Progress photos', 'Front, side and back – same spot and lighting as last time.');
    }
  }
  return out;
}

/** Re-plans all reminders. Call on app open/resume and after anything that changes them. */
export async function rescheduleReminders(): Promise<void> {
  if (!isAndroidApp()) return;
  const perm = await LocalNotifications.checkPermissions();
  if (perm.display !== 'granted') return;
  const phase = await getActivePhase();
  const settings = await getSettings();
  const pending = await LocalNotifications.getPending();
  if (pending.notifications.length) await LocalNotifications.cancel({ notifications: pending.notifications.map((n) => ({ id: n.id })) });
  if (!phase) return;
  const t = today();
  const plan = planReminders(phase, settings, new Date(), {
    weighedToday: !!(await db.weights.get(t)),
    proteinToday: (await db.nutrition.get(t))?.proteinG,
    photosThisWeek: await db.photos.where('week').equals(mondayOf(t)).count(),
  });
  if (!plan.length) return;
  await LocalNotifications.schedule({
    notifications: plan.map((r) => ({ id: r.id, title: r.title, body: r.body, schedule: { at: r.at, allowWhileIdle: true }, smallIcon: 'ic_stat_coach' })),
  });
}

/** Asks Android for permission to show notifications (Android 13+). */
export async function enableReminders(): Promise<boolean> {
  if (!isAndroidApp()) return false;
  const res = await LocalNotifications.requestPermissions();
  if (res.display === 'granted') await rescheduleReminders();
  return res.display === 'granted';
}
