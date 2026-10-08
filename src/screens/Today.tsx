import { Link, useNavigate } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db';
import { startPlannedWorkout } from '../lib/lifting';
import { checkinDue, weekRange } from '../lib/checkin';
import { findMissed, withMove } from '../lib/reschedule';
import { useActivePhase, useSettings } from '../hooks';
import { addDays, DAY_NAMES, daysBetween, formatDate, mondayOf, today, weekday } from '../lib/dates';
import { kcalFor, nextSessionDay, sessionsOn, weekIndexFor, type DaySessions } from '../lib/plan';
import { RunDetail, WeekTags } from '../components/PhaseDetails';
import { FoodCard, WeighInCard } from '../components/LogCards';
import { HealthImportButton } from '../components/HealthImport';
import type { Phase, Settings } from '../types';

export default function Today() {
  const phase = useActivePhase();
  const settings = useSettings();
  if (!phase) return null;

  const date = today();
  const todays = sessionsOn(phase, date);
  const beforeStart = date < phase.startDate;
  const finished = todays.weekIndex > phase.lengthWeeks;
  const week = phase.weeks[todays.weekIndex - 1];
  const next = todays.sessions.length ? undefined : nextSessionDay(phase, beforeStart ? addDays(phase.startDate, -1) : date);
  const kcal = kcalFor(phase, date);
  const needsBackup = !settings.lastBackupAt || daysBetween(settings.lastBackupAt.slice(0, 10), date) >= 7;

  return (
    <div className="page">
      <p className="small muted">{new Date().toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' })}</p>
      <h1>Today</h1>

      {needsBackup && daysBetween(phase.createdAt.slice(0, 10), date) >= 2 && (
        <Link to="/settings" className="banner" style={{ textDecoration: 'none' }}>
          💾 {settings.lastBackupAt ? "It's been a week since your last backup." : "You haven't backed up yet."} Tap to save a backup to Files.
        </Link>
      )}

      <CheckinBanner phase={phase} />
      <MissedSessions phase={phase} />
      <PhotoReminder photoDay={settings.photoDay ?? 6} />

      {beforeStart && (
        <div className="card">
          <h2>Your phase starts {DAY_NAMES[weekday(phase.startDate)]} {formatDate(phase.startDate)}</h2>
          <p className="muted">Until then, start using the calorie and protein targets so you're in the rhythm on day one.</p>
        </div>
      )}

      {finished && (
        <div className="card">
          <h2>Phase complete 🎉</h2>
          <p className="muted">Time to set up the next phase. Your answers carry over – just update your weight and goals.</p>
          <Link className="btn primary block" to="/setup?edit=1">
            Plan next phase
          </Link>
        </div>
      )}

      {!beforeStart && !finished && week && (
        <p className="muted">
          Week {todays.weekIndex} of {phase.lengthWeeks} <WeekTags tags={week.tags} />
        </p>
      )}

      <h3 className="section-title">Log today</h3>
      <WeighInCard settings={settings} compact />
      <FoodCard phase={phase} />
      {settings.healthImport ? (
        <HealthImportButton />
      ) : (
        <p className="small" style={{ marginTop: 8 }}>
          <Link to="/settings/health">Auto-import food from MyFitnessPal →</Link>
        </p>
      )}
      <p className="small muted" style={{ marginTop: 8 }}>
        {kcal > phase.energy.targetKcal
          ? `Training day – today's target includes a little extra (${kcal} kcal). `
          : kcal < phase.energy.targetKcal
            ? `Lighter day – ${kcal} kcal so harder days can have more. `
            : ''}
        Protein ≈ {Math.round(phase.energy.proteinG / phase.profile.mealsPerDay)} g × {phase.profile.mealsPerDay} meals.
        {week?.tags.includes('diet_break') && ' Diet-break week: eat at maintenance.'}
      </p>

      {!finished && (
        <>
          <h3 className="section-title">{todays.sessions.length ? "Today's training" : 'Training'}</h3>
          {todays.sessions.length ? (
            <SessionList day={todays} phase={phase} settings={settings} />
          ) : (
            <div className="card">
              <p>{beforeStart ? 'First session:' : 'Rest day. Next up:'}</p>
              {next ? (
                <>
                  <p className="muted small">
                    {DAY_NAMES[weekday(next.date)]} {formatDate(next.date)}
                  </p>
                  <SessionList day={next} phase={phase} settings={settings} />
                </>
              ) : (
                <p className="muted">Nothing scheduled in the next two weeks.</p>
              )}
            </div>
          )}
        </>
      )}

    </div>
  );
}

function SessionList({ day, phase, settings }: { day: DaySessions; phase: Phase; settings: Settings }) {
  const week = phase.weeks[day.weekIndex - 1];
  return (
    <div>
      {day.sessions.map(({ session, run }) => {
        const info = phase.strength.sessions.find((s) => s.id === session.id);
        return (
          <div key={session.id} className={`session ${session.type}`}>
            <span className="dot" />
            <div className="grow">
              {run ? (
                <>
                  <RunDetail run={run} settings={settings} />
                  {day.date === today() && <LogRunButton sessionId={session.id} />}
                </>
              ) : (
                <>
                  <div style={{ fontWeight: 600 }}>{session.label}</div>
                  <div className="small muted">{info?.focus}</div>
                  {week?.tags.includes('deload') && <p className="small">Deload week: do about half your usual sets, same weights, stop well short of failure.</p>}
                  {day.date === today() && <StartWorkoutButton phase={phase} sessionId={session.id} settings={settings} />}
                </>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function StartWorkoutButton({ phase, sessionId, settings }: { phase: Phase; sessionId: string; settings: Settings }) {
  const navigate = useNavigate();
  const existing = useLiveQuery(async () => (await db.workouts.where('date').equals(today()).toArray()).find((w) => w.sessionId === sessionId), [sessionId]);
  if (existing?.finishedAt) {
    return (
      <Link className="btn small" style={{ marginTop: 8 }} to={`/lifts/workout/${existing.id}`}>
        ✓ Done – view workout
      </Link>
    );
  }
  return (
    <button
      className="btn primary small"
      style={{ marginTop: 8 }}
      onClick={async () => navigate(`/lifts/workout/${await startPlannedWorkout(phase, sessionId, settings)}`)}
    >
      {existing ? 'Resume workout' : 'Start workout'}
    </button>
  );
}

function LogRunButton({ sessionId }: { sessionId: string }) {
  const logged = useLiveQuery(async () => (await db.runs.where('date').equals(today()).toArray()).find((r) => r.sessionId === sessionId), [sessionId]);
  if (logged) {
    return (
      <Link className="btn small" to={`/runs/edit/${logged.id}`}>
        ✓ Logged – view run
      </Link>
    );
  }
  return (
    <Link className="btn primary small" to={`/runs/log?session=${sessionId}&date=${today()}`}>
      Log run
    </Link>
  );
}

/** From the chosen photo day until Sunday, nudge if this week's photos aren't done. */
function PhotoReminder({ photoDay }: { photoDay: number }) {
  const t = today();
  const due = photoDay >= 0 && weekday(t) >= photoDay;
  const count = useLiveQuery(() => (due ? db.photos.where('week').equals(mondayOf(t)).count() : Promise.resolve(3)), [due, t]);
  if (!due || count === undefined || count >= 3) return null;
  return (
    <Link to="/photos" className="banner" style={{ textDecoration: 'none' }}>
      📸 {count === 0 ? "Time for this week's progress photos." : `Progress photos: ${count} of 3 done this week.`} Tap to add them.
    </Link>
  );
}

function CheckinBanner({ phase }: { phase: Phase }) {
  const checkins = useLiveQuery(() => db.checkins.toArray(), []);
  if (!checkins || !checkinDue(phase, today(), checkins).due) return null;
  return (
    <Link to="/checkin" className="banner" style={{ textDecoration: 'none', background: 'var(--accent-soft)' }}>
      📋 Your weekly check-in is ready – see last week's progress and this week's targets.
    </Link>
  );
}

/** Missed sessions this week: move to a sensible day, or skip. */
function MissedSessions({ phase }: { phase: Phase }) {
  const t = today();
  const W = weekIndexFor(phase, t);
  const range = W >= 1 && W <= phase.lengthWeeks ? weekRange(phase, W) : undefined;
  const done = useLiveQuery(async () => {
    if (!range) return new Set<string>();
    const ws = await db.workouts.where('date').between(range.from, range.to, true, true).toArray();
    const rs = await db.runs.where('date').between(range.from, range.to, true, true).toArray();
    return new Set([...ws.filter((w) => w.finishedAt && w.sessionId).map((w) => w.sessionId!), ...rs.filter((r) => r.sessionId).map((r) => r.sessionId!)]);
  }, [range?.from]);
  if (!range || !done) return null;
  const missed = findMissed(phase, t, done);
  if (!missed.length) return null;

  const move = (sessionId: string, to: string) => db.phases.put(withMove(phase, W, sessionId, to));
  return (
    <div className="card" style={{ marginBottom: 12 }}>
      <h3>Missed this week</h3>
      {missed.map((m) => (
        <div key={m.session.id} style={{ padding: '8px 0', borderTop: '1px solid var(--border)' }}>
          <div className="spread">
            <span>
              <span className={`badge ${m.session.type === 'run' ? 'run' : 'lift'}`}>{m.session.label}</span>{' '}
              <span className="small muted">{DAY_NAMES[weekday(m.due)]}</span>
            </span>
          </div>
          <p className="small muted" style={{ margin: '6px 0' }}>{m.advice}</p>
          <div className="row">
            {m.suggestion && (
              <button className="btn primary small" onClick={() => move(m.session.id, m.suggestion!)}>
                Move to {m.suggestion === t ? 'today' : DAY_NAMES[weekday(m.suggestion)]}
              </button>
            )}
            <button className="btn small" onClick={() => move(m.session.id, 'skip')}>
              Skip
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
