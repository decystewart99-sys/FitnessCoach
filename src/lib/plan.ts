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

export function sessionsOn(phase: Phase, date: string): DaySessions {
  const weekIndex = weekIndexFor(phase, date);
  const week = phase.weeks[weekIndex - 1];
  // Template days are calendar weekdays (Mon–Sun), independent of the phase start day.
  const day = phase.template[weekday(date)];
  const inPhase = weekIndex >= 1 && weekIndex <= phase.lengthWeeks;
  return {
    date,
    weekIndex,
    sessions: inPhase ? day.sessions.map((session) => ({ session, run: session.type === 'run' ? week?.runs[session.id] : undefined })) : [],
  };
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
