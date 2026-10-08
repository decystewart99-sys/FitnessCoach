// Turns questionnaire answers into a complete phase: length, deloads, diet break,
// calorie/macro targets, weekly schedule, running progression and the reasoning behind it.

import type { DayPlan, Phase, PhaseOptions, PhaseWeek, PlannedSession, Profile, Rationale } from '../types';
import { buildSessions, placeSessions, scoreTemplate, sessionCounts, strengthSplit } from './schedule';
import { planRunning, type RunWeek } from './running';
import { buildStrengthPlan } from './strength';
import { clampLossPct, computeEnergy, runKcal, strengthSessionKcal } from './energy';
import { DAY_NAMES, today } from '../lib/dates';

export const MIN_WEEKS = 6;
export const MAX_WEEKS = 16;

export function suggestedLength(p: Profile, startDate: string): { weeks: number; reason: string } {
  if (p.runGoal.kind !== 'none' && p.runGoal.raceDate) {
    const weeksToRace = Math.floor((new Date(p.runGoal.raceDate).getTime() - new Date(startDate).getTime()) / (7 * 86_400_000)) + 1;
    if (weeksToRace >= MIN_WEEKS && weeksToRace <= MAX_WEEKS)
      return { weeks: weeksToRace, reason: 'Phase ends with your race.' };
    if (weeksToRace > MAX_WEEKS)
      return { weeks: 12, reason: 'Your race is further away than one phase – this phase builds your base, the next one will lead into the race.' };
  }
  if (p.targetWeightKg && p.targetWeightKg < p.weightKg) {
    const perWeek = (clampLossPct(p.weeklyLossPct) / 100) * p.weightKg;
    const needed = Math.ceil((p.weightKg - p.targetWeightKg) / perWeek);
    const weeks = Math.min(MAX_WEEKS, Math.max(8, needed + (needed > 10 ? 1 : 0)));
    return {
      weeks,
      reason:
        needed > MAX_WEEKS
          ? `Reaching your target weight needs about ${needed} weeks. Dieting in blocks of ≤16 weeks with maintenance breaks in between works better than one long diet.`
          : `About ${needed} weeks to reach your target at the planned rate${needed > 10 ? ', plus a diet-break week' : ''}.`,
    };
  }
  return { weeks: 12, reason: '12 weeks is long enough to see real progress and short enough to stay motivated.' };
}

export function generatePhase(profile: Profile, options: PhaseOptions): Phase {
  const p = { ...profile, weeklyLossPct: clampLossPct(options.weeklyLossPct ?? profile.weeklyLossPct) };
  const lengthInfo = suggestedLength(p, options.startDate);
  const lengthWeeks = Math.min(MAX_WEEKS, Math.max(MIN_WEEKS, options.lengthWeeks ?? lengthInfo.weeks));
  const warnings: string[] = [];

  // --- Weekly template ---
  const counts = sessionCounts(p);
  warnings.push(...counts.notes);
  const split = strengthSplit(counts.strength, p);
  const sessions = buildSessions(split.kinds, counts.runs);
  const longRunDay = p.longRunDay !== undefined && p.trainingDays.includes(p.longRunDay) ? p.longRunDay : undefined;
  let template: DayPlan[];
  if (options.template && sameSessions(options.template, sessions)) {
    template = options.template;
  } else {
    template = placeSessions(sessions, p.trainingDays, p.allowDoubles, longRunDay ?? defaultLongRunDay(p.trainingDays));
  }
  const scheduleWarnings = scoreTemplate(template).issues;
  const ordered = template.flatMap((d) => d.sessions);
  const runSessions = ordered.filter((s) => s.type === 'run');

  // --- Running & periodisation ---
  const runWeeks = planRunning(p, runSessions, lengthWeeks, options.startDate);
  const peakRunMinutes = Math.max(...runWeeks.map((w) => w.runMinutes));
  const deloadEvery = p.liftExperience === 'advanced' ? 4 : 8;
  const raceWeek = runWeeks.findIndex((w) => w.tags.includes('race')) + 1 || undefined;

  // --- Energy ---
  const strengthCount = ordered.filter((s) => s.type === 'strength').length;
  const avgRunKcal = (w: RunWeek) =>
    Object.values(w.runs).reduce((a, r) => a + runKcal(p.weightKg, r.minutes, r.kind === 'runwalk'), 0);
  const exerciseKcalPerDay =
    (strengthCount * strengthSessionKcal(p.weightKg, p.sessionMinutes) +
      runWeeks.reduce((a, w) => a + avgRunKcal(w), 0) / runWeeks.length) /
    7;
  const energy = computeEnergy(p, exerciseKcalPerDay, options);

  const longDiet = lengthWeeks >= 12 && (p.goalRanking[0] === 'fat' || p.weeklyLossPct >= 0.75 || lengthWeeks >= 14);
  const dietBreakWeek = longDiet ? deloadWeekNear(Math.round(lengthWeeks / 2) + 1, deloadEvery, lengthWeeks, raceWeek) : undefined;

  const weeks: PhaseWeek[] = runWeeks.map((rw, i) => {
    const index = i + 1;
    const tags = [...rw.tags];
    const isDeload = index % deloadEvery === 0 && index !== raceWeek && !(raceWeek && index === raceWeek - 1);
    if (isDeload) tags.push('deload');
    if (index === dietBreakWeek) tags.push('diet_break');
    // Race week: lifting is cut back too.
    if (raceWeek === index && !tags.includes('deload')) tags.push('deload');
    return {
      index,
      tags,
      runMinutes: rw.runMinutes,
      runs: rw.runs,
      kcalTarget: index === dietBreakWeek ? energy.maintenanceKcal : energy.targetKcal,
    };
  });

  const strength = buildStrengthPlan(p, ordered, split.name, peakRunMinutes);
  const rationale = buildRationale(p, { split: split.name, strengthCount, runCount: runSessions.length, deloadEvery, dietBreakWeek, energy, lengthInfo, lengthWeeks, firstWeekRunWalk: runWeeks[0]?.runWalk });

  return {
    createdAt: new Date().toISOString(),
    status: 'active',
    startDate: options.startDate,
    lengthWeeks,
    profile: p,
    options,
    energy,
    template,
    scheduleWarnings,
    strength,
    weeks,
    rationale,
    warnings,
  };
}

function defaultLongRunDay(days: number[]): number | undefined {
  // Weekends first (usually the most time), Sunday then Saturday.
  for (const d of [6, 5, 4, 3, 2, 1, 0]) if (days.includes(d)) return d;
  return undefined;
}

function deloadWeekNear(target: number, every: number, length: number, raceWeek?: number): number | undefined {
  const candidates: number[] = [];
  for (let w = every; w < length; w += every) if (w !== raceWeek) candidates.push(w);
  if (!candidates.length) return target < length ? target : undefined;
  return candidates.reduce((best, w) => (Math.abs(w - target) < Math.abs(best - target) ? w : best));
}

function sameSessions(template: DayPlan[], sessions: PlannedSession[]): boolean {
  const a = template.flatMap((d) => d.sessions.map((s) => s.id)).sort().join(',');
  const b = sessions.map((s) => s.id).sort().join(',');
  return a === b;
}

/** Moves a session to a different day (used by the phase editor). */
export function moveSession(template: DayPlan[], sessionId: string, toDay: number): DayPlan[] {
  const moving = template.flatMap((d) => d.sessions).find((s) => s.id === sessionId);
  if (!moving) return template;
  return template.map((d) => ({
    day: d.day,
    sessions:
      d.day === toDay
        ? [...d.sessions.filter((s) => s.id !== sessionId), moving].sort((a, b) => (a.type === b.type ? 0 : a.type === 'run' ? -1 : 1))
        : d.sessions.filter((s) => s.id !== sessionId),
  }));
}

export function phaseWeekIndex(phase: Phase, date: string = today()): number {
  const days = Math.floor((new Date(date).getTime() - new Date(phase.startDate).getTime()) / 86_400_000);
  return Math.floor(days / 7) + 1; // may be ≤0 before start or > length after the end
}

interface RationaleCtx {
  split: string;
  strengthCount: number;
  runCount: number;
  deloadEvery: number;
  dietBreakWeek?: number;
  energy: Phase['energy'];
  lengthInfo: { weeks: number; reason: string };
  lengthWeeks: number;
  firstWeekRunWalk?: boolean;
}

function buildRationale(p: Profile, c: RationaleCtx): Rationale[] {
  const r: Rationale[] = [];
  r.push({
    title: `Phase length: ${c.lengthWeeks} weeks`,
    body: c.lengthWeeks === c.lengthInfo.weeks ? c.lengthInfo.reason : 'Length set manually.',
  });
  r.push({
    title: `Calories: ${c.energy.targetKcal} kcal/day`,
    body: `Your estimated maintenance is about ${c.energy.maintenanceKcal} kcal/day (resting burn ${c.energy.bmr} kcal via ${c.energy.bmrMethod}, ×${c.energy.lifestyleMultiplier} for daily activity, plus ~${c.energy.exerciseKcalPerDay} kcal/day from planned training). A ${c.energy.deficitKcal} kcal/day deficit should lose about ${c.energy.plannedLossKgPerWeek.toFixed(2)} kg/week. A moderate deficit keeps training quality high and protects muscle. This is only a starting estimate – once you log weight and food, the coach recalculates your real maintenance each week.`,
  });
  r.push({
    title: `Protein: ${c.energy.proteinG} g/day`,
    body: 'In a deficit, protein in the 1.6–2.2 g per kg range is the single biggest nutrition factor for keeping muscle. Spread it across your meals (roughly 0.4 g/kg per meal).',
  });
  if (c.dietBreakWeek) {
    r.push({
      title: `Diet break: week ${c.dietBreakWeek}`,
      body: 'One week eating at maintenance mid-phase. It eases diet fatigue and hunger, helps training recover, and makes the second half easier to stick to. Expect the scale to rise a little from water and food in your gut – that isn\'t fat.',
    });
  }
  r.push({
    title: `Strength split: ${c.split}`,
    body: `${c.strengthCount} lifting sessions a week lets each muscle be trained about twice per week – the frequency that research supports for growth. ${
      c.strengthCount >= 4 ? 'Upper/lower days keep each session focused and short.' : 'Full-body style sessions get each muscle twice with fewer gym days.'
    }`,
  });
  r.push({
    title: 'Volume and effort',
    body: (p.goalRanking[2] === 'muscle' ? 'Muscle is your lowest priority, so volume sits around maintenance level – enough to keep what you have while fat loss and running take priority. ' : '') + 'Weekly hard sets start near the low end of the 10–20 range because a calorie deficit and running both reduce how much you can recover from. Sets are taken to 1–3 reps in reserve: close enough to failure to drive growth, far enough to keep fatigue manageable alongside running. Progression uses double progression – add reps within the range, then add weight.',
  });
  r.push({
    title: `Deloads every ${c.deloadEvery} weeks`,
    body: `Every ${c.deloadEvery}th week lifting volume roughly halves and running has a cutback week, so fatigue clears and you come back stronger. The coach will also suggest an extra deload if your performance drops across several sessions.`,
  });
  r.push({
    title: `Running: ${c.runCount} runs a week`,
    body: `${
      c.firstWeekRunWalk ? 'You start with run/walk intervals and progress one step each week until you can run continuously. ' : ''
    }Most running is easy and conversational – this builds your aerobic base with little fatigue. Once you have a base, one weekly quality session (fartlek, tempo or intervals) builds speed, and the long run builds endurance. Weekly running time grows no more than ~10% per week, with a lighter week every 4th week. Regular 5k time trials update your paces so the plan keeps up as you improve.`,
  });
  r.push({
    title: 'Avoiding interference',
    body: `The schedule keeps heavy leg sessions away from the day before your long run and quality run. ${
      p.allowDoubles ? 'When a run and a lift share a day, run first (or separate them by 6+ hours if you can) and pair hard with hard so easy days stay easy.' : ''
    }`,
  });
  r.push({ title: 'Your schedule', body: `Training days: ${p.trainingDays.map((d) => DAY_NAMES[d]).join(', ')}.` });
  return r;
}
