// Weekly check-in: reviews the previous phase-week (weight, food, training, performance),
// runs the adaptive calorie coach, and suggests a deload or diet break when warranted.

import type { CheckIn, NutritionEntry, Phase, RunLog, WeightEntry } from '../types';
import { weeklyCheckIn, type CoachResult } from '../engine/adaptive';
import { exerciseHistory, isStalled, type WorkoutLog } from '../engine/program';
import { macrosFor } from '../engine/energy';
import { EXERCISE_BY_ID } from '../engine/exercises';
import { addDays, daysBetween } from './dates';
import { pace } from './runStats';
import { sessionsOn } from './plan';

export function weekRange(phase: Phase, weekIndex: number): { from: string; to: string } {
  const from = addDays(phase.startDate, (weekIndex - 1) * 7);
  return { from, to: addDays(from, 6) };
}

export function currentWeekIndex(phase: Phase, today: string): number {
  return Math.floor(daysBetween(phase.startDate, today) / 7) + 1;
}

/** A check-in is due from the start of week 2 until it's done for that week. */
export function checkinDue(phase: Phase, today: string, checkins: CheckIn[]): { due: boolean; weekIndex: number; weekStart: string } {
  const w = currentWeekIndex(phase, today);
  const weekStart = weekRange(phase, w).from;
  const done = checkins.some((c) => c.phaseId === phase.id && c.week === weekStart);
  return { due: w >= 2 && w <= phase.lengthWeeks + 1 && !done, weekIndex: w, weekStart };
}

export interface Review {
  weekIndex: number; // the week being planned (check-in week)
  previousTdee: number;
  reviewed: { from: string; to: string };
  coach: CoachResult;
  food: { days: number; avgKcal?: number; avgProtein?: number };
  training: { strengthPlanned: number; strengthDone: number; runsPlanned: number; runsDone: number; km: number };
  lifts: { up: string[]; down: string[]; stalled: string[] };
  runPerf: { easyRpe?: number; paceChangePct?: number };
  suggestDeload: boolean;
  suggestDietBreak: boolean;
  notes: string[];
}

export interface ReviewInput {
  phase: Phase;
  today: string;
  checkins: CheckIn[];
  weights: WeightEntry[];
  nutrition: NutritionEntry[];
  workouts: WorkoutLog[]; // finished
  runs: RunLog[];
}

const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : undefined);

export function buildReview({ phase, today, checkins, weights, nutrition, workouts, runs }: ReviewInput): Review {
  const W = currentWeekIndex(phase, today);
  const reviewed = weekRange(phase, W - 1);
  const asOf = weekRange(phase, W).from;
  const prior = checkins.filter((c) => c.phaseId === phase.id && c.week < asOf).sort((a, b) => a.week.localeCompare(b.week));
  const last = prior[prior.length - 1];
  let stalledWeeks = 0;
  for (let i = prior.length - 1; i >= 0 && prior[i].stalled; i--) stalledWeeks++;
  const thisWeek = phase.weeks[W - 1];

  const coach = weeklyCheckIn({
    asOf,
    weights,
    nutrition,
    previousTdee: last?.tdee ?? phase.energy.maintenanceKcal,
    previousTarget: last?.newTarget ?? phase.energy.targetKcal,
    plannedLossPct: phase.profile.weeklyLossPct,
    floorKcal: phase.energy.floorKcal,
    stalledWeeks,
    daysIntoPhase: daysBetween(phase.startDate, asOf),
    dietBreakNextWeek: !!thisWeek?.tags.includes('diet_break'),
    lastWeekDietBreak: !!phase.weeks[W - 2]?.tags.includes('diet_break'),
  });

  // Food
  const food = nutrition.filter((n) => n.date >= reviewed.from && n.date <= reviewed.to && n.kcal > 0);

  // Training adherence (by planned session id within the reviewed week)
  let strengthPlanned = 0;
  let runsPlanned = 0;
  for (let i = 0; i < 7; i++) {
    for (const s of sessionsOn(phase, addDays(reviewed.from, i)).sessions) {
      if (s.session.type === 'strength') strengthPlanned++;
      else runsPlanned++;
    }
  }
  const inWeek = <T extends { date: string }>(xs: T[]) => xs.filter((x) => x.date >= reviewed.from && x.date <= reviewed.to);
  const weekWorkouts = inWeek(workouts);
  const weekRuns = inWeek(runs);
  const training = {
    strengthPlanned,
    strengthDone: weekWorkouts.length,
    runsPlanned,
    runsDone: weekRuns.length,
    km: weekRuns.reduce((a, r) => a + (r.distanceKm ?? 0), 0),
  };

  // Lift performance over the last two weeks: compare each exercise's latest session with its previous one.
  const recentFrom = addDays(asOf, -14);
  const recentIds = [...new Set(workouts.filter((w) => w.date >= recentFrom && w.date < asOf).flatMap((w) => w.exercises.map((e) => e.exerciseId)))];
  const lifts = { up: [] as string[], down: [] as string[], stalled: [] as string[] };
  for (const id of recentIds) {
    const h = exerciseHistory(workouts.filter((w) => w.date < asOf), id);
    const name = EXERCISE_BY_ID[id]?.name ?? id;
    if (isStalled(h)) lifts.stalled.push(name);
    if (h.length < 2) continue;
    const score = (i: number) => h[i].bestE1rm ?? h[i].totalReps;
    const change = (score(h.length - 1) - score(h.length - 2)) / score(h.length - 2);
    if (change > 0.005) lifts.up.push(name);
    else if (change < -0.02) lifts.down.push(name);
  }

  // Run performance: effort on easy runs, and easy pace vs the four weeks before.
  const easy = (r: RunLog) => r.kind === 'easy' || r.kind === 'long';
  const easyRpe = avg(weekRuns.filter((r) => easy(r) && r.rpe).map((r) => r.rpe!));
  const recentPace = avg(runs.filter((r) => easy(r) && r.date >= addDays(asOf, -14) && r.date < asOf).map(pace).filter((p): p is number => !!p));
  const basePace = avg(runs.filter((r) => easy(r) && r.date >= addDays(asOf, -42) && r.date < addDays(asOf, -14)).map(pace).filter((p): p is number => !!p));
  const paceChangePct = recentPace && basePace ? ((recentPace - basePace) / basePace) * 100 : undefined;

  const liftsDropping = (lifts.down.length >= 2 && lifts.down.length >= lifts.up.length) || lifts.stalled.length >= 3;
  const runsDropping = (easyRpe !== undefined && easyRpe >= 6) || (paceChangePct !== undefined && paceChangePct > 5);
  const recentTags = (n: number, tag: 'deload' | 'diet_break') => phase.weeks.slice(Math.max(0, W - 1 - n), W - 1).some((w) => w.tags.includes(tag));

  const notes: string[] = [];
  const suggestDeload = liftsDropping && !thisWeek?.tags.includes('deload') && !recentTags(3, 'deload');
  if (suggestDeload) {
    notes.push(
      `Performance is slipping on several lifts (${[...lifts.down, ...lifts.stalled].slice(0, 3).join(', ')}). A deload this week – half the sets, same weights – usually brings it back.`,
    );
  }
  const strugglingInDeficit = liftsDropping && runsDropping && W >= 4;
  const suggestDietBreak =
    !thisWeek?.tags.includes('diet_break') && !recentTags(4, 'diet_break') && (coach.suggestion === 'diet_break' || strugglingInDeficit);
  if (strugglingInDeficit && coach.suggestion !== 'diet_break') {
    notes.push('Both lifting and running are trending down while dieting. A week at maintenance calories (diet break) is often the fastest way to recover.');
  }
  if (runsDropping && !strugglingInDeficit) {
    notes.push(
      easyRpe !== undefined && easyRpe >= 6
        ? `Easy runs felt hard last week (average effort ${easyRpe.toFixed(1)}/10). Slow them down – they should feel conversational (3–4/10).`
        : 'Easy-run pace has slowed recently. Check sleep, stress and fuelling before hard sessions.',
    );
  }
  if (training.strengthDone < training.strengthPlanned || training.runsDone < training.runsPlanned) {
    notes.push('Some sessions were missed last week. That\'s normal – the plan doesn\'t make you catch up; just pick up from this week.');
  }

  return {
    weekIndex: W,
    previousTdee: last?.tdee ?? phase.energy.maintenanceKcal,
    reviewed,
    coach,
    food: { days: food.length, avgKcal: avg(food.map((f) => f.kcal)), avgProtein: avg(food.map((f) => f.proteinG)) },
    training,
    lifts,
    runPerf: { easyRpe, paceChangePct },
    suggestDeload,
    suggestDietBreak,
    notes,
  };
}

/**
 * Applies the check-in from this week on: dieting weeks get the coach's new target, diet-break
 * weeks get estimated maintenance. Also adds any accepted deload / diet break to this week.
 */
export function applyCheckin(phase: Phase, review: Review, actions: Array<'diet_break' | 'deload'>): Phase {
  const W = review.weekIndex;
  const { tdee, newTarget } = review.coach;
  const weeks = phase.weeks.map((w) => {
    if (w.index < W) return w;
    const tags = [...w.tags];
    if (w.index === W) {
      if (actions.includes('diet_break') && !tags.includes('diet_break')) tags.push('diet_break');
      if (actions.includes('deload') && !tags.includes('deload')) tags.push('deload');
    }
    return { ...w, tags, kcalTarget: tags.includes('diet_break') ? tdee : newTarget };
  });
  const { fatG, carbG } = macrosFor(newTarget, phase.energy.proteinG, phase.profile);
  return {
    ...phase,
    weeks,
    energy: {
      ...phase.energy,
      targetKcal: newTarget,
      maintenanceKcal: tdee,
      deficitKcal: Math.max(0, tdee - newTarget),
      plannedLossKgPerWeek: Math.max(0, ((tdee - newTarget) * 7) / 7700),
      fatG,
      carbG,
    },
  };
}

export function toCheckIn(phase: Phase, review: Review, actions: Array<'diet_break' | 'deload'>, weekStart: string): CheckIn {
  return {
    week: weekStart,
    phaseId: phase.id!,
    createdAt: new Date().toISOString(),
    previousTdee: review.previousTdee,
    tdee: review.coach.tdee,
    previousTarget: review.coach.newTarget - review.coach.change,
    newTarget: review.coach.newTarget,
    stalled: review.coach.stalled,
    confidence: review.coach.confidence,
    ok: review.coach.ok,
    avgIntake: review.coach.avgIntake,
    observedLossKgPerWeek: review.coach.observedLossKgPerWeek,
    reasons: [...review.coach.reasons, ...review.notes],
    actions,
  };
}
