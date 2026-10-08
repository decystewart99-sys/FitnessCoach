// One exercise: how to do it, and its progress (estimated 1RM chart, bests, history).

import { useMemo } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db';
import { useSettings } from '../hooks';
import { EXERCISE_BY_ID } from '../engine/exercises';
import { exerciseHistory, isStalled } from '../engine/program';
import { MUSCLE_LABEL } from '../engine/strength';
import LineChart, { type ChartSeries } from '../components/LineChart';
import { formatLoad, liftUnit, toLiftUnit } from '../lib/lifting';
import { formatDate } from '../lib/dates';
import type { Muscle } from '../types';

export default function ExerciseScreen() {
  const { exerciseId } = useParams();
  const navigate = useNavigate();
  const settings = useSettings();
  const unit = liftUnit(settings);
  const workouts = useLiveQuery(() => db.workouts.toArray(), []) ?? [];
  const e = EXERCISE_BY_ID[exerciseId ?? ''];
  const history = useMemo(() => (e ? exerciseHistory(workouts.filter((w) => w.finishedAt), e.id) : []), [workouts, e]);

  if (!e) return null;
  const weighted = history.filter((h) => h.bestE1rm);
  const series: ChartSeries[] = [
    { id: 'top', label: 'Top set weight', color: 'var(--series-2)', kind: 'dots', points: weighted.map((h) => ({ x: h.date, y: toLiftUnit(h.topWeight!, unit) })) },
    { id: 'e1rm', label: 'Est. 1-rep max', color: 'var(--series-1)', kind: 'line', points: weighted.map((h) => ({ x: h.date, y: toLiftUnit(h.bestE1rm!, unit) })) },
  ];
  const repsSeries: ChartSeries[] = [{ id: 'reps', label: 'Total reps', color: 'var(--series-1)', kind: 'line', points: history.map((h) => ({ x: h.date, y: h.totalReps })) }];
  const bestE1rm = Math.max(0, ...weighted.map((h) => h.bestE1rm!));
  const heaviest = Math.max(0, ...weighted.map((h) => h.topWeight!));
  const mostReps = Math.max(0, ...history.flatMap((h) => h.sets.map((s) => s.reps ?? 0)));

  return (
    <div className="page no-nav">
      <button className="btn link" onClick={() => navigate(-1)}>
        ‹ Back
      </button>
      <h1>{e.name}</h1>
      <p className="small muted">
        {Object.entries(e.muscles)
          .map(([m, v]) => `${MUSCLE_LABEL[m as Muscle]}${v === 0.5 ? ' (secondary)' : ''}`)
          .join(' · ')}
      </p>
      {isStalled(history) && (
        <div className="banner">No new best in the last 3 sessions. Options: swap to a similar exercise, move to a slightly different rep range, or check sleep and food – a deload may be due.</div>
      )}

      <div className="card">
        <h3>How to do it</h3>
        <ul className="small" style={{ margin: 0, paddingLeft: 18 }}>
          {e.cues.map((c) => (
            <li key={c}>{c}</li>
          ))}
        </ul>
      </div>

      <h3 className="section-title">Progress</h3>
      {history.length === 0 ? (
        <div className="card muted small">No sessions logged yet.</div>
      ) : (
        <>
          <div className="stat-grid">
            {bestE1rm > 0 && (
              <div className="stat">
                <div className="label">Best est. 1RM</div>
                <div className="value" style={{ fontSize: '1.15rem' }}>
                  {formatLoad(bestE1rm, unit)}
                </div>
              </div>
            )}
            {heaviest > 0 && (
              <div className="stat">
                <div className="label">Heaviest set</div>
                <div className="value" style={{ fontSize: '1.15rem' }}>
                  {formatLoad(heaviest, unit)}
                </div>
              </div>
            )}
            <div className="stat">
              <div className="label">Most reps in a set</div>
              <div className="value" style={{ fontSize: '1.15rem' }}>
                {mostReps}
              </div>
            </div>
            <div className="stat">
              <div className="label">Sessions</div>
              <div className="value" style={{ fontSize: '1.15rem' }}>
                {history.length}
              </div>
            </div>
          </div>
          <div className="card" style={{ marginTop: 12 }}>
            {weighted.length ? (
              <LineChart series={series} ariaLabel={`${e.name} strength chart`} formatTick={(v) => String(Math.round(v))} formatValue={(v) => `${v} ${unit}`} />
            ) : (
              <LineChart series={repsSeries} ariaLabel={`${e.name} reps chart`} formatTick={(v) => String(Math.round(v))} formatValue={(v) => `${v} reps`} hideLegend />
            )}
          </div>

          <h3 className="section-title">History</h3>
          <div className="card">
            {[...history].reverse().map((h, i) => (
              <div className="list-row" key={`${h.date}-${i}`}>
                <span>{formatDate(h.date, { weekday: 'short', day: 'numeric', month: 'short' })}</span>
                <span className="small" style={{ textAlign: 'right' }}>
                  {h.sets.map((s) => `${s.weightKg ? toLiftUnit(s.weightKg, unit) : 'BW'}×${s.reps}`).join(', ')}
                </span>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
