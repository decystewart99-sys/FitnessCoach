// Weekly check-in + nutrition trends (calories vs target, maintenance estimate over time).

import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db';
import { useActivePhase, useSettings } from '../hooks';
import LineChart, { type ChartSeries } from '../components/LineChart';
import { applyCheckin, buildReview, checkinDue, toCheckIn, weekRange } from '../lib/checkin';
import { weekIndexFor } from '../lib/plan';
import { addDays, formatDate, today } from '../lib/dates';
import { formatWeightDelta, KM_PER_MI } from '../lib/units';

export default function CheckinScreen() {
  const navigate = useNavigate();
  const phase = useActivePhase();
  const settings = useSettings();
  const data = useLiveQuery(async () => ({
    checkins: await db.checkins.toArray(),
    weights: await db.weights.toArray(),
    nutrition: await db.nutrition.toArray(),
    workouts: (await db.workouts.toArray()).filter((w) => w.finishedAt),
    runs: await db.runs.toArray(),
    health: await db.health.toArray(),
  }));
  const [declined, setDeclined] = useState<Set<string>>(new Set());
  const [done, setDone] = useState(false);
  const t = today();

  const due = phase && data ? checkinDue(phase, t, data.checkins) : undefined;
  const review = useMemo(
    () => (phase && data && due?.due ? buildReview({ phase, today: t, ...data }) : undefined),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [phase, data, due?.due],
  );

  if (!phase || !data) return null;
  const phaseCheckins = data.checkins.filter((c) => c.phaseId === phase.id).sort((a, b) => b.week.localeCompare(a.week));
  const mi = settings.distanceUnit === 'mi';

  const suggested: Array<'deload' | 'diet_break'> = review ? [...(review.suggestDeload ? (['deload'] as const) : []), ...(review.suggestDietBreak ? (['diet_break'] as const) : [])] : [];
  const actions = suggested.filter((a) => !declined.has(a));

  const accept = async () => {
    if (!review || !due) return;
    await db.transaction('rw', db.phases, db.checkins, async () => {
      await db.phases.put(applyCheckin(phase, review, actions));
      await db.checkins.put(toCheckIn(phase, review, actions, due.weekStart));
    });
    setDone(true);
    window.scrollTo(0, 0);
  };

  // ---- trends ----
  const from = addDays(t, -56);
  const intake = data.nutrition.filter((n) => n.date >= from && n.date < t && n.kcal > 0).sort((a, b) => a.date.localeCompare(b.date));
  const days = Array.from({ length: 56 }, (_, i) => addDays(from, i)).filter((d) => d >= phase.startDate);
  const calSeries: ChartSeries[] = [
    { id: 'intake', label: 'Calories eaten', color: 'var(--series-2)', kind: 'dots', points: intake.map((n) => ({ x: n.date, y: n.kcal })) },
    {
      id: 'target',
      label: 'Weekly target (average)',
      color: 'var(--series-1)',
      kind: 'line',
      points: days.map((d) => ({ x: d, y: phase.weeks[weekIndexFor(phase, d) - 1]?.kcalTarget ?? phase.energy.targetKcal })),
    },
  ];
  const oldestFirst = [...phaseCheckins].reverse();
  const tdeeSeries: ChartSeries[] = [
    {
      id: 'tdee',
      label: 'Estimated maintenance',
      color: 'var(--series-1)',
      kind: 'line',
      // Starts at the setup formula estimate, then each check-in's updated estimate.
      points: [{ x: phase.startDate, y: oldestFirst[0]?.previousTdee ?? phase.energy.maintenanceKcal }, ...oldestFirst.map((c) => ({ x: c.week, y: c.tdee }))],
    },
    {
      id: 'avg',
      label: 'Avg intake (3 weeks before)',
      color: 'var(--series-2)',
      kind: 'dots',
      points: oldestFirst.filter((c) => c.avgIntake).map((c) => ({ x: c.week, y: c.avgIntake! })),
    },
  ];

  return (
    <div className="page no-nav">
      <button className="btn link" onClick={() => navigate(-1)}>
        ‹ Back
      </button>
      <h1>Weekly check-in</h1>

      {done && (
        <div className="card" style={{ background: 'var(--accent-soft)', borderColor: 'transparent' }}>
          <h3>Check-in saved ✓</h3>
          <p className="small">This week's targets are updated on Today.</p>
          <button className="btn primary block" onClick={() => navigate('/')}>
            Back to Today
          </button>
        </div>
      )}

      {!done && review && due && (
        <>
          <p className="muted">
            Week {review.weekIndex - 1} review ({formatDate(review.reviewed.from)} – {formatDate(review.reviewed.to)}) and targets for week {review.weekIndex}.
          </p>

          <div className="stat-grid">
            <Stat
              label="Weight trend"
              value={review.coach.observedLossKgPerWeek !== undefined ? `${formatWeightDelta(-review.coach.observedLossKgPerWeek, settings.weightUnit, 2)}/wk` : '—'}
              sub={`plan ${formatWeightDelta(-phase.energy.plannedLossKgPerWeek, settings.weightUnit, 2)}/wk`}
            />
            <Stat
              label="Calories"
              value={review.food.avgKcal ? `${Math.round(review.food.avgKcal)}` : '—'}
              sub={`avg on ${review.food.days}/7 logged days · target ${review.coach.newTarget - review.coach.change}`}
            />
            <Stat label="Protein" value={review.food.avgProtein ? `${Math.round(review.food.avgProtein)} g` : '—'} sub={`target ${phase.energy.proteinG} g`} />
            <Stat
              label="Training"
              value={`${review.training.strengthDone + review.training.runsDone}/${review.training.strengthPlanned + review.training.runsPlanned}`}
              sub={`${review.training.strengthDone}/${review.training.strengthPlanned} lifts · ${review.training.runsDone}/${review.training.runsPlanned} runs · ${(mi ? review.training.km / KM_PER_MI : review.training.km).toFixed(1)} ${settings.distanceUnit}`}
            />
          </div>

          {(review.lifts.up.length > 0 || review.lifts.down.length > 0 || review.lifts.stalled.length > 0) && (
            <div className="card" style={{ marginTop: 12 }}>
              <h3>Lifting performance</h3>
              {review.lifts.up.length > 0 && <p className="small">📈 Up: {review.lifts.up.join(', ')}</p>}
              {review.lifts.down.length > 0 && <p className="small">📉 Down: {review.lifts.down.join(', ')}</p>}
              {review.lifts.stalled.length > 0 && <p className="small">⏸ Stalled: {review.lifts.stalled.join(', ')}</p>}
            </div>
          )}

          <h3 className="section-title">Coach</h3>
          <div className="card">
            <div className="stat-grid">
              <Stat label="Maintenance estimate" value={`${review.coach.tdee}`} sub={`kcal/day · ${review.coach.confidence} confidence`} />
              <Stat
                label="New calorie target"
                value={`${review.coach.weekTarget}`}
                sub={review.coach.change === 0 ? 'unchanged' : `${review.coach.change > 0 ? '+' : ''}${review.coach.change} kcal`}
              />
            </div>
            <ul className="small" style={{ paddingLeft: 18, marginBottom: 0 }}>
              {[...review.coach.reasons, ...review.notes].map((r) => (
                <li key={r} style={{ marginBottom: 6 }}>
                  {r}
                </li>
              ))}
            </ul>
          </div>

          {suggested.length > 0 && (
            <>
              <h3 className="section-title">Suggested for this week</h3>
              <div className="card">
                {suggested.map((a) => (
                  <label className="spread" key={a} style={{ padding: '8px 0', cursor: 'pointer' }}>
                    <span>
                      <b>{a === 'deload' ? 'Deload week' : 'Diet break'}</b>
                      <span className="field-hint">
                        {a === 'deload'
                          ? 'Half the sets at the same weights, stop 3–4 reps short of failure; running stays easy.'
                          : `Eat at maintenance (~${review.coach.tdee} kcal) for this week, then dieting resumes.`}
                      </span>
                    </span>
                    <input
                      type="checkbox"
                      checked={!declined.has(a)}
                      onChange={(e) => {
                        const next = new Set(declined);
                        if (e.target.checked) next.delete(a);
                        else next.add(a);
                        setDeclined(next);
                      }}
                      style={{ width: 24, height: 24, flex: 'none' }}
                    />
                  </label>
                ))}
              </div>
            </>
          )}

          <button className="btn primary block" style={{ marginTop: 16 }} onClick={accept}>
            Accept and update this week
          </button>
        </>
      )}

      {!done && !review && (
        <div className="card">
          <p style={{ margin: 0 }}>
            {due && due.weekIndex < 2
              ? `Your first check-in opens on ${formatDate(weekRange(phase, 2).from, { weekday: 'long', day: 'numeric', month: 'short' })}, after a full week of logging.`
              : `This week's check-in is done. The next one opens ${formatDate(weekRange(phase, (due?.weekIndex ?? 1) + 1).from, { weekday: 'long', day: 'numeric', month: 'short' })}.`}
          </p>
        </div>
      )}

      <h3 className="section-title">Calories vs target</h3>
      <div className="card">
        {intake.length ? (
          <LineChart series={calSeries} ariaLabel="Daily calories eaten compared with target" formatTick={(v) => String(Math.round(v))} formatValue={(v) => `${Math.round(v)} kcal`} />
        ) : (
          <p className="small muted" style={{ margin: 0 }}>Log food to see this chart.</p>
        )}
        <p className="small muted" style={{ marginBottom: 0 }}>Last 8 weeks. Each day's own target is a little higher on training days and lower on rest days – this line is the weekly average they add up to.</p>
      </div>

      <h3 className="section-title">Maintenance estimate</h3>
      <div className="card">
        {phaseCheckins.length ? (
          <LineChart series={tdeeSeries} ariaLabel="Estimated maintenance calories over time" formatTick={(v) => String(Math.round(v))} formatValue={(v) => `${Math.round(v)} kcal`} />
        ) : (
          <p className="small muted" style={{ margin: 0 }}>Starts at {phase.energy.maintenanceKcal} kcal (formula estimate) and updates with each check-in as the coach learns from your real data.</p>
        )}
      </div>

      {phaseCheckins.length > 0 && (
        <>
          <h3 className="section-title">Past check-ins</h3>
          <div className="card">
            {phaseCheckins.map((c) => (
              <details className="explain" key={c.week}>
                <summary>
                  {formatDate(c.week, { day: 'numeric', month: 'short' })} · {c.newTarget} kcal
                  {c.actions.length ? ` · ${c.actions.map((a) => (a === 'deload' ? 'deload' : 'diet break')).join(', ')}` : ''}
                </summary>
                <ul className="small" style={{ paddingLeft: 18 }}>
                  {c.reasons.map((r) => (
                    <li key={r}>{r}</li>
                  ))}
                </ul>
              </details>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="stat">
      <div className="label">{label}</div>
      <div className="value" style={{ fontSize: '1.15rem' }}>
        {value}
      </div>
      {sub && <div className="sub">{sub}</div>}
    </div>
  );
}
