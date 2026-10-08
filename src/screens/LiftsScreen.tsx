// Lifts tab: next workout, this week's sets per muscle, programme, lift progress and history.

import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db';
import { useActivePhase, useSettings } from '../hooks';
import { EXERCISE_BY_ID } from '../engine/exercises';
import { completedSets, exerciseHistory, isStalled, plannedWeeklySets, type ProgramSession } from '../engine/program';
import { MUSCLES, MUSCLE_LABEL } from '../engine/strength';
import { formatLoad, getProgram, liftUnit, startFreeWorkout, startPlannedWorkout } from '../lib/lifting';
import { sessionsOn } from '../lib/plan';
import { addDays, DAY_NAMES, formatDate, mondayOf, today, weekday } from '../lib/dates';

export default function LiftsScreen() {
  const phase = useActivePhase();
  const settings = useSettings();
  const navigate = useNavigate();
  const unit = liftUnit(settings);
  const workouts = useLiveQuery(() => db.workouts.orderBy('date').reverse().toArray(), []) ?? [];
  const swapsVersion = useLiveQuery(() => db.swaps.count(), []);
  const [program, setProgram] = useState<ProgramSession[]>();

  useEffect(() => {
    if (phase) getProgram(phase).then(setProgram);
  }, [phase, swapsVersion]);

  const finished = useMemo(() => workouts.filter((w) => w.finishedAt), [workouts]);
  const inProgress = workouts.find((w) => !w.finishedAt);

  // Next strength session: today if planned and not done yet, else the next one.
  const next = useMemo(() => {
    if (!phase) return undefined;
    const t = today();
    for (let i = 0; i <= 14; i++) {
      const day = sessionsOn(phase, addDays(t, i));
      const s = day.sessions.find((x) => x.session.type === 'strength');
      if (!s) continue;
      const done = finished.some((w) => w.date === day.date && w.sessionId === s.session.id);
      if (!done) return { date: day.date, sessionId: s.session.id, label: s.session.label };
    }
    return undefined;
  }, [phase, finished]);

  const weekFrom = mondayOf(today());
  const weekTo = addDays(weekFrom, 6);
  const done = completedSets(finished, weekFrom, weekTo);
  const planned = program ? plannedWeeklySets(program) : undefined;
  const targets = phase?.strength.weeklySets;

  const lifts = useMemo(() => {
    const ids = [...new Set(finished.flatMap((w) => w.exercises.map((e) => e.exerciseId)))];
    return ids
      .map((id) => {
        const h = exerciseHistory(finished, id);
        return { id, h, last: h[h.length - 1], first: h[0], stalled: isStalled(h) };
      })
      .filter((l) => l.h.length && EXERCISE_BY_ID[l.id])
      .sort((a, b) => b.last.date.localeCompare(a.last.date));
  }, [finished]);

  if (!phase) return null;

  const start = async (sessionId: string) => navigate(`/lifts/workout/${await startPlannedWorkout(phase, sessionId, settings)}`);

  return (
    <div className="page">
      <h1>Lifts</h1>

      {inProgress ? (
        <div className="card" style={{ background: 'var(--accent-soft)', borderColor: 'transparent' }}>
          <h3>{inProgress.label} in progress</h3>
          <p className="small muted">Started {formatDate(inProgress.date, { weekday: 'short', day: 'numeric', month: 'short' })}</p>
          <Link className="btn primary block" to={`/lifts/workout/${inProgress.id}`}>
            Resume workout
          </Link>
        </div>
      ) : next ? (
        <div className="card">
          <div className="small muted">{next.date === today() ? 'Today' : `${DAY_NAMES[weekday(next.date)]} ${formatDate(next.date)}`}</div>
          <h2>{next.label}</h2>
          {program && (
            <p className="small muted">
              {program
                .find((p) => p.sessionId === next.sessionId)
                ?.exercises.map((e) => EXERCISE_BY_ID[e.exerciseId].name)
                .join(' · ')}
            </p>
          )}
          <button className="btn primary block" onClick={() => start(next.sessionId)}>
            Start workout
          </button>
        </div>
      ) : (
        <div className="card muted">No lifting sessions planned in the next two weeks.</div>
      )}

      <h3 className="section-title">This week's hard sets</h3>
      <div className="card">
        <p className="small muted" style={{ marginTop: 0 }}>
          Bar = sets done this week (secondary muscles count half). Line = weekly target.
        </p>
        {targets &&
          MUSCLES.map((m) => {
            const max = Math.max(targets[m], done[m], 1) * 1.15;
            return (
              <div className="vol-row" key={m}>
                <span>{MUSCLE_LABEL[m]}</span>
                <div className="vol-track" title={`${done[m]} of ${targets[m]} sets`}>
                  <div className="vol-fill" style={{ width: `${(done[m] / max) * 100}%` }} />
                  <div className="vol-target" style={{ left: `${(targets[m] / max) * 100}%` }} />
                </div>
                <span className="vol-num">
                  {fmtSets(done[m])}/{targets[m]}
                </span>
              </div>
            );
          })}
        {planned && targets && MUSCLES.some((m) => planned[m] < targets[m] * 0.75) && (
          <p className="small muted" style={{ marginBottom: 0 }}>
            Some muscles get fewer planned sets than the target because of your session length. That's fine during a fat-loss phase – longer sessions would raise them.
          </p>
        )}
      </div>

      <h3 className="section-title">Lift progress</h3>
      <div className="card">
        {lifts.length === 0 && <p className="muted small" style={{ margin: 0 }}>Finish your first workout to see progress here.</p>}
        {lifts.map((l) => {
          const e = EXERCISE_BY_ID[l.id];
          const change = l.last.bestE1rm && l.first.bestE1rm ? l.last.bestE1rm - l.first.bestE1rm : undefined;
          return (
            <Link className="list-row" key={l.id} to={`/lifts/exercise/${l.id}`}>
              <div>
                <div>
                  {e.name} {l.stalled && <span className="badge warn">Stalled</span>}
                </div>
                <div className="small muted">
                  {l.h.length} session{l.h.length === 1 ? '' : 's'} · last {formatDate(l.last.date)}
                </div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div>{l.last.bestE1rm ? `e1RM ${formatLoad(l.last.bestE1rm, unit)}` : `${l.last.totalReps} reps`}</div>
                {change !== undefined && Math.abs(change) >= 0.25 && (
                  <div className="small muted">
                    {change > 0 ? '+' : '−'}
                    {formatLoad(Math.abs(change), unit)} since start
                  </div>
                )}
              </div>
            </Link>
          );
        })}
        {lifts.length > 0 && <p className="small muted" style={{ marginBottom: 0 }}>e1RM = estimated one-rep max from your best set – a way to compare sets of different weights and reps.</p>}
      </div>

      <h3 className="section-title">Your programme</h3>
      {program?.map((s) => (
        <div className="card" key={s.sessionId}>
          <div className="spread">
            <h3 style={{ margin: 0 }}>{s.label}</h3>
            <button className="btn small" onClick={() => start(s.sessionId)}>
              Start
            </button>
          </div>
          {s.exercises.map((e) => (
            <div className="spread small" key={e.slot} style={{ padding: '6px 0', borderBottom: '1px solid var(--border)' }}>
              <Link to={`/lifts/exercise/${e.exerciseId}`}>{EXERCISE_BY_ID[e.exerciseId].name}</Link>
              <span className="muted">
                {e.sets} × {e.repMin}–{e.repMax}
              </span>
            </div>
          ))}
        </div>
      ))}
      <button className="btn block" style={{ marginTop: 12 }} onClick={async () => navigate(`/lifts/workout/${await startFreeWorkout()}`)}>
        Start a free workout
      </button>

      <h3 className="section-title">History</h3>
      <div className="card">
        {finished.length === 0 && <p className="muted small" style={{ margin: 0 }}>No workouts yet.</p>}
        {finished.slice(0, 15).map((w) => (
          <Link className="list-row" key={w.id} to={`/lifts/workout/${w.id}`}>
            <div>
              <div>{w.label}</div>
              <div className="small muted">{formatDate(w.date, { weekday: 'short', day: 'numeric', month: 'short' })}</div>
            </div>
            <span className="small muted">{w.exercises.reduce((a, e) => a + e.sets.filter((s) => s.done).length, 0)} sets</span>
          </Link>
        ))}
      </div>
    </div>
  );
}

const fmtSets = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1));
