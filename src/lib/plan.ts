// Helpers for reading "what's on" for a given day from the active phase.

import type { Phase, PlannedSession, RunPrescription } from '../types';
import { addDays, daysBetween, weekday } from './dates';
import { dayTarget, runKcal, strengthSessionKcal } from '../engine/energy';

export interface DaySessions {
  date: string;
  weekIndex: number;
  sessions: Array<{ session: PlannedSession; run?: RunPrescription }>;
}

export function weekIndexFor(phase: Phase, date: string): number {
  return Math.floor(daysBetween(phase.startDate, date) / 7) + 1;
}

export const moveKey = (weekIndex: number, sessionId: string) => `${weekIndex}:${sessionId}`;

export function sessionsOn(phase: Phase, date: string): DaySessions {
  const weekIndex = weekIndexFor(phase, date);
  const week = phase.weeks[weekIndex - 1];
  const inPhase = weekIndex >= 1 && weekIndex <= phase.lengthWeeks;
  if (!inPhase) return { date, weekIndex, sessions: [] };
  const moves = phase.moves ?? {};
  // Template days are calendar weekdays (Mon–Sun), independent of the phase start day.
  const planned = phase.template[weekday(date)].sessions.filter((s) => moves[moveKey(weekIndex, s.id)] === undefined);
  // Sessions from other days of this week that were rescheduled onto this date.
  const movedIn = phase.template
    .flatMap((d) => d.sessions)
    .filter((s) => moves[moveKey(weekIndex, s.id)] === date && !planned.includes(s));
  return {
    date,
    weekIndex,
    sessions: [...movedIn.filter((s) => s.type === 'run'), ...planned, ...movedIn.filter((s) => s.type !== 'run')].map((session) => ({
      session,
      run: session.type === 'run' ? week?.runs[session.id] : undefined,
    })),
  };
}

/** The date a session was originally planned for in a given week. */
export function plannedDate(phase: Phase, weekIndex: number, sessionId: string): string | undefined {
  const day = phase.template.find((d) => d.sessions.some((s) => s.id === sessionId))?.day;
  if (day === undefined) return undefined;
  const weekStart = addDays(phase.startDate, (weekIndex - 1) * 7);
  // Phase weeks may not start on Monday; find the date in this phase-week with that weekday.
  for (let i = 0; i < 7; i++) {
    const d = addDays(weekStart, i);
    if (weekday(d) === day) return d;
  }
  return undefined;
}

export function nextSessionDay(phase: Phase, after: string, maxDays = 14): DaySessions | undefined {
  for (let i = 1; i <= maxDays; i++) {
    const d = sessionsOn(phase, addDays(after, i));
    if (d.sessions.length) return d;
  }
  return undefined;
}

/** Calorie target for one day, shifted toward training days. */
export function kcalFor(phase: Phase, date: string): number {
  const { weekIndex, sessions } = sessionsOn(phase, date);
  if (weekIndex < 1 || weekIndex > phase.lengthWeeks) return phase.energy.targetKcal;
  const week = phase.weeks[weekIndex - 1];
  const base = week?.kcalTarget ?? phase.energy.targetKcal;
  const kg = phase.profile.weightKg;
  const dayKcal = sessions.reduce(
    (a, { session, run }) =>
      a + (session.type === 'strength' ? strengthSessionKcal(kg, phase.profile.sessionMinutes) : runKcal(kg, run?.minutes ?? 0, run?.kind === 'runwalk')),
    0,
  );
  return dayTarget(base, dayKcal, phase.energy.exerciseKcalPerDay, phase.energy.floorKcal);
}
