// Running progression: run/walk for beginners, then gradually increasing continuous running
// (≤10% per week) with a cutback every 4th week, a weekly quality session once there's a base,
// regular 5k time trials to recalibrate paces, and a taper when a race falls inside the phase.

import type { PhaseWeek, PlannedSession, Profile, RunPrescription, RunSlot } from '../types';
import { roundTo } from '../lib/units';

export interface RunWeek {
  runMinutes: number;
  runs: Record<string, RunPrescription>;
  tags: PhaseWeek['tags'];
  /** True when this week's sessions are run/walk rather than continuous running. */
  runWalk: boolean;
}

/** One step per week. Cutback weeks repeat the previous step. */
export const RUN_WALK_LADDER = [
  { runSec: 60, walkSec: 90, reps: 8 },
  { runSec: 90, walkSec: 90, reps: 7 },
  { runSec: 120, walkSec: 60, reps: 7 },
  { runSec: 180, walkSec: 60, reps: 6 },
  { runSec: 300, walkSec: 60, reps: 4 },
  { runSec: 480, walkSec: 60, reps: 3 },
  { runSec: 600, walkSec: 60, reps: 3 },
  { runSec: 900, walkSec: 60, reps: 2 },
];

const LONG_RUN_CAP_MIN: Record<Profile['runGoal']['kind'], number> = {
  none: 60,
  '5k': 60,
  '10k': 80,
  half: 120,
  marathon: 180,
};

const WEEKLY_CAP_MIN: Record<Profile['runGoal']['kind'], number> = {
  none: 150,
  '5k': 180,
  '10k': 220,
  half: 300,
  marathon: 400,
};

export const RACE_KM: Record<Exclude<Profile['runGoal']['kind'], 'none'>, number> = {
  '5k': 5,
  '10k': 10,
  half: 21.0975,
  marathon: 42.195,
};

/** Estimated 5k pace (sec/km) from the best recent result, via Riegel's formula for 10k. */
export function fiveKPace(p: Profile): number | undefined {
  if (p.recent5kSec) return p.recent5kSec / 5;
  if (p.recent10kSec) return (p.recent10kSec * Math.pow(0.5, 1.06)) / 5;
  return undefined;
}

export function paceZones(p5: number) {
  return {
    easy: { lo: p5 * 1.22, hi: p5 * 1.38, label: 'Easy pace' },
    tempo: { lo: p5 * 1.06, hi: p5 * 1.1, label: 'Tempo pace' },
    interval: { lo: p5 * 0.97, hi: p5 * 1.01, label: '5k pace' },
  };
}

const EFFORT = {
  easy: 'Conversational effort – you could talk in full sentences (RPE 3–4/10). If in doubt, slow down; walking breaks are fine.',
  tempo: 'Comfortably hard – a few words at a time, not a chat (RPE 6–7/10).',
  interval: 'Hard but controlled (RPE 8/10). Every rep should be about the same pace – don\'t sprint the first one.',
};

function weeksUntilRace(p: Profile, startDate: string): number | undefined {
  if (p.runGoal.kind === 'none' || !p.runGoal.raceDate) return undefined;
  const ms = new Date(p.runGoal.raceDate).getTime() - new Date(startDate).getTime();
  if (ms < 0) return undefined;
  return Math.floor(ms / (7 * 86_400_000)) + 1; // week index (1-based) that contains race day
}

export function planRunning(p: Profile, runSessions: PlannedSession[], lengthWeeks: number, startDate: string): RunWeek[] {
  const raceWeek = weeksUntilRace(p, startDate);
  const raceInPhase = raceWeek !== undefined && raceWeek <= lengthWeeks ? raceWeek : undefined;
  const taperWeeks = raceInPhase ? (p.runGoal.kind === 'half' || p.runGoal.kind === 'marathon' ? 2 : 1) : 0;
  const p5 = fiveKPace(p);
  const zones = p5 ? paceZones(p5) : undefined;

  const goal = p.runGoal.kind;
  const sessionCap = Math.max(20, p.sessionMinutes);
  const longCap = Math.max(sessionCap, LONG_RUN_CAP_MIN[goal]);
  const weeklyCap = WEEKLY_CAP_MIN[goal];

  // Starting point
  let ladderStep = p.runContinuousMin === 0 ? 0 : p.runContinuousMin === 5 ? 3 : p.runContinuousMin === 15 ? 6 : RUN_WALK_LADDER.length;
  const easyPaceMinPerKm = zones ? zones.easy.lo / 60 + 0.5 : 7;
  let baseMinutes =
    p.weeklyRunKm && p.weeklyRunKm > 0
      ? p.weeklyRunKm * easyPaceMinPerKm
      : runSessions.length * (p.runContinuousMin >= 30 ? 25 : 20);
  baseMinutes = Math.min(baseMinutes, weeklyCap);
  const startedContinuous = ladderStep >= RUN_WALK_LADDER.length;
  let continuousWeeks = startedContinuous ? 4 : 0; // already-continuous runners can start quality work
  // The time trial goes in the quality slot, or an easy run if there's no quality session.
  const timeTrialId = (runSessions.find((s) => s.runSlot === 'quality') ?? runSessions.find((s) => s.runSlot === 'easy'))?.id;
  let qualityCount = 0;
  let lastCutback = false;

  const weeks: RunWeek[] = [];
  for (let w = 1; w <= lengthWeeks; w++) {
    const tags: PhaseWeek['tags'] = [];
    const isRace = raceInPhase === w;
    const isTaper = !isRace && raceInPhase !== undefined && w > raceInPhase - 1 - taperWeeks && w < raceInPhase;
    const isCutback = !isRace && !isTaper && w % 4 === 0;
    // A time trial after each cutback week (fresh legs), plus an early one in week 2 when
    // there's no recent result to set paces from.
    const timeTrial =
      !isRace &&
      !isTaper &&
      !isCutback &&
      (raceInPhase === undefined || raceInPhase - w > 2) &&
      ((lastCutback && continuousWeeks >= 4) || (w === 2 && !p5 && startedContinuous));
    if (isCutback) tags.push('cutback');
    if (isTaper) tags.push('taper');
    if (isRace) tags.push('race');
    if (timeTrial && timeTrialId) tags.push('time_trial');

    const runs: Record<string, RunPrescription> = {};
    const runWalk = ladderStep < RUN_WALK_LADDER.length;

    if (runWalk) {
      const step = RUN_WALK_LADDER[isCutback ? Math.max(0, ladderStep - 1) : ladderStep];
      for (const s of runSessions) {
        const reps = s.runSlot === 'long' && !isCutback ? step.reps + 1 : step.reps;
        const minutes = Math.round((reps * (step.runSec + step.walkSec)) / 60) + 10;
        runs[s.id] = {
          slot: s.runSlot!,
          kind: 'runwalk',
          minutes,
          title: `Run/walk: ${reps} × (${fmtSec(step.runSec)} run / ${fmtSec(step.walkSec)} walk)`,
          description: `5 min brisk walk to warm up, then ${reps} rounds of ${fmtSec(step.runSec)} gentle running + ${fmtSec(
            step.walkSec,
          )} walking, then 5 min walk. ${EFFORT.easy}`,
          runWalk: { runSec: step.runSec, walkSec: step.walkSec, reps },
          pace: zones?.easy,
        };
      }
      if (!isCutback) ladderStep++;
      // Continuous running starts from the actual running time (not walking) of the last run/walk week.
      if (ladderStep >= RUN_WALK_LADDER.length) {
        baseMinutes = Object.values(runs).reduce((a, r) => a + (r.runWalk!.reps * r.runWalk!.runSec) / 60, 0);
      }
    } else {
      continuousWeeks++;
      let weekMinutes = baseMinutes;
      if (isCutback) weekMinutes = baseMinutes * 0.7;
      if (isTaper) weekMinutes = baseMinutes * (w === raceInPhase! - 1 ? 0.65 : 0.8);
      if (isRace) weekMinutes = baseMinutes * 0.5;

      const split = splitMinutes(weekMinutes, runSessions, sessionCap, longCap);
      for (const s of runSessions) {
        const minutes = split[s.id];
        runs[s.id] = prescribe(s.runSlot!, minutes, {
          zones,
          continuousWeeks,
          qualityCount,
          goal,
          isRace,
          timeTrial: timeTrial && s.id === timeTrialId,
          raceKm: goal !== 'none' ? RACE_KM[goal] : undefined,
        });
      }
      const qualityRun = Object.values(runs).find((r) => r.slot === 'quality');
      if (qualityRun && ['fartlek', 'tempo', 'intervals'].includes(qualityRun.kind)) qualityCount++;
      if (!isCutback && !isTaper && !isRace) baseMinutes = Math.min(weeklyCap, baseMinutes * 1.1);
    }

    lastCutback = isCutback;
    weeks.push({
      runMinutes: Object.values(runs).reduce((a, r) => a + r.minutes, 0),
      runs,
      tags,
      runWalk,
    });
  }
  return weeks;
}

function splitMinutes(total: number, sessions: PlannedSession[], sessionCap: number, longCap: number): Record<string, number> {
  const n = sessions.length;
  const longShare = n === 1 ? 1 : n === 2 ? 0.55 : n === 3 ? 0.38 : 0.3;
  const hasQuality = sessions.some((s) => s.runSlot === 'quality');
  const qualityShare = hasQuality ? 0.27 : 0;
  const easyCount = sessions.filter((s) => s.runSlot === 'easy').length;
  const easyShare = easyCount ? (1 - longShare - qualityShare) / easyCount : 0;

  const out: Record<string, number> = {};
  for (const s of sessions) {
    const share = s.runSlot === 'long' ? longShare : s.runSlot === 'quality' ? qualityShare : easyShare;
    const cap = s.runSlot === 'long' ? longCap : sessionCap;
    const min = s.runSlot === 'long' ? 25 : 20;
    out[s.id] = roundTo(Math.min(cap, Math.max(min, total * share)), 5);
  }
  // Long run must be at least as long as any other run.
  const longId = sessions.find((s) => s.runSlot === 'long')?.id;
  if (longId) {
    const maxOther = Math.max(0, ...sessions.filter((s) => s.id !== longId).map((s) => out[s.id]));
    out[longId] = Math.max(out[longId], Math.min(longCap, maxOther + 5));
  }
  return out;
}

interface PrescribeCtx {
  zones?: ReturnType<typeof paceZones>;
  continuousWeeks: number;
  qualityCount: number;
  goal: Profile['runGoal']['kind'];
  isRace: boolean;
  timeTrial: boolean;
  raceKm?: number;
}

function prescribe(slot: RunSlot, minutes: number, c: PrescribeCtx): RunPrescription {
  const easy = (title: string, extra = ''): RunPrescription => ({
    slot,
    kind: 'easy',
    minutes,
    title,
    description: `${EFFORT.easy}${extra}`,
    pace: c.zones?.easy,
  });

  if (slot === 'long') {
    if (c.isRace && c.raceKm) {
      return {
        slot,
        kind: 'race',
        minutes,
        title: `Race day – ${c.goal === 'half' ? 'half marathon' : c.goal === 'marathon' ? 'marathon' : c.goal}`,
        description:
          'Start slower than you think, settle in, then push the final quarter. Warm up with 10 min easy jogging and a few strides (shorter warm-up for longer races).',
      };
    }
    return {
      ...easy(`Long run – ${minutes} min easy`, ' The long run builds endurance; finishing feeling like you could do a bit more is perfect.'),
      kind: 'long',
    };
  }

  if (c.timeTrial) {
    return {
      slot,
      kind: 'timetrial',
      minutes: Math.max(minutes, 45),
      title: '5k time trial',
      description:
        '10 min easy + 3 short pick-ups, then run 5 km as fast as you can evenly sustain (short walk breaks are fine if needed). Log the time – the app uses it to update your training paces. 10 min easy to cool down.',
    };
  }

  if (slot === 'quality') {
    if (c.isRace) return easy(`Easy run – ${minutes} min`, ' Race week: keep it short and relaxed, with 4 × 20 s strides at the end.');
    if (c.continuousWeeks < 2) return easy(`Easy run – ${minutes} min`, ' Quality sessions unlock once you have a couple of weeks of continuous running.');
    if (c.continuousWeeks < 4)
      return {
        ...easy(`Easy run + strides – ${minutes} min`, ' Finish with 6 × 20 s strides: smooth, quick running (not a sprint) with a full walk-back recovery.'),
        kind: 'easy_strides',
      };

    const work = Math.max(10, minutes - 20);
    const longGoal = c.goal === 'half' || c.goal === 'marathon';
    const cycle = longGoal ? ['fartlek', 'tempo', 'tempo', 'intervals'] : ['fartlek', 'intervals', 'tempo', 'intervals'];
    const kind = cycle[c.qualityCount % cycle.length] as 'fartlek' | 'tempo' | 'intervals';
    const progress = Math.floor(c.qualityCount / cycle.length); // grows every full cycle

    if (kind === 'fartlek') {
      const reps = Math.min(10, 6 + progress);
      return {
        slot,
        kind,
        minutes,
        title: `Fartlek – ${reps} × 1 min brisk`,
        description: `10 min easy, then ${reps} × (1 min brisk / 2 min easy), then easy to finish. Brisk = ${EFFORT.tempo.toLowerCase()}`,
        pace: c.zones?.tempo,
      };
    }
    if (kind === 'tempo') {
      const tempoMin = Math.min(30, Math.max(10, roundTo(work * 0.7, 5) + progress * 2));
      const broken = tempoMin >= 16 && progress === 0;
      return {
        slot,
        kind,
        minutes,
        title: broken ? `Tempo – 2 × ${tempoMin / 2} min` : `Tempo – ${tempoMin} min`,
        description: `10 min easy, ${broken ? `2 × ${tempoMin / 2} min with 2 min easy jog between` : `${tempoMin} min continuous`} at tempo effort, 10 min easy. ${EFFORT.tempo}`,
        pace: c.zones?.tempo,
      };
    }
    const reps = Math.min(6, Math.max(3, Math.floor(work / 5)) + progress);
    return {
      slot,
      kind,
      minutes,
      title: `Intervals – ${reps} × 3 min`,
      description: `10 min easy, then ${reps} × (3 min hard / 2 min easy jog), then 10 min easy. ${EFFORT.interval}`,
      pace: c.zones?.interval,
    };
  }

  return easy(`Easy run – ${minutes} min`);
}

function fmtSec(s: number): string {
  if (s % 60 === 0) return `${s / 60} min`;
  if (s < 60) return `${s} s`;
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}
