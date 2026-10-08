// Decides how many strength and run sessions fit the week, then places them on the
// available days so that hard leg work doesn't land right before key runs.

import type { DayPlan, PlannedSession, Profile, RunSlot, StrengthDayKind } from '../types';
import { DAY_NAMES } from '../lib/dates';

export interface SessionCounts {
  strength: number;
  runs: number;
  notes: string[];
}

export function sessionCounts(p: Profile): SessionCounts {
  const notes: string[] = [];
  const days = p.trainingDays.length;
  const rank = (g: string) => p.goalRanking.indexOf(g as never);

  let runs = rank('run') === 0 && p.runContinuousMin >= 30 && days >= 5 ? 4 : rank('run') === 2 && p.runGoal.kind === 'none' ? 2 : 3;
  let strength = rank('muscle') === 0 ? 4 : rank('muscle') === 2 ? 2 : 3;
  if (strength === 2 && days >= 5) strength = 3;

  // Minimums that still give a training effect: lifting twice and running twice a week.
  const capacity = p.allowDoubles ? Math.min(days * 2, days + 3) : days;
  while (strength + runs > capacity) {
    const runLower = rank('run') > rank('muscle');
    if (runLower && runs > 2) runs--;
    else if (!runLower && strength > 2) strength--;
    else if (runs > 2) runs--;
    else if (strength > 2) strength--;
    else if (rank('run') > rank('muscle')) runs--;
    else strength--;
  }
  if (strength < 2 || runs < 2) {
    notes.push(
      'With this few days, one type of training only gets one session a week. Allowing two sessions on the same day (e.g. an easy run straight after lifting) would let the plan include more.',
    );
  }
  return { strength: Math.max(1, strength), runs: Math.max(1, runs), notes };
}

export function strengthSplit(count: number, p: Profile): { name: string; kinds: StrengthDayKind[] } {
  switch (count) {
    case 1:
      return { name: 'Full body ×1', kinds: ['full'] };
    case 2:
      return { name: 'Full body ×2', kinds: ['full', 'full'] };
    case 3:
      return p.liftExperience === 'beginner'
        ? { name: 'Full body ×3', kinds: ['full', 'full', 'full'] }
        : { name: 'Upper / Lower / Full body', kinds: ['upper', 'lower', 'full'] };
    case 4:
      return { name: 'Upper / Lower ×2', kinds: ['upper', 'lower', 'upper', 'lower'] };
    default:
      return { name: 'Upper / Lower / Push / Pull / Legs', kinds: ['upper', 'lower', 'push', 'pull', 'legs'] };
  }
}

const STRENGTH_LABEL: Record<StrengthDayKind, string> = {
  full: 'Full body',
  upper: 'Upper',
  lower: 'Lower',
  push: 'Push',
  pull: 'Pull',
  legs: 'Legs',
};

const RUN_LABEL: Record<RunSlot, string> = { easy: 'Easy run', quality: 'Quality run', long: 'Long run' };

export function buildSessions(strengthKinds: StrengthDayKind[], runCount: number): PlannedSession[] {
  const sessions: PlannedSession[] = [];
  const seen: Partial<Record<StrengthDayKind, number>> = {};
  const totals: Partial<Record<StrengthDayKind, number>> = {};
  strengthKinds.forEach((k) => (totals[k] = (totals[k] ?? 0) + 1));
  strengthKinds.forEach((kind, i) => {
    seen[kind] = (seen[kind] ?? 0) + 1;
    const suffix = (totals[kind] ?? 0) > 1 ? ` ${String.fromCharCode(64 + seen[kind]!)}` : '';
    sessions.push({ id: `s${i + 1}`, type: 'strength', strengthKind: kind, label: STRENGTH_LABEL[kind] + suffix });
  });
  const slots: RunSlot[] = runCount === 1 ? ['long'] : runCount === 2 ? ['long', 'easy'] : ['long', 'quality'];
  while (slots.length < runCount) slots.push('easy');
  let easyN = 0;
  slots.forEach((slot, i) => {
    const label = slot === 'easy' && slots.filter((s) => s === 'easy').length > 1 ? `Easy run ${++easyN}` : RUN_LABEL[slot];
    sessions.push({ id: `r${i + 1}`, type: 'run', runSlot: slot, label });
  });
  return sessions;
}

/** Lower-body fatigue from a strength session: 2 = heavy legs, 1 = some legs, 0 = none. */
function legLoad(s: PlannedSession): number {
  if (s.type !== 'strength') return 0;
  return s.strengthKind === 'lower' || s.strengthKind === 'legs' ? 2 : s.strengthKind === 'full' ? 1 : 0;
}

const isHardRun = (s: PlannedSession) => s.type === 'run' && (s.runSlot === 'quality' || s.runSlot === 'long');

/** Lower = better. Also returns human-readable reasons for the worst conflicts. */
export function scoreTemplate(template: DayPlan[], preferredLongRunDay?: number): { penalty: number; issues: string[] } {
  let penalty = 0;
  const issues: string[] = [];
  const byDay = (d: number) => template[(d + 7) % 7].sessions;

  for (let d = 0; d < 7; d++) {
    const today = byDay(d);
    const tomorrow = byDay(d + 1);
    const yesterday = byDay(d - 1);

    if (today.length >= 2) {
      penalty += 3;
      const strengthN = today.filter((s) => s.type === 'strength').length;
      const runN = today.length - strengthN;
      if (strengthN > 1 || runN > 1) penalty += 60;
      if (today.some((s) => s.runSlot === 'long')) {
        penalty += 40;
        issues.push(`${DAY_NAMES[d]}: the long run shares the day with lifting – it's better on its own.`);
      }
      const quality = today.some((s) => s.runSlot === 'quality');
      const legs = Math.max(...today.map(legLoad));
      if (quality && legs === 0) penalty += 1;
      if (!quality && legs > 0) penalty += 2;
      if (today.length > 2) penalty += 60;
    }

    const legsToday = Math.max(0, ...today.map(legLoad));
    if (legsToday > 0) {
      if (tomorrow.some((s) => s.runSlot === 'long')) {
        penalty += 6 * legsToday;
        if (legsToday === 2) issues.push(`${DAY_NAMES[d]}: leg training the day before the long run will leave your legs tired for it.`);
      }
      if (tomorrow.some((s) => s.runSlot === 'quality')) {
        penalty += 5 * legsToday;
        if (legsToday === 2) issues.push(`${DAY_NAMES[d]}: leg training the day before the quality run will blunt that workout.`);
      }
      if (yesterday.some((s) => s.runSlot === 'long')) penalty += 2 * legsToday;
      const legsTomorrow = Math.max(0, ...tomorrow.map(legLoad));
      if (legsTomorrow > 0) {
        penalty += 3 * legsToday * legsTomorrow;
        if (legsToday === 2 && legsTomorrow === 2) issues.push(`${DAY_NAMES[d]}: two leg sessions on back-to-back days.`);
        else issues.push(`${DAY_NAMES[d]} and ${DAY_NAMES[(d + 1) % 7]}: lifting legs on back-to-back days – a rest day between helps recovery.`);
      }
    }

    const upperToday = today.some((s) => s.type === 'strength' && s.strengthKind !== 'lower' && s.strengthKind !== 'legs');
    const upperTomorrow = tomorrow.some((s) => s.type === 'strength' && s.strengthKind !== 'lower' && s.strengthKind !== 'legs');
    if (upperToday && upperTomorrow) penalty += 2;

    if (today.some(isHardRun) && tomorrow.some(isHardRun)) {
      penalty += 8;
      issues.push(`${DAY_NAMES[d]}: two hard runs on consecutive days – keep at least one easy day between them.`);
    }
  }

  if (preferredLongRunDay !== undefined && !template[preferredLongRunDay]?.sessions.some((s) => s.runSlot === 'long')) {
    penalty += 15;
  }
  return { penalty, issues: [...new Set(issues)] };
}

function emptyWeek(): DayPlan[] {
  return Array.from({ length: 7 }, (_, day) => ({ day, sessions: [] as PlannedSession[] }));
}

/** Exhaustive search with pruning – the search space is small (≤ 9 sessions × ≤ 7 days). */
export function placeSessions(sessions: PlannedSession[], availableDays: number[], allowDoubles: boolean, longRunDay?: number): DayPlan[] {
  const days = [...availableDays].sort((a, b) => a - b);
  const maxPerDay = allowDoubles ? 2 : 1;
  const ordered = [...sessions].sort((a, b) => priority(a) - priority(b));
  const preferred = longRunDay !== undefined && days.includes(longRunDay) ? longRunDay : undefined;

  let best: DayPlan[] | null = null;
  let bestScore = Infinity;
  const week = emptyWeek();

  const lastDayOfKind: Record<string, number> = {};
  const kindKey = (s: PlannedSession) => (s.type === 'strength' ? `s:${s.strengthKind}` : `r:${s.runSlot}`);

  const recurse = (i: number) => {
    // Branch and bound: penalties only grow as sessions are added.
    if (i > 0 && scoreTemplate(week, undefined).penalty - 1 >= bestScore) return;
    if (i === ordered.length) {
      const { penalty } = scoreTemplate(week, preferred);
      // Small tie-breaker: prefer spreading sessions across more days.
      const used = week.filter((d) => d.sessions.length > 0).length;
      const score = penalty - used * 0.1;
      if (score < bestScore) {
        bestScore = score;
        best = week.map((d) => ({ day: d.day, sessions: [...d.sessions] }));
      }
      return;
    }
    const s = ordered[i];
    const candidates = s.runSlot === 'long' && preferred !== undefined ? [preferred] : days;
    const key = kindKey(s);
    const prevLast = lastDayOfKind[key];
    for (const d of candidates) {
      // Symmetry pruning: identical session kinds (e.g. two "Full body") only in increasing day order.
      if (prevLast !== undefined && d <= prevLast) continue;
      const slot = week[d].sessions;
      if (slot.length >= maxPerDay) continue;
      if (slot.some((x) => x.type === s.type)) continue; // never two lifts or two runs in a day
      slot.push(s);
      lastDayOfKind[key] = d;
      recurse(i + 1);
      slot.pop();
    }
    if (prevLast === undefined) delete lastDayOfKind[key];
    else lastDayOfKind[key] = prevLast;
  };
  recurse(0);

  if (!best) {
    // Shouldn't happen once counts fit capacity, but fall back to round-robin.
    const fallback = emptyWeek();
    ordered.forEach((s, i) => fallback[days[i % days.length]].sessions.push(s));
    return fallback;
  }
  // Keep runs before lifts within a day (run first, lift later – the usual advice for doubles).
  for (const d of best as DayPlan[]) d.sessions.sort((a, b) => (a.type === b.type ? 0 : a.type === 'run' ? -1 : 1));
  return best;
}

function priority(s: PlannedSession): number {
  if (s.runSlot === 'long') return 0;
  if (s.runSlot === 'quality') return 1;
  if (s.type === 'strength') return 2 + (2 - legLoad(s));
  return 6;
}
