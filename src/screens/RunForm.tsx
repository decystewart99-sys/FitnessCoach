// Log or edit a run. Opened from a planned session (pre-filled) or blank.

import { useEffect, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { db } from '../db';
import { useActivePhase, useSettings } from '../hooks';
import type { RunLog, RunLogKind, RunPrescription } from '../types';
import { DurationInput, Field, NumberInput, Segmented } from '../components/ui';
import { formatDuration, formatPace, KM_PER_MI } from '../lib/units';
import { formatDate, today } from '../lib/dates';
import { sessionsOn } from '../lib/plan';
import { fiveKEquivalent, phaseWithNew5k, RUN_KIND_LABEL } from '../lib/runStats';

const KINDS: RunLogKind[] = ['easy', 'long', 'runwalk', 'fartlek', 'tempo', 'intervals', 'timetrial', 'race', 'other'];

function kindFromPlan(p?: RunPrescription): RunLogKind {
  if (!p) return 'easy';
  if (p.kind === 'easy_strides') return 'easy';
  return p.kind as RunLogKind;
}

export default function RunForm() {
  const { id } = useParams();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const settings = useSettings();
  const phase = useActivePhase();
  const mi = settings.distanceUnit === 'mi';

  const [run, setRun] = useState<RunLog>();
  const [saved, setSaved] = useState<RunLog>();
  const [error, setError] = useState<string>();
  const [pacesUpdated, setPacesUpdated] = useState(false);

  useEffect(() => {
    if (phase === undefined) return;
    (async () => {
      if (id) {
        setRun(await db.runs.get(Number(id)));
        return;
      }
      const date = params.get('date') ?? today();
      const sessionId = params.get('session') ?? undefined;
      const planned = phase && sessionId ? sessionsOn(phase, date).sessions.find((s) => s.session.id === sessionId)?.run : undefined;
      setRun({ date, sessionId, kind: kindFromPlan(planned), durationSec: (planned?.minutes ?? 30) * 60, source: 'manual' });
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, phase === undefined]);

  if (!run) return null;
  const set = (patch: Partial<RunLog>) => {
    setError(undefined);
    setRun({ ...run, ...patch });
  };
  const paceSec = run.distanceKm && run.durationSec ? run.durationSec / run.distanceKm : undefined;

  const save = async () => {
    if (!run.durationSec || run.durationSec < 60) return setError('Enter how long the run took (e.g. 32:15).');
    if (run.distanceKm !== undefined && (run.distanceKm <= 0 || run.distanceKm > 100)) return setError('That distance looks wrong.');
    if (paceSec !== undefined && (paceSec < 150 || paceSec > 1500)) return setError('That works out to an unusual pace – check distance and time.');
    const newId = await db.runs.put(run);
    setSaved({ ...run, id: newId as number });
  };

  const fiveK = saved ? fiveKEquivalent(saved) : undefined;

  if (saved) {
    return (
      <div className="page no-nav">
        <h1>Run saved ✓</h1>
        <div className="card">
          <p>
            {RUN_KIND_LABEL[saved.kind]} · {saved.distanceKm ? `${(mi ? saved.distanceKm / KM_PER_MI : saved.distanceKm).toFixed(2)} ${settings.distanceUnit} · ` : ''}
            {formatDuration(saved.durationSec)}
            {paceSec ? ` · ${formatPace(paceSec, settings.distanceUnit)}` : ''}
          </p>
          {fiveK && phase && (
            <div className="banner" style={{ background: 'var(--accent-soft)' }}>
              <div>
                <p style={{ margin: 0 }}>
                  That's equivalent to a <b>{formatDuration(fiveK)}</b> 5k
                  {phase.profile.recent5kSec ? ` (your plan currently uses ${formatDuration(phase.profile.recent5kSec)})` : ''}.
                </p>
                {!pacesUpdated ? (
                  <button
                    className="btn primary small"
                    style={{ marginTop: 8 }}
                    onClick={async () => {
                      await db.phases.put(phaseWithNew5k(phase, fiveK, saved.date));
                      setPacesUpdated(true);
                    }}
                  >
                    Update my training paces
                  </button>
                ) : (
                  <p className="small" style={{ margin: '8px 0 0' }}>
                    ✓ Paces for upcoming runs updated. Your weekly running time stays the same.
                  </p>
                )}
              </div>
            </div>
          )}
          <button className="btn primary block" onClick={() => navigate('/runs', { replace: true })}>
            Done
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="page no-nav">
      <button className="btn link" onClick={() => navigate(-1)}>
        ‹ Back
      </button>
      <h1>{id ? 'Edit run' : 'Log a run'}</h1>
      {run.sessionId && <p className="muted small">Planned session · {formatDate(run.date, { weekday: 'long', day: 'numeric', month: 'short' })}</p>}

      <Field label="Date">
        <input type="date" value={run.date} max={today()} onChange={(e) => e.target.value && set({ date: e.target.value })} />
      </Field>
      <Field label="Type">
        <select value={run.kind} onChange={(e) => set({ kind: e.target.value as RunLogKind })}>
          {KINDS.map((k) => (
            <option key={k} value={k}>
              {RUN_KIND_LABEL[k]}
            </option>
          ))}
        </select>
      </Field>
      <div className="row" style={{ alignItems: 'flex-start' }}>
        <div className="grow">
          <Field label="Distance" hint={run.kind === 'runwalk' ? 'Optional for run/walk' : undefined}>
            <NumberInput
              value={run.distanceKm === undefined ? undefined : mi ? run.distanceKm / KM_PER_MI : run.distanceKm}
              onChange={(v) => set({ distanceKm: v === undefined ? undefined : mi ? v * KM_PER_MI : v })}
              suffix={settings.distanceUnit}
              decimals={2}
              step={0.01}
            />
          </Field>
        </div>
        <div className="grow">
          <Field label="Time" hint="mm:ss or h:mm:ss">
            <DurationInput seconds={run.durationSec} onChange={(s) => set({ durationSec: s ?? 0 })} placeholder="32:15" />
          </Field>
        </div>
      </div>
      {paceSec && <p className="muted" style={{ marginTop: -8 }}>Pace: {formatPace(paceSec, settings.distanceUnit)}</p>}

      <div className="row" style={{ alignItems: 'flex-start' }}>
        <div className="grow">
          <Field label="Avg heart rate (optional)">
            <NumberInput value={run.avgHr} onChange={(avgHr) => set({ avgHr })} suffix="bpm" />
          </Field>
        </div>
        <div className="grow">
          <Field label="Max heart rate (optional)">
            <NumberInput value={run.maxHr} onChange={(maxHr) => set({ maxHr })} suffix="bpm" />
          </Field>
        </div>
      </div>
      <Field label="How hard did it feel? (1–10)" hint="Easy runs should be 3–4. If they're feeling like 6+, slow down next time.">
        <Segmented value={run.rpe} options={[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((n) => ({ value: n, label: String(n) }))} onChange={(rpe) => set({ rpe })} />
      </Field>
      <Field label="Notes (optional)">
        <textarea value={run.notes ?? ''} onChange={(e) => set({ notes: e.target.value || undefined })} placeholder="Route, weather, how your legs felt…" />
      </Field>
      {error && (
        <div className="banner" role="alert">
          {error}
        </div>
      )}
      <div className="step-footer" style={{ flexDirection: 'column' }}>
        <button className="btn primary block" onClick={save}>
          Save run
        </button>
        {id && (
          <button
            className="btn block danger"
            onClick={async () => {
              if (!confirm('Delete this run?')) return;
              await db.runs.delete(Number(id));
              navigate('/runs', { replace: true });
            }}
          >
            Delete run
          </button>
        )}
      </div>
    </div>
  );
}
