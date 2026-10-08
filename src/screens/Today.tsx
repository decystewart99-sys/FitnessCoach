import { Link, useNavigate } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db';
import { startPlannedWorkout } from '../lib/lifting';
import { useActivePhase, useSettings } from '../hooks';
import { addDays, DAY_NAMES, daysBetween, formatDate, today, weekday } from '../lib/dates';
import { kcalFor, nextSessionDay, sessionsOn, type DaySessions } from '../lib/plan';
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

      <p className="small muted center" style={{ marginTop: 24 }}>
        Workout and run logging, progress photos and the weekly coach arrive in the next updates.
      </p>
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
                <RunDetail run={run} settings={settings} />
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
