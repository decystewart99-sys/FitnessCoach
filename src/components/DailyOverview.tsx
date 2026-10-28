// "Today at a glance": weigh-in and loss to date, steps, training, sleep, calories and protein.

import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db';
import type { Phase, Settings } from '../types';
import { computeWeightStats } from '../lib/weightStats';
import { recoverySignals, sleepScore } from '../lib/recovery';
import { kcalFor, sessionsOn } from '../lib/plan';
import { weekRange } from '../lib/checkin';
import { addDays, today } from '../lib/dates';
import { formatWeight, formatWeightDelta } from '../lib/units';

export default function DailyOverview({ phase, settings }: { phase: Phase; settings: Settings }) {
  const t = today();
  const data = useLiveQuery(async () => {
    const W = Math.max(1, Math.min(phase.lengthWeeks, Math.floor((new Date(t).getTime() - new Date(phase.startDate).getTime()) / (7 * 86_400_000)) + 1));
    const { from, to } = weekRange(phase, W);
    return {
      weights: await db.weights.toArray(),
      health: await db.health.where('date').between(addDays(t, -8), t, true, true).toArray(),
      food: await db.nutrition.get(t),
      workouts: await db.workouts.where('date').between(from, to, true, true).toArray(),
      runs: await db.runs.where('date').between(from, to, true, true).toArray(),
      week: { from, to },
    };
  }, [t, phase.startDate, phase.lengthWeeks]);

  const weight = useMemo(
    () => (data ? computeWeightStats(data.weights, { phaseStart: phase.startDate, targetKg: phase.profile.targetWeightKg }) : undefined),
    [data, phase.startDate, phase.profile.targetWeightKg],
  );
  if (!data || !weight) return null;

  const unit = settings.weightUnit;
  const weighIn = data.weights.find((w) => w.date === t);
  const healthToday = data.health.find((h) => h.date === t);
  const steps7 = recoverySignals(data.health, t).steps7;
  const sleep = healthToday ? sleepScore(healthToday) : undefined;
  const kcalTarget = kcalFor(phase, t);
  const proteinTarget = phase.energy.proteinG;

  // Training: today's sessions and progress through this plan week.
  const doneIds = new Set([
    ...data.workouts.filter((w) => w.finishedAt && w.sessionId).map((w) => w.sessionId!),
    ...data.runs.filter((r) => r.sessionId).map((r) => r.sessionId!),
  ]);
  let planned = 0;
  for (let d = data.week.from; d <= data.week.to; d = addDays(d, 1)) planned += sessionsOn(phase, d).sessions.length;
  const todays = sessionsOn(phase, t).sessions;
  const doneThisWeek = [...doneIds].length;

  const hrs = (m: number) => `${Math.floor(m / 60)}h ${String(Math.round(m % 60)).padStart(2, '0')}m`;

  return (
    <div className="overview">
      <Link to="/weight" className="ov-tile">
        <div className="ov-label">⚖️ Weigh-in</div>
        <div className="ov-value">{weighIn ? formatWeight(weighIn.kg, unit) : 'Not yet'}</div>
        <div className="ov-sub">
          {weight.sinceStart !== undefined
            ? `${weight.sinceStart <= 0 ? 'Lost' : 'Up'} ${formatWeightDelta(Math.abs(weight.sinceStart), unit).replace('+', '')} since start`
            : weight.trendNow !== undefined
              ? `Trend ${formatWeight(weight.trendNow, unit)}`
              : 'Tap to log'}
          {weight.toGoal !== undefined && weight.toGoal > 0 && ` · ${formatWeightDelta(weight.toGoal, unit).replace('+', '')} to go`}
        </div>
      </Link>

      <Link to="/health" className="ov-tile">
        <div className="ov-label">👟 Steps</div>
        <div className="ov-value">{healthToday?.steps !== undefined ? healthToday.steps.toLocaleString() : '—'}</div>
        <div className="ov-sub">{steps7 ? `7-day avg ${Math.round(steps7).toLocaleString()}` : 'Syncs from Garmin'}</div>
      </Link>

      <Link to="/lifts" className="ov-tile">
        <div className="ov-label">🏋️ Training</div>
        <div className="ov-value">
          {doneThisWeek}/{planned} <span className="ov-unit">this week</span>
        </div>
        <div className="ov-sub">
          {todays.length
            ? todays.map(({ session }) => `${doneIds.has(session.id) ? '✓ ' : ''}${session.label}`).join(' · ')
            : 'Rest day today'}
        </div>
      </Link>

      <Link to="/health" className="ov-tile">
        <div className="ov-label">😴 Sleep</div>
        <div className="ov-value">
          {sleep ? (
            <>
              {sleep.score} <span className="ov-unit">{sleep.label}</span>
            </>
          ) : (
            '—'
          )}
        </div>
        <div className="ov-sub">{healthToday?.sleepMin ? `${hrs(healthToday.sleepMin)} asleep${sleep && !sleep.usedStages ? ' (duration only)' : ''}` : 'Syncs from Garmin'}</div>
      </Link>

      <Link to="/weight" className="ov-tile ov-wide">
        <div className="ov-label">🍽️ Calories & protein</div>
        <Bar label="Calories" value={data.food?.kcal ?? 0} target={kcalTarget} unit="kcal" overIsBad />
        <Bar label="Protein" value={data.food?.proteinG ?? 0} target={proteinTarget} unit="g" />
      </Link>
    </div>
  );
}

function Bar({ label, value, target, unit, overIsBad }: { label: string; value: number; target: number; unit: string; overIsBad?: boolean }) {
  const pct = Math.min(100, (value / target) * 100);
  const left = target - value;
  const over = left < 0;
  return (
    <div className="ov-bar">
      <div className="spread small">
        <span>
          <b>{Math.round(value).toLocaleString()}</b> / {target.toLocaleString()} {unit}
        </span>
        <span className="muted">{over ? `${Math.round(-left)} over` : `${Math.round(left)} left`}</span>
      </div>
      <div className="ov-track" role="progressbar" aria-label={label} aria-valuenow={Math.round(value)} aria-valuemax={target}>
        <div className={`ov-fill ${over && overIsBad ? 'over' : ''}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}
