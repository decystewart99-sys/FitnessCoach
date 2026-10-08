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

export function weeklySetTargets(p: Profile, strengthSessions: number, peakRunMinutes: number): Record<Muscle, number> {
  // Deficit + running both eat into recovery, so start near the low end of 10–20 sets.
  const base = { beginner: 10, intermediate: 12, advanced: 14 }[p.liftExperience];
  const muscleTop = p.goalRanking[0] === 'muscle';
  const muscleLast = p.goalRanking[2] === 'muscle';
  const heavyRunning = p.goalRanking[0] === 'run' || peakRunMinutes > 180;

  const targets = {} as Record<Muscle, number>;
  for (const m of MUSCLES) {
    let sets = base + (muscleTop ? 2 : 0) - (muscleLast ? 2 : 0);
    if (LEG_MUSCLES.includes(m) && heavyRunning) sets -= 2; // running already loads the legs
    if (m === 'biceps' || m === 'triceps' || m === 'abs' || m === 'calves') sets -= 2; // indirect work from compounds
    targets[m] = Math.max(6, sets);
  }

  // Fit inside the time available: ~2.5 min per hard set including rest (compounds rest longer,
  // isolation shorter), after a 10 min warm-up.
  const capacity = Math.floor(((p.sessionMinutes - 10) / 2.5) * strengthSessions);
  const direct = Object.values(targets).reduce((a, b) => a + b, 0) * 0.7; // compounds hit several muscles at once
  if (direct > capacity) {
    const scale = capacity / direct;
    for (const m of MUSCLES) targets[m] = Math.max(4, Math.round(targets[m] * scale));
  }
  return targets;
}

export function buildStrengthPlan(p: Profile, sessions: PlannedSession[], splitName: string, peakRunMinutes: number): StrengthPlan {
  const strength = sessions.filter((s) => s.type === 'strength');
  return {
    splitName,
    sessions: strength.map((s) => ({ id: s.id, kind: s.strengthKind!, label: s.label, focus: FOCUS[s.strengthKind!] })),
    weeklySets: weeklySetTargets(p, strength.length, peakRunMinutes),
    repGuide: 'Big compound lifts mostly 5–10 reps; isolation exercises 8–15+ reps.',
    rirGuide:
      'Most sets 1–3 reps in reserve (RIR). Last set of isolation exercises can go to 0–1 RIR. Compounds stay at 2–3 RIR – grinding them to failure adds fatigue without adding much growth.',
  };
}
