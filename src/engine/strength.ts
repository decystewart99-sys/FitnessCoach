// Strength-plan structure: split, weekly hard sets per muscle, rep and effort guidance.
// Exercise selection and set-by-set prescriptions are built on top of this in the workout builder.

import type { Muscle, PlannedSession, Profile, StrengthPlan } from '../types';

export const MUSCLES: Muscle[] = ['chest', 'back', 'shoulders', 'biceps', 'triceps', 'quads', 'hamstrings', 'glutes', 'calves', 'abs'];
export const LEG_MUSCLES: Muscle[] = ['quads', 'hamstrings', 'glutes', 'calves'];

export const MUSCLE_LABEL: Record<Muscle, string> = {
  chest: 'Chest',
  back: 'Back',
  shoulders: 'Shoulders',
  biceps: 'Biceps',
  triceps: 'Triceps',
  quads: 'Quads',
  hamstrings: 'Hamstrings',
  glutes: 'Glutes',
  calves: 'Calves',
  abs: 'Abs',
};

const FOCUS: Record<string, string> = {
  full: 'Squat or hinge, a press, a pull, plus 1–2 isolation moves',
  upper: 'Horizontal + vertical press and pull, arms, side delts',
  lower: 'Squat pattern, hinge pattern, single-leg work, calves',
  push: 'Chest, shoulders, triceps',
  pull: 'Back, rear delts, biceps',
  legs: 'Quads, hamstrings, glutes, calves',
};

/**
 * Weekly hard sets per muscle, counted fractionally (a set that trains a muscle indirectly – e.g.
 * triceps in a bench press – counts as half). Targets sit where the dose-response curve starts to
 * flatten rather than at its maximum: most of the growth for a fraction of the time and fatigue,
 * which matters while dieting and running.
 */
export function weeklySetTargets(p: Profile, peakRunMinutes: number): Record<Muscle, number> {
  const base = { beginner: 8, intermediate: 10, advanced: 12 }[p.liftExperience];
  const muscleTop = p.goalRanking[0] === 'muscle';
  const heavyRunning = p.goalRanking[0] === 'run' || peakRunMinutes > 180;

  const targets = {} as Record<Muscle, number>;
  for (const m of MUSCLES) {
    // Even when muscle isn't the top goal, stay in the efficient zone rather than at maintenance:
    // the first ~8–10 weekly sets deliver most of the growth for the time they cost.
    let sets = base + (muscleTop ? 2 : 0);
    if (LEG_MUSCLES.includes(m) && heavyRunning) sets -= 2; // running already loads the legs
    // Calves get plenty from running; abs from bracing on compounds – a little direct work is enough.
    if (m === 'calves' || m === 'abs') sets = Math.min(sets, 6);
    targets[m] = Math.max(6, sets);
  }
  return targets;
}

export function buildStrengthPlan(p: Profile, sessions: PlannedSession[], splitName: string, peakRunMinutes: number): StrengthPlan {
  const strength = sessions.filter((s) => s.type === 'strength');
  return {
    splitName,
    sessions: strength.map((s) => ({ id: s.id, kind: s.strengthKind!, label: s.label, focus: FOCUS[s.strengthKind!] })),
    weeklySets: weeklySetTargets(p, peakRunMinutes),
    repGuide: 'Big compound lifts mostly 6–10 reps; isolation 10–20. Any rep range builds muscle when sets end close to failure – these are simply the most time-efficient.',
    rirGuide:
      'Stable exercises (machines, cables, isolation) 0–1 reps in reserve; heavy free-weight lifts 1–2. Sets that end closer to failure give more growth per set, so fewer sets are needed.',
  };
}
