// Calendar (.ics) export of the plan: one event per planned session with its details, plus
// optional daily weigh-in and weekly check-in reminders. Times are "floating" (local time on
// whatever device opens the file). Event IDs are stable, so re-importing can update events.

import type { Phase } from '../types';
import type { ProgramSession } from '../engine/program';
import { EXERCISE_BY_ID } from '../engine/exercises';
import { addDays } from './dates';
import { sessionsOn } from './plan';
import { weekRange } from './checkin';

export interface CalendarOptions {
  from: string;
  workoutTime: string; // "18:00"
  runTime: string; // "07:00"
  alarmMinutes: number; // before each session; 0 = no alert
  weighIn?: { time: string };
  checkin?: boolean;
}

const pad = (n: number) => String(n).padStart(2, '0');
const dt = (date: string, time: string) => `${date.replace(/-/g, '')}T${time.replace(':', '')}00`;
const addMinutes = (time: string, mins: number): { time: string; dayOffset: number } => {
  const [h, m] = time.split(':').map(Number);
  const total = h * 60 + m + mins;
  return { time: `${pad(Math.floor((total % 1440) / 60))}:${pad(total % 60)}`, dayOffset: Math.floor(total / 1440) };
};

export function escapeText(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
}

/** Lines longer than 75 characters are folded (continuation lines start with a space). */
export function fold(line: string): string {
  if (line.length <= 75) return line;
  const parts: string[] = [];
  let i = 0;
  while (i < line.length) {
    let cut = Math.min(line.length, i + (i === 0 ? 75 : 74));
    // Never split an emoji (a surrogate pair) across two lines.
    const code = line.charCodeAt(cut);
    if (cut < line.length && code >= 0xdc00 && code <= 0xdfff) cut--;
    parts.push(line.slice(i, cut));
    i = cut;
  }
  return parts.join('\r\n ');
}

function event(lines: string[], uid: string, stamp: string, start: string, end: string, summary: string, description: string, alarmMin: number, extra: string[] = []) {
  lines.push(
    'BEGIN:VEVENT',
    `UID:${uid}`,
    `DTSTAMP:${stamp}`,
    `DTSTART:${start}`,
    `DTEND:${end}`,
    ...extra,
    `SUMMARY:${escapeText(summary)}`,
    `DESCRIPTION:${escapeText(description)}`,
  );
  if (alarmMin >= 0) lines.push('BEGIN:VALARM', 'ACTION:DISPLAY', `DESCRIPTION:${escapeText(summary)}`, `TRIGGER:-PT${alarmMin}M`, 'END:VALARM');
  lines.push('END:VEVENT');
}

export function buildIcs(phase: Phase, program: ProgramSession[], opts: CalendarOptions, now = new Date()): string {
  const stamp = now.toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z');
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Fitness Coach//EN', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH', 'X-WR-CALNAME:Coach'];
  const end = addDays(phase.startDate, phase.lengthWeeks * 7 - 1);
  const first = opts.from > phase.startDate ? opts.from : phase.startDate;
  const alarm = opts.alarmMinutes > 0 ? opts.alarmMinutes : -1;

  for (let d = first; d <= end; d = addDays(d, 1)) {
    const day = sessionsOn(phase, d);
    const week = phase.weeks[day.weekIndex - 1];
    const deload = week?.tags.includes('deload');
    for (const { session, run } of day.sessions) {
      const uid = `${phase.id ?? 0}-${day.weekIndex}-${session.id}@fitness-coach`;
      if (session.type === 'run') {
        const mins = run?.minutes ?? 30;
        const e = addMinutes(opts.runTime, mins);
        event(lines, uid, stamp, dt(d, opts.runTime), dt(addDays(d, e.dayOffset), e.time), `🏃 ${run?.title ?? session.label}`, run?.description ?? '', alarm);
      } else {
        const ps = program.find((p) => p.sessionId === session.id);
        const mins = phase.profile.sessionMinutes;
        const e = addMinutes(opts.workoutTime, mins);
        const list = (ps?.exercises ?? [])
          .map((x) => `• ${EXERCISE_BY_ID[x.exerciseId]?.name}: ${deload ? Math.max(1, Math.ceil(x.sets / 2)) : x.sets} × ${x.repMin}–${x.repMax}`)
          .join('\n');
        event(
          lines,
          uid,
          stamp,
          dt(d, opts.workoutTime),
          dt(addDays(d, e.dayOffset), e.time),
          `🏋️ ${session.label}${deload ? ' (deload)' : ''}`,
          `${list}\n\nOpen the Coach app for today's target weights and reps.`,
          alarm,
        );
      }
    }
  }

  if (opts.weighIn) {
    const e = addMinutes(opts.weighIn.time, 5);
    event(lines, `weighin-${phase.id ?? 0}@fitness-coach`, stamp, dt(first, opts.weighIn.time), dt(first, e.time), '⚖️ Weigh in', 'Morning, after the toilet, before eating. Log it in Coach.', 0, [
      `RRULE:FREQ=DAILY;UNTIL=${end.replace(/-/g, '')}T235959`,
    ]);
  }
  if (opts.checkin && phase.lengthWeeks >= 2) {
    const firstCheckin = weekRange(phase, 2).from;
    const startDay = firstCheckin > first ? firstCheckin : first;
    event(lines, `checkin-${phase.id ?? 0}@fitness-coach`, stamp, dt(startDay, '08:00'), dt(startDay, '08:15'), '📋 Weekly check-in', 'Open Coach → weekly check-in to review last week and update your targets.', 0, [
      `RRULE:FREQ=WEEKLY;UNTIL=${addDays(end, 7).replace(/-/g, '')}T235959`,
    ]);
  }
  lines.push('END:VCALENDAR');
  return lines.map(fold).join('\r\n') + '\r\n';
}
