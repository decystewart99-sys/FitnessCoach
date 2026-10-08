// Builds concrete workouts from the phase's split + weekly set targets, and works out
// set-by-set targets from training history (double progression).

import type { Muscle, Phase, StrengthDayKind } from '../types';
import {
  availableEquipment,
  candidatesFor,
  EXERCISE_BY_ID,
  isRiskyFor,
  repRange,
  restSeconds,
  targetRir,
  type Exercise,
  type Pattern,
} from './exercises';
import { MUSCLES } from './strength';

// ---------------------------------------------------------------- types

export interface ProgramExercise {
  slot: string; // `${sessionId}:${index}` – stable key for swaps
  exerciseId: string;
  sets: number;
  repMin: number;
  repMax: number;
  rir: number;
  restSec: number;
  alternatives: string[];
  /** Loads an area the user flagged, because nothing safer fits their equipment. */
  risky: boolean;
}

export interface ProgramSession {
  sessionId: string;
  label: string;
  kind: StrengthDayKind;
  exercises: ProgramExercise[];
}

export interface SetLog {
  weightKg?: number;
  reps?: number;
  rir?: number;
  done: boolean;
}

export interface ExerciseLog {
  exerciseId: string;
  slot?: string;
  sets: SetLog[];
  repMin: number;
  repMax: number;
  rir: number;
  restSec: number;
  note?: string;
}

export interface WorkoutLog {
  id?: number;
  date: string;
  phaseId?: number;
  sessionId?: string;
  label: string;
  deload?: boolean;
  startedAt: string;
  finishedAt?: string;
  exercises: ExerciseLog[];
}

export type Swaps = Record<string, string>;

// ---------------------------------------------------------------- templates

/** Movement slots per session type. Repeated session types (Upper A/B) use the next variant. */
const TEMPLATES: Record<StrengthDayKind, Pattern[][]> = {
  full: [
    ['squat', 'h_push', 'v_pull', 'hinge', 'side_delt', 'triceps'],
    ['hinge', 'lunge', 'h_pull', 'h_push', 'side_delt', 'biceps'],
    ['squat', 'h_push', 'h_pull', 'knee_flex', 'calf', 'abs'],
  ],
  upper: [
    ['h_push', 'v_pull', 'v_push', 'h_pull', 'side_delt', 'triceps', 'biceps'],
    ['h_push', 'h_pull', 'v_pull', 'chest_iso', 'side_delt', 'biceps', 'triceps'],
  ],
  lower: [
    ['squat', 'hinge', 'lunge', 'knee_flex', 'calf', 'abs'],
    ['hinge', 'squat', 'knee_ext', 'knee_flex', 'calf', 'abs'],
  ],
  push: [['h_push', 'v_push', 'chest_iso', 'side_delt', 'triceps']],
  pull: [['v_pull', 'h_pull', 'rear_delt', 'biceps', 'abs']],
  legs: [['squat', 'hinge', 'knee_ext', 'knee_flex', 'calf']],
};

/** If nothing fits a pattern with the available equipment, try this one instead (or drop the slot). */
const FALLBACK: Partial<Record<Pattern, Pattern>> = {
  v_pull: 'h_pull',
  knee_ext: 'lunge',
  knee_flex: 'hinge',
  v_push: 'h_push',
  rear_delt: 'h_pull',
};

// ---------------------------------------------------------------- program

export function buildProgram(phase: Phase, swaps: Swaps = {}): ProgramSession[] {
  const p = phase.profile;
  const equip = availableEquipment(p.equipment, p.homeEquipment);
  // Order by session id (s1, s2 …) – the A/B/C order – not by weekday, so moving
  // "Full body C" to Monday doesn't give it Full body A's exercises.
  const strengthSessions = phase.template
    .flatMap((d) => d.sessions)
    .filter((s) => s.type === 'strength')
    .sort((a, b) => a.id.localeCompare(b.id, undefined, { numeric: true }));
  const kindCount: Partial<Record<StrengthDayKind, number>> = {};
  const patternCount: Partial<Record<Pattern, number>> = {};

  // 1. Pick exercises.
  const sessions: ProgramSession[] = strengthSessions.map((s) => {
    const kind = s.strengthKind!;
    const variants = TEMPLATES[kind];
    const n = (kindCount[kind] = (kindCount[kind] ?? 0) + 1);
    const variant = variants[(n - 1) % variants.length];
    const used = new Set<string>();
    const exercises: ProgramExercise[] = [];
    variant.forEach((pattern, i) => {
      let cands = candidatesFor(pattern, equip, p.injuries);
      if (!cands.length && FALLBACK[pattern]) cands = candidatesFor(FALLBACK[pattern]!, equip, p.injuries);
      cands = cands.filter((c) => !used.has(c.id));
      if (!cands.length) return;
      const occ = (patternCount[pattern] = (patternCount[pattern] ?? 0) + 1) - 1;
      const safeCount = cands.filter((c) => !isRiskyFor(c, p.injuries)).length || cands.length;
      // Rotate through the best options so A/B days differ, but never into injury-risky ones if safe ones exist.
      const auto = cands[occ % Math.min(safeCount, 2)];
      const slot = `${s.id}:${i}`;
      const swapped = swaps[slot] ? EXERCISE_BY_ID[swaps[slot]] : undefined;
      const chosen = swapped ?? auto;
      used.add(chosen.id);
      const [repMin, repMax] = repRange(chosen);
      exercises.push({
        slot,
        exerciseId: chosen.id,
        sets: 3,
        repMin,
        repMax,
        rir: targetRir(chosen),
        restSec: restSeconds(chosen),
        alternatives: cands.filter((c) => c.id !== chosen.id).map((c) => c.id),
        risky: isRiskyFor(chosen, p.injuries),
      });
    });
    return { sessionId: s.id, label: s.label, kind, exercises };
  });

  // 2. Spread each muscle's weekly set target across the slots that train it directly.
  const targets = phase.strength.weeklySets;
  const slotsPerMuscle: Partial<Record<Muscle, number>> = {};
  for (const ses of sessions) for (const ex of ses.exercises) {
    const m = primaryMuscle(EXERCISE_BY_ID[ex.exerciseId]);
    slotsPerMuscle[m] = (slotsPerMuscle[m] ?? 0) + 1;
  }
  for (const ses of sessions) for (const ex of ses.exercises) {
    const m = primaryMuscle(EXERCISE_BY_ID[ex.exerciseId]);
    ex.sets = clamp(Math.round(targets[m] / (slotsPerMuscle[m] ?? 1)), 2, 4);
  }

  // 3. Fit each session into the time available.
  for (const ses of sessions) fitToTime(ses, p.sessionMinutes);
  return sessions;
}

function primaryMuscle(e: Exercise): Muscle {
  return (Object.entries(e.muscles).find(([, v]) => v === 1)?.[0] ?? 'abs') as Muscle;
}

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

/** Minutes a session takes: each set ≈ 45 s of work + its rest, plus ~8 min warm-up. */
export function sessionMinutes(ses: ProgramSession): number {
  return 8 + ses.exercises.reduce((a, ex) => a + (ex.sets * (45 + ex.restSec)) / 60, 0);
}

function fitToTime(ses: ProgramSession, minutes: number) {
  const kindOf = (ex: ProgramExercise) => EXERCISE_BY_ID[ex.exerciseId].kind;
  const kindRank = { isolation: 0, secondary: 1, compound: 2 };
  // Take a set from whichever exercise has the most; on ties prefer isolation, then later in the session.
  while (sessionMinutes(ses) > minutes) {
    let pick: ProgramExercise | undefined;
    ses.exercises.forEach((ex) => {
      if (ex.sets <= 2) return;
      if (!pick || ex.sets > pick.sets || (ex.sets === pick.sets && kindRank[kindOf(ex)] <= kindRank[kindOf(pick)])) pick = ex;
    });
    if (!pick) break;
    pick.sets--;
  }
  // Still too long: drop trailing isolation exercises (keep at least 3 exercises).
  while (sessionMinutes(ses) > minutes && ses.exercises.length > 3) {
    const idx = [...ses.exercises].reverse().findIndex((ex) => kindOf(ex) === 'isolation');
    if (idx < 0) break;
    ses.exercises.splice(ses.exercises.length - 1 - idx, 1);
  }
}

/** Planned hard sets per muscle per week (secondary muscles count half). */
export function plannedWeeklySets(program: ProgramSession[]): Record<Muscle, number> {
  const out = Object.fromEntries(MUSCLES.map((m) => [m, 0])) as Record<Muscle, number>;
  for (const ses of program) for (const ex of ses.exercises) {
    for (const [m, credit] of Object.entries(EXERCISE_BY_ID[ex.exerciseId].muscles)) out[m as Muscle] += ex.sets * (credit as number);
  }
  return out;
}

// ---------------------------------------------------------------- history & progression

export function e1rm(weightKg: number, reps: number): number {
  return reps <= 1 ? weightKg : weightKg * (1 + Math.min(reps, 15) / 30);
}

export interface ExerciseSession {
  date: string;
  workoutId?: number;
  sets: SetLog[];
  bestE1rm?: number;
  topWeight?: number;
  totalReps: number;
  volume: number;
}

/** Completed sessions of one exercise, oldest first. */
export function exerciseHistory(logs: WorkoutLog[], exerciseId: string): ExerciseSession[] {
  const out: ExerciseSession[] = [];
  for (const w of [...logs].sort((a, b) => a.date.localeCompare(b.date) || a.startedAt.localeCompare(b.startedAt))) {
    for (const ex of w.exercises) {
      if (ex.exerciseId !== exerciseId) continue;
      const done = ex.sets.filter((s) => s.done && s.reps);
      if (!done.length) continue;
      const weighted = done.filter((s) => s.weightKg);
      out.push({
        date: w.date,
        workoutId: w.id,
        sets: done,
        bestE1rm: weighted.length ? Math.max(...weighted.map((s) => e1rm(s.weightKg!, s.reps!))) : undefined,
        topWeight: weighted.length ? Math.max(...weighted.map((s) => s.weightKg!)) : undefined,
        totalReps: done.reduce((a, s) => a + s.reps!, 0),
        volume: done.reduce((a, s) => a + (s.weightKg ?? 0) * s.reps!, 0),
      });
    }
  }
  return out;
}

/** No new best (e1RM, or reps for bodyweight work) in the last 3 sessions. */
export function isStalled(history: ExerciseSession[]): boolean {
  if (history.length < 4) return false;
  const score = (s: ExerciseSession) => s.bestE1rm ?? s.totalReps;
  const recent = history.slice(-3);
  const before = history.slice(0, -3);
  return Math.max(...recent.map(score)) <= Math.max(...before.map(score));
}

export interface Target {
  weightKg?: number;
  reps: number[];
  note: string;
  kind: 'first' | 'increase' | 'reps' | 'decrease' | 'deload' | 'harder';
  stalled: boolean;
}

/**
 * Double progression: hit the top of the rep range on every set → add weight and drop to the
 * bottom of the range; otherwise keep the weight and add a rep where possible.
 */
export function nextTarget(
  ex: Exercise,
  plan: { sets: number; repMin: number; repMax: number; rir: number },
  history: ExerciseSession[],
  opts: { deload?: boolean; incrementKg: number; roundKg: (kg: number) => number; fmt: (kg: number) => string },
): Target {
  const last = history[history.length - 1];
  const stalled = isStalled(history);
  const sets = plan.sets;
  if (!last) {
    return {
      reps: Array(sets).fill(plan.repMax),
      kind: 'first',
      stalled: false,
      note: ex.bodyweight
        ? `First time: do as many good reps as you can up to ${plan.repMax}, stopping ${plan.rir} short of failure.`
        : `First time: pick a weight you could lift about ${plan.repMax + plan.rir} times, and do ${plan.repMin}–${plan.repMax} reps. Log what you actually do – next time the app sets your targets.`,
    };
  }
  const done = last.sets;
  const w = last.topWeight;
  const lastReps = done.map((s) => s.reps!);
  const repsAt = (i: number) => lastReps[i] ?? lastReps[lastReps.length - 1];
  const summary = `Last time: ${w ? `${opts.fmt(w)} × ` : ''}${lastReps.join(', ')}`;

  if (opts.deload) {
    return {
      weightKg: w,
      reps: Array(sets).fill(plan.repMin),
      kind: 'deload',
      stalled,
      note: `Deload week: same weight, fewer sets, and stop 3–4 reps short of failure. ${summary}.`,
    };
  }

  const atWeight = w === undefined ? done : done.filter((s) => (s.weightKg ?? 0) >= w - 0.01);
  const hitTop = atWeight.length >= sets && atWeight.every((s) => s.reps! >= plan.repMax);
  if (hitTop) {
    if (!w || ex.bodyweight) {
      return {
        weightKg: w,
        reps: Array(sets).fill(plan.repMax),
        kind: 'harder',
        stalled,
        note: `${summary}. You hit ${plan.repMax}+ on every set – make it harder: add weight (a backpack works), slow the lowering, or swap to a harder variation.`,
      };
    }
    const next = opts.roundKg(w + opts.incrementKg);
    return {
      weightKg: next,
      reps: Array(sets).fill(plan.repMin),
      kind: 'increase',
      stalled,
      note: `${summary}. Top of the range on every set → add weight. Aim for ${plan.repMin}+ reps per set.`,
    };
  }

  const belowRange = lastReps.filter((r) => r < plan.repMin).length > lastReps.length / 2;
  if (belowRange && w) {
    return {
      weightKg: opts.roundKg(w * 0.92),
      reps: Array(sets).fill(plan.repMin),
      kind: 'decrease',
      stalled,
      note: `${summary}. That was below the ${plan.repMin}–${plan.repMax} range, so the weight drops ~8% to keep you in it.`,
    };
  }

  return {
    weightKg: w,
    reps: Array.from({ length: sets }, (_, i) => Math.min(plan.repMax, Math.max(plan.repMin, repsAt(i) + 1))),
    kind: 'reps',
    stalled,
    note: `${summary}. Same weight – beat last time by a rep where you can.`,
  };
}

/** Hard sets per muscle actually completed in [from, to]. */
export function completedSets(logs: WorkoutLog[], from: string, to: string): Record<Muscle, number> {
  const out = Object.fromEntries(MUSCLES.map((m) => [m, 0])) as Record<Muscle, number>;
  for (const w of logs) {
    if (w.date < from || w.date > to) continue;
    for (const ex of w.exercises) {
      const e = EXERCISE_BY_ID[ex.exerciseId];
      if (!e) continue;
      const n = ex.sets.filter((s) => s.done).length;
      for (const [m, credit] of Object.entries(e.muscles)) out[m as Muscle] += n * (credit as number);
    }
  }
  return out;
}
