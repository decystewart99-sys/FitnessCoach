// Logging a workout: set rows pre-filled with today's targets; tick a set to log it and
// start the rest timer. Swap or add exercises, add/remove sets, then finish.

import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db';
import { useActivePhase, useSettings } from '../hooks';
import { NumberInput } from '../components/ui';
import RestTimer, { primeAudio } from '../components/RestTimer';
import { EXERCISES, EXERCISE_BY_ID, availableEquipment, canDo, isRiskyFor, type Pattern } from '../engine/exercises';
import type { InjuryArea } from '../types';
import { e1rm, exerciseHistory, type ExerciseLog, type WorkoutLog } from '../engine/program';
import { defaultPlanFor, finishedWorkouts, formatLoad, fromLiftUnit, liftUnit, makeExerciseLog, toLiftUnit, type LiftUnit } from '../lib/lifting';
import { formatDate } from '../lib/dates';

const PATTERN_LABEL: Record<Pattern, string> = {
  squat: 'Squat',
  hinge: 'Hinge',
  lunge: 'Single-leg',
  knee_ext: 'Quads (isolation)',
  knee_flex: 'Hamstring curl',
  calf: 'Calves',
  h_push: 'Chest press',
  v_push: 'Shoulder press',
  h_pull: 'Row',
  v_pull: 'Pull-down / pull-up',
  side_delt: 'Side delts',
  rear_delt: 'Rear delts',
  chest_iso: 'Chest fly',
  biceps: 'Biceps',
  triceps: 'Triceps',
  abs: 'Abs',
};

export default function WorkoutScreen() {
  const { id } = useParams();
  const navigate = useNavigate();
  const settings = useSettings();
  const phase = useActivePhase();
  const unit = liftUnit(settings);
  const workout = useLiveQuery(() => db.workouts.get(Number(id)), [id]);
  const [restEnd, setRestEnd] = useState<number>();
  const [picker, setPicker] = useState<{ mode: 'add' } | { mode: 'swap'; index: number }>();
  const [summary, setSummary] = useState<string[]>();

  // Keep the screen on during a workout (iPhone pauses timers when the screen locks).
  useEffect(() => {
    let lock: { release: () => Promise<void> } | undefined;
    const nav = navigator as Navigator & { wakeLock?: { request: (t: 'screen') => Promise<{ release: () => Promise<void> }> } };
    nav.wakeLock?.request('screen').then((l) => (lock = l)).catch(() => undefined);
    return () => void lock?.release().catch(() => undefined);
  }, []);

  if (workout === undefined) return null;
  if (!workout) {
    return (
      <div className="page no-nav">
        <p>Workout not found.</p>
        <Link to="/lifts">Back to Lifts</Link>
      </div>
    );
  }

  const save = (w: WorkoutLog) => db.workouts.put(w);
  const updateExercise = (i: number, ex: ExerciseLog) => save({ ...workout, exercises: workout.exercises.map((e, j) => (j === i ? ex : e)) });

  const finish = async () => {
    const before = await finishedWorkouts();
    const prs: string[] = [];
    for (const ex of workout.exercises) {
      const prev = exerciseHistory(before.filter((w) => w.id !== workout.id), ex.exerciseId);
      const prevBest = Math.max(0, ...prev.map((h) => h.bestE1rm ?? 0));
      const best = Math.max(0, ...ex.sets.filter((s) => s.done && s.reps && s.weightKg).map((s) => e1rm(s.weightKg!, s.reps!)));
      if (prev.length && best > prevBest + 0.01) prs.push(`${EXERCISE_BY_ID[ex.exerciseId]?.name}: new best (est. 1RM ${formatLoad(best, unit)})`);
    }
    await save({ ...workout, finishedAt: new Date().toISOString() });
    setRestEnd(undefined);
    setSummary(prs);
    window.scrollTo(0, 0);
  };

  const discard = async () => {
    if (!confirm('Delete this workout? Logged sets will be lost.')) return;
    await db.workouts.delete(workout.id!);
    navigate('/lifts', { replace: true });
  };

  const doneSets = workout.exercises.reduce((a, e) => a + e.sets.filter((s) => s.done).length, 0);
  const totalSets = workout.exercises.reduce((a, e) => a + e.sets.length, 0);

  return (
    <div className="page no-nav" style={{ paddingBottom: restEnd ? 140 : undefined }}>
      <button className="btn link" onClick={() => navigate('/lifts')}>
        ‹ Lifts
      </button>
      <div className="spread">
        <h1 style={{ margin: 0 }}>{workout.label}</h1>
        {workout.deload && <span className="badge warn">Deload</span>}
      </div>
      <p className="muted small">
        {formatDate(workout.date, { weekday: 'long', day: 'numeric', month: 'short' })} · {doneSets}/{totalSets} sets done
        {workout.finishedAt && ' · finished'}
      </p>

      {summary && (
        <div className="card" style={{ background: 'var(--accent-soft)', borderColor: 'transparent', marginBottom: 12 }}>
          <h3>Workout saved 💪</h3>
          {summary.length ? summary.map((s) => <p key={s}>🏆 {s}</p>) : <p className="small">Logged. Next time the targets update from what you did today.</p>}
          <button className="btn primary block" onClick={() => navigate('/lifts')}>
            Done
          </button>
        </div>
      )}

      {workout.exercises.map((ex, i) => (
        <ExerciseCard
          key={`${i}-${ex.exerciseId}`}
          ex={ex}
          unit={unit}
          onChange={(next) => updateExercise(i, next)}
          onSetDone={(restSec) => {
            primeAudio();
            setRestEnd(Date.now() + restSec * 1000);
          }}
          onSwap={() => setPicker({ mode: 'swap', index: i })}
          onRemove={() => confirm('Remove this exercise from today\'s workout?') && save({ ...workout, exercises: workout.exercises.filter((_, j) => j !== i) })}
        />
      ))}

      <button className="btn block" style={{ marginTop: 12 }} onClick={() => setPicker({ mode: 'add' })}>
        + Add exercise
      </button>

      {!workout.finishedAt ? (
        <button className="btn primary block" style={{ marginTop: 12 }} onClick={finish} disabled={!doneSets}>
          Finish workout
        </button>
      ) : (
        <p className="small muted center" style={{ marginTop: 12 }}>
          Finished – you can still edit sets above.
        </p>
      )}
      <button className="btn link small" style={{ marginTop: 8 }} onClick={discard}>
        Delete workout
      </button>

      {picker && phase !== undefined && (
        <ExercisePicker
          title={picker.mode === 'add' ? 'Add exercise' : `Swap ${EXERCISE_BY_ID[workout.exercises[picker.index].exerciseId]?.name}`}
          patternFilter={picker.mode === 'swap' ? EXERCISE_BY_ID[workout.exercises[picker.index].exerciseId]?.pattern : undefined}
          equipment={phase ? availableEquipment(phase.profile.equipment, phase.profile.homeEquipment) : undefined}
          showPermanent={picker.mode === 'swap' && !!workout.exercises[picker.index].slot && workout.phaseId !== undefined}
          currentId={picker.mode === 'swap' ? workout.exercises[picker.index].exerciseId : undefined}
          injuries={phase?.profile.injuries ?? []}
          onClose={() => setPicker(undefined)}
          onPick={async (exerciseId, permanent) => {
            const history = await finishedWorkouts();
            const e = EXERCISE_BY_ID[exerciseId];
            if (picker.mode === 'add') {
              const log = makeExerciseLog(e, defaultPlanFor(e), history, unit, !!workout.deload);
              await save({ ...workout, exercises: [...workout.exercises, log] });
            } else {
              const old = workout.exercises[picker.index];
              const plan = { ...defaultPlanFor(e), sets: old.sets.length, slot: old.slot };
              const log = makeExerciseLog(e, plan, history, unit, !!workout.deload);
              await updateExercise(picker.index, log);
              if (permanent && old.slot && workout.phaseId !== undefined) await db.swaps.put({ key: `${workout.phaseId}:${old.slot}`, exerciseId });
            }
            setPicker(undefined);
          }}
        />
      )}

      <RestTimer endAt={restEnd} onChange={setRestEnd} />
    </div>
  );
}

function ExerciseCard({
  ex,
  unit,
  onChange,
  onSetDone,
  onSwap,
  onRemove,
}: {
  ex: ExerciseLog;
  unit: LiftUnit;
  onChange: (ex: ExerciseLog) => void;
  onSetDone: (restSec: number) => void;
  onSwap: () => void;
  onRemove: () => void;
}) {
  const e = EXERCISE_BY_ID[ex.exerciseId];
  const [showCues, setShowCues] = useState(false);
  const allDone = ex.sets.length > 0 && ex.sets.every((s) => s.done);
  const restLabel = ex.restSec >= 150 ? '2–3+ min' : ex.restSec >= 100 ? '~2 min' : '60–90 s';
  if (!e) return null;

  const setSet = (i: number, patch: Partial<ExerciseLog['sets'][number]>) =>
    onChange({
      ...ex,
      sets: ex.sets.map((s, j) => {
        if (j === i) return { ...s, ...patch };
        // A weight typed into a set also fills empty, not-yet-done sets after it.
        if (j > i && 'weightKg' in patch && !s.done && s.weightKg === undefined) return { ...s, weightKg: patch.weightKg };
        return s;
      }),
    });

  return (
    <div className="card" style={{ marginTop: 12, opacity: allDone ? 0.75 : 1 }}>
      <div className="spread" style={{ alignItems: 'flex-start' }}>
        <div className="grow">
          <Link to={`/lifts/exercise/${e.id}`} style={{ color: 'var(--text)', textDecoration: 'none' }}>
            <h3 style={{ margin: 0 }}>
              {allDone ? '✓ ' : ''}
              {e.name}
            </h3>
          </Link>
          <div className="small muted">
            {ex.sets.length} × {ex.repMin}–{ex.repMax} reps · {ex.rir} RIR · rest {restLabel}
            {e.perHand && ' · weight per dumbbell'}
          </div>
        </div>
        <div className="row" style={{ gap: 6 }}>
          <button className="icon-btn" aria-label="Exercise tips" onClick={() => setShowCues(!showCues)}>
            ?
          </button>
          <button className="icon-btn" aria-label="Swap exercise" onClick={onSwap}>
            ⇄
          </button>
        </div>
      </div>
      {ex.note && <p className="small" style={{ margin: '8px 0 0' }}>{ex.note}</p>}
      {showCues && (
        <ul className="small muted" style={{ margin: '8px 0 0', paddingLeft: 18 }}>
          {e.cues.map((c) => (
            <li key={c}>{c}</li>
          ))}
        </ul>
      )}

      <div className="set-grid set-head small muted">
        <span>Set</span>
        <span>{e.bodyweight ? `+${unit}` : unit}</span>
        <span>Reps</span>
        <span>RIR</span>
        <span />
      </div>
      {ex.sets.map((s, i) => (
        <div className={`set-grid ${s.done ? 'set-done' : ''}`} key={i}>
          <span className="set-num">{i + 1}</span>
          <NumberInput
            value={s.weightKg === undefined ? undefined : toLiftUnit(s.weightKg, unit)}
            onChange={(v) => setSet(i, { weightKg: v === undefined ? undefined : fromLiftUnit(v, unit) })}
            placeholder={e.bodyweight ? 'BW' : '–'}
            decimals={1}
            step={0.5}
          />
          <NumberInput value={s.reps} onChange={(v) => setSet(i, { reps: v })} placeholder="–" />
          <select value={s.rir ?? ''} onChange={(ev) => setSet(i, { rir: ev.target.value === '' ? undefined : Number(ev.target.value) })} aria-label="Reps in reserve">
            <option value="">–</option>
            {[0, 1, 2, 3, 4].map((r) => (
              <option key={r} value={r}>
                {r}
                {r === 4 ? '+' : ''}
              </option>
            ))}
          </select>
          <button
            className={`check-btn ${s.done ? 'on' : ''}`}
            aria-label={s.done ? `Undo set ${i + 1}` : `Log set ${i + 1}`}
            aria-pressed={s.done}
            disabled={!s.reps}
            onClick={() => {
              setSet(i, { done: !s.done });
              if (!s.done) onSetDone(ex.restSec);
            }}
          >
            ✓
          </button>
        </div>
      ))}
      <div className="row" style={{ marginTop: 8 }}>
        <button
          className="btn small"
          onClick={() => {
            const last = ex.sets[ex.sets.length - 1];
            onChange({ ...ex, sets: [...ex.sets, { weightKg: last?.weightKg, reps: last?.reps ?? ex.repMin, rir: last?.rir ?? ex.rir, done: false }] });
          }}
        >
          + Set
        </button>
        {ex.sets.length > 0 && (
          <button className="btn small" onClick={() => onChange({ ...ex, sets: ex.sets.slice(0, -1) })}>
            − Set
          </button>
        )}
        <span className="grow" />
        <button className="btn link small" onClick={onRemove}>
          Remove
        </button>
      </div>
    </div>
  );
}

function ExercisePicker({
  title,
  patternFilter,
  equipment,
  showPermanent,
  currentId,
  injuries,
  onPick,
  onClose,
}: {
  title: string;
  patternFilter?: Pattern;
  equipment?: ReturnType<typeof availableEquipment>;
  showPermanent: boolean;
  currentId?: string;
  injuries: InjuryArea[];
  onPick: (exerciseId: string, permanent: boolean) => void;
  onClose: () => void;
}) {
  const [query, setQuery] = useState('');
  const [permanent, setPermanent] = useState(true);
  const [showAll, setShowAll] = useState(false);
  const list = useMemo(
    () =>
      EXERCISES.filter((e) => e.id !== currentId && (!equipment || canDo(e, equipment)) && (showAll || !patternFilter || e.pattern === patternFilter) && e.name.toLowerCase().includes(query.toLowerCase())),
    [equipment, patternFilter, query, showAll, currentId],
  );
  const groups = [...new Set(list.map((e) => e.pattern))];

  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet" onClick={(e) => e.stopPropagation()} role="dialog" aria-label={title}>
        <div className="spread">
          <h2 style={{ margin: 0 }}>{title}</h2>
          <button className="icon-btn" aria-label="Close" onClick={onClose}>
            ×
          </button>
        </div>
        <input type="text" placeholder="Search exercises" value={query} onChange={(e) => setQuery(e.target.value)} style={{ margin: '12px 0' }} />
        {showPermanent && (
          <label className="row small" style={{ marginBottom: 8 }}>
            <input type="checkbox" checked={permanent} onChange={(e) => setPermanent(e.target.checked)} style={{ width: 20, height: 20 }} />
            Use this exercise from now on (not just today)
          </label>
        )}
        {patternFilter && (
          <button className="btn link small" onClick={() => setShowAll(!showAll)}>
            {showAll ? 'Show similar exercises only' : 'Show all exercises'}
          </button>
        )}
        {groups.map((g) => (
          <div key={g}>
            <div className="section-title" style={{ margin: '12px 0 6px' }}>
              {PATTERN_LABEL[g]}
            </div>
            {list
              .filter((e) => e.pattern === g)
              .map((e) => (
                <button key={e.id} className="option" style={{ width: '100%', marginBottom: 6 }} onClick={() => onPick(e.id, permanent)}>
                  {e.name}
                  <small>
                    {isRiskyFor(e, injuries)
                      ? `⚠️ Loads your ${e.stress
                          .filter((s) => injuries.includes(s))
                          .map((s) => s.replace('_', ' '))
                          .join(' / ')}`
                      : e.cues[0]}
                  </small>
                </button>
              ))}
          </div>
        ))}
        {!list.length && <p className="muted">No matches.</p>}
      </div>
    </div>
  );
}
