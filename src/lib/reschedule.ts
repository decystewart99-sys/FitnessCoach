// Missed sessions: find them, and suggest a sensible day later this week – never stacking two
// lifts or two runs on one day, never leg work right before a key run, never hard runs back to
// back. If nothing fits, skipping is the advice: catching up by cramming does more harm than good.

import type { Phase, PlannedSession } from '../types';
import { addDays } from './dates';
import { moveKey, sessionsOn, weekIndexFor } from './plan';
import { weekRange } from './checkin';

export interface Missed {
  session: PlannedSession;
  weekIndex: number;
  /** Date it was due (original, or the date it had been moved to). */
  due: string;
  suggestion?: string;
  advice: string;
}

const legs = (s: PlannedSession) => s.type === 'strength' && (s.strengthKind === 'lower' || s.strengthKind === 'legs' || s.strengthKind === 'full');
const heavyLegs = (s: PlannedSession) => s.type === 'strength' && (s.strengthKind === 'lower' || s.strengthKind === 'legs');
const hard = (s: PlannedSession) => s.type === 'run' && (s.runSlot === 'long' || s.runSlot === 'quality');

/** Sessions due before today in the current phase-week that weren't logged or skipped. */
export function findMissed(phase: Phase, today: string, doneSessionIds: Set<string>): Missed[] {
  const W = weekIndexFor(phase, today);
  if (W < 1 || W > phase.lengthWeeks) return [];
  const { from, to } = weekRange(phase, W);
  const found: Array<{ session: PlannedSession; due: string }> = [];
  for (let d = from; d < today; d = addDays(d, 1)) {
    for (const { session } of sessionsOn(phase, d).sessions) if (!doneSessionIds.has(session.id)) found.push({ session, due: d });
  }
  // Place the most important sessions first, and let each suggestion see the earlier ones,
  // so two missed runs are never both offered the same day.
  const rank = (s: PlannedSession) => (s.runSlot === 'long' ? 0 : s.runSlot === 'quality' ? 1 : s.type === 'strength' ? 2 : 3);
  let hypothetical = phase;
  const out: Missed[] = [];
  for (const { session, due } of [...found].sort((a, b) => rank(a.session) - rank(b.session))) {
    const suggestion = suggestDay(hypothetical, session, today, to);
    if (suggestion) hypothetical = withMove(hypothetical, W, session.id, suggestion);
    out.push({
      session,
      weekIndex: W,
      due,
      suggestion,
      advice: suggestion
        ? 'Fits later this week without clashing with your key sessions.'
        : hard(session)
          ? "No safe slot left this week – skip it rather than squeezing a hard run next to another one. Next week's plan carries on as normal."
          : 'No good slot left this week – it would clash with your other sessions. Skip it; missing one session makes no real difference.',
    });
  }
  return out.sort((a, b) => a.due.localeCompare(b.due));
}

export function suggestDay(phase: Phase, session: PlannedSession, today: string, weekEnd: string): string | undefined {
  const maxPerDay = phase.profile.allowDoubles ? 2 : 1;
  const on = (d: string) => sessionsOn(phase, d).sessions.map((s) => s.session).filter((s) => s.id !== session.id);
  for (let d = today; d <= weekEnd; d = addDays(d, 1)) {
    const day = on(d);
    if (day.length >= maxPerDay || day.some((s) => s.type === session.type)) continue;
    const next = on(addDays(d, 1));
    const prev = on(addDays(d, -1));
    if (legs(session) && (next.some(hard) || day.some((s) => s.runSlot === 'long'))) continue;
    // No leg sessions on back-to-back days.
    if (legs(session) && (next.some(legs) || prev.some(legs))) continue;
    if (hard(session)) {
      if (day.some(hard) || next.some(hard) || prev.some(hard) || prev.some(heavyLegs)) continue;
      if (session.runSlot === 'long' && day.some(legs)) continue;
    }
    return d;
  }
  return undefined;
}

export function withMove(phase: Phase, weekIndex: number, sessionId: string, to: string | 'skip'): Phase {
  return { ...phase, moves: { ...(phase.moves ?? {}), [moveKey(weekIndex, sessionId)]: to } };
}
