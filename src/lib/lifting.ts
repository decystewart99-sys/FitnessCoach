// Glue between the lifting engine, the database and the UI: units, programme with saved
// swaps, and creating/resuming workout logs with targets filled in.

import { db } from '../db';
import type { Phase, Settings } from '../types';
import { EXERCISE_BY_ID, incrementKg, repRange, restSeconds, targetRir, type Exercise } from '../engine/exercises';
import { buildProgram, exerciseHistory, nextTarget, type ExerciseLog, type ProgramSession, type Swaps, type WorkoutLog } from '../engine/program';
import { sessionsOn } from './plan';
import { KG_PER_LB } from './units';
import { today } from './dates';

export type LiftUnit = 'kg' | 'lb';

export function liftUnit(settings: Settings): LiftUnit {
  return settings.weightUnit === 'kg' ? 'kg' : 'lb';
}

/** Rounds to what you can actually load: 0.5 kg or 1 lb steps. */
export function roundLoad(kg: number, unit: LiftUnit): number {
  return unit === 'kg' ? Math.round(kg * 2) / 2 : Math.round(kg / KG_PER_LB) * KG_PER_LB;
}

export function toLiftUnit(kg: number, unit: LiftUnit): number {
  return unit === 'kg' ? Math.round(kg * 2) / 2 : Math.round(kg / KG_PER_LB);
}

export function fromLiftUnit(v: number, unit: LiftUnit): number {
  return unit === 'kg' ? v : v * KG_PER_LB;
}

export function formatLoad(kg: number, unit: LiftUnit): string {
  return `${toLiftUnit(kg, unit)} ${unit}`;
}

function incrementFor(e: Exercise, unit: LiftUnit): number {
  if (unit === 'kg') return incrementKg(e);
  const lb = e.perHand ? 5 : e.pattern === 'squat' || e.pattern === 'hinge' ? 10 : 5;
  return lb * KG_PER_LB;
}

export async function loadSwaps(phaseId: number): Promise<Swaps> {
  const rows = await db.swaps.where('key').startsWith(`${phaseId}:`).toArray();
  return Object.fromEntries(rows.map((r) => [r.key.slice(String(phaseId).length + 1), r.exerciseId]));
}

export async function getProgram(phase: Phase): Promise<ProgramSession[]> {
  return buildProgram(phase, phase.id !== undefined ? await loadSwaps(phase.id) : {});
}

export async function finishedWorkouts(): Promise<WorkoutLog[]> {
  return (await db.workouts.toArray()).filter((w) => w.finishedAt);
}

/** Builds an exercise entry with set-by-set targets from history. */
export function makeExerciseLog(
  e: Exercise,
  plan: { sets: number; repMin: number; repMax: number; rir: number; restSec: number; slot?: string },
  history: WorkoutLog[],
  unit: LiftUnit,
  deload: boolean,
): ExerciseLog {
  const sets = deload ? Math.max(1, Math.ceil(plan.sets / 2)) : plan.sets;
  const t = nextTarget(e, { ...plan, sets }, exerciseHistory(history, e.id), {
    deload,
    incrementKg: incrementFor(e, unit),
    roundKg: (kg) => roundLoad(kg, unit),
    fmt: (kg) => formatLoad(kg, unit),
  });
  const note = t.stalled
    ? `${t.note} ⚠️ No new best in 3 sessions – consider a different variation (Swap), changing the rep range, or checking sleep and food.`
    : t.note;
  return {
    exerciseId: e.id,
    slot: plan.slot,
    repMin: plan.repMin,
    repMax: plan.repMax,
    rir: deload ? 3 : plan.rir,
    restSec: plan.restSec,
    note,
    sets: Array.from({ length: sets }, (_, i) => ({ weightKg: t.weightKg, reps: t.reps[i] ?? t.reps[0], rir: deload ? 3 : plan.rir, done: false })),
  };
}

export function defaultPlanFor(e: Exercise) {
  const [repMin, repMax] = repRange(e);
  return { sets: 3, repMin, repMax, rir: targetRir(e), restSec: restSeconds(e) };
}

/** Starts (or resumes today's unfinished) workout for a planned session. Returns the log id. */
export async function startPlannedWorkout(phase: Phase, sessionId: string, settings: Settings, date = today()): Promise<number> {
  const existing = (await db.workouts.where('date').equals(date).toArray()).find((w) => w.sessionId === sessionId && !w.finishedAt);
  if (existing?.id) return existing.id;

  const program = await getProgram(phase);
  const session = program.find((s) => s.sessionId === sessionId);
  if (!session) throw new Error('Session not found in the current plan.');
  const week = phase.weeks[sessionsOn(phase, date).weekIndex - 1];
  const deload = !!week?.tags.includes('deload');
  const history = await finishedWorkouts();
  const unit = liftUnit(settings);

  const log: WorkoutLog = {
    date,
    phaseId: phase.id,
    sessionId,
    label: session.label,
    deload,
    startedAt: new Date().toISOString(),
    exercises: session.exercises.map((pe) => makeExerciseLog(EXERCISE_BY_ID[pe.exerciseId], pe, history, unit, deload)),
  };
  return (await db.workouts.add(log)) as number;
}

export async function startFreeWorkout(date = today()): Promise<number> {
  return (await db.workouts.add({ date, label: 'Free workout', startedAt: new Date().toISOString(), exercises: [] })) as number;
}
