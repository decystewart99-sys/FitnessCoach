// Read-only or editable view of a phase: targets, weekly schedule, strength structure,
// running progression and the reasoning behind it all.

import type { Phase, PhaseOptions, PhaseWeek, PlannedSession, RunPrescription, Settings } from '../types';
import { addDays, DAY_NAMES, DAY_SHORT, formatDate } from '../lib/dates';
import { formatPace, formatWeightDelta } from '../lib/units';
import { MUSCLES, MUSCLE_LABEL } from '../engine/strength';
import { MAX_WEEKS, MIN_WEEKS, moveSession } from '../engine/phase';
import { Field, NumberInput, Segmented } from './ui';

const TAG_LABEL: Record<PhaseWeek['tags'][number], string> = {
  cutback: 'Run cutback',
  deload: 'Deload',
  diet_break: 'Diet break',
  taper: 'Taper',
  race: 'Race',
  time_trial: 'Time trial',
};

export function WeekTags({ tags }: { tags: PhaseWeek['tags'] }) {
  return (
    <>
      {tags.map((t) => (
        <span key={t} className={`badge ${t === 'diet_break' || t === 'race' ? 'accent' : t === 'time_trial' ? 'run' : 'warn'}`} style={{ marginRight: 4 }}>
          {TAG_LABEL[t]}
        </span>
      ))}
    </>
  );
}

export function SessionBadge({ s }: { s: PlannedSession }) {
  return <span className={`badge ${s.type === 'run' ? 'run' : 'lift'}`}>{s.label}</span>;
}

export function RunDetail({ run, settings }: { run: RunPrescription; settings: Settings }) {
  return (
    <div>
      <div style={{ fontWeight: 600 }}>{run.title}</div>
      <div className="small muted">
        ~{run.minutes} min
        {run.pace ? ` · ${run.pace.label}: ${formatPace(run.pace.lo, settings.distanceUnit).split(' ')[0]}–${formatPace(run.pace.hi, settings.distanceUnit)}` : ''}
      </div>
      <p className="small" style={{ marginTop: 4 }}>
        {run.description}
      </p>
    </div>
  );
}

interface Props {
  phase: Phase;
  settings: Settings;
  /** Present when the phase is being edited before confirmation. */
  edit?: { options: PhaseOptions; setOptions: (o: PhaseOptions) => void };
}

export default function PhaseDetails({ phase, settings, edit }: Props) {
  const e = phase.energy;
  const endDate = addDays(phase.startDate, phase.lengthWeeks * 7 - 1);
  const showMacros = phase.profile.nutritionMode === 'macros';
  const sessions = phase.template.flatMap((d) => d.sessions);
  const runIds = sessions.filter((s) => s.type === 'run').map((s) => s.id);
  const patch = (p: Partial<PhaseOptions>) => edit?.setOptions({ ...edit.options, ...p });

  return (
    <div>
      {[...phase.warnings, ...e.notes.filter((n) => n.startsWith('⚠️'))].map((w) => (
        <div className="banner" key={w}>
          {w}
        </div>
      ))}

      <div className="card">
        <div className="spread">
          <h2 style={{ margin: 0 }}>{phase.lengthWeeks}-week phase</h2>
          <span className="small muted">
            {formatDate(phase.startDate)} – {formatDate(endDate, { day: 'numeric', month: 'short', year: 'numeric' })}
          </span>
        </div>
        {edit && (
          <div style={{ marginTop: 16 }}>
            <Field label="Start date" hint="Weeks run Monday to Sunday is easiest, but any day works.">
              <input type="date" value={edit.options.startDate} onChange={(ev) => ev.target.value && patch({ startDate: ev.target.value })} />
            </Field>
            <Field label="Phase length">
              <select value={phase.lengthWeeks} onChange={(ev) => patch({ lengthWeeks: Number(ev.target.value) })}>
                {Array.from({ length: MAX_WEEKS - MIN_WEEKS + 1 }, (_, i) => MIN_WEEKS + i).map((w) => (
                  <option key={w} value={w}>
                    {w} weeks
                  </option>
                ))}
              </select>
            </Field>
          </div>
        )}
      </div>

      <h3 className="section-title">Daily nutrition targets</h3>
      <div className="card">
        <div className="stat-grid">
          <div className="stat">
            <div className="label">Calories</div>
            <div className="value">{e.targetKcal}</div>
            <div className="sub">kcal / day average</div>
          </div>
          <div className="stat">
            <div className="label">Protein</div>
            <div className="value">{e.proteinG} g</div>
            <div className="sub">≈ {Math.round(e.proteinG / phase.profile.mealsPerDay)} g per meal</div>
          </div>
          {showMacros && (
            <>
              <div className="stat">
                <div className="label">Carbs</div>
                <div className="value">{e.carbG} g</div>
              </div>
              <div className="stat">
                <div className="label">Fat</div>
                <div className="value">{e.fatG} g</div>
              </div>
            </>
          )}
          <div className="stat">
            <div className="label">Est. maintenance</div>
            <div className="value">{e.maintenanceKcal}</div>
            <div className="sub">kcal / day (starting guess)</div>
          </div>
          <div className="stat">
            <div className="label">Expected change</div>
            <div className="value">{formatWeightDelta(-e.plannedLossKgPerWeek, settings.weightUnit, 2)}</div>
            <div className="sub">per week</div>
          </div>
        </div>
        <p className="small muted" style={{ marginTop: 12 }}>
          Training days get a bit more food and rest days a bit less – the Today screen shows each day's number. Never below {e.floorKcal} kcal.
        </p>
        {e.notes
          .filter((n) => !n.startsWith('⚠️'))
          .map((n) => (
            <p className="small" key={n}>
              {n}
            </p>
          ))}
        {edit && (
          <div style={{ marginTop: 12 }}>
            <Field label="Rate of loss">
              <Segmented
                value={edit.options.weeklyLossPct ?? phase.profile.weeklyLossPct}
                options={[0.25, 0.5, 0.75, 1].map((r) => ({ value: r, label: `${r}%/wk` }))}
                onChange={(weeklyLossPct) => patch({ weeklyLossPct, kcalOverride: undefined })}
              />
            </Field>
            <Field label="Calorie target override (optional)" hint="Leave blank to use the calculated value.">
              <NumberInput value={edit.options.kcalOverride} onChange={(kcalOverride) => patch({ kcalOverride: kcalOverride && kcalOverride >= 800 ? kcalOverride : undefined })} suffix="kcal" />
            </Field>
            <Field label="Protein override (optional)">
              <NumberInput value={edit.options.proteinOverride} onChange={(proteinOverride) => patch({ proteinOverride: proteinOverride && proteinOverride >= 40 ? proteinOverride : undefined })} suffix="g" />
            </Field>
          </div>
        )}
      </div>

      <h3 className="section-title">Weekly schedule</h3>
      <div className="card">
        {phase.template.map((d) => (
          <div className="week-row" key={d.day}>
            <div className="day">{DAY_SHORT[d.day]}</div>
            <div>
              {d.sessions.length === 0 && <span className="muted small">Rest</span>}
              {d.sessions.map((s) => (
                <div key={s.id} className="spread" style={{ marginBottom: 6 }}>
                  <SessionBadge s={s} />
                  {edit && (
                    <select
                      aria-label={`Move ${s.label}`}
                      style={{ width: 'auto', minHeight: 36, padding: '4px 8px', fontSize: 14 }}
                      value={d.day}
                      onChange={(ev) => patch({ template: moveSession(phase.template, s.id, Number(ev.target.value)) })}
                    >
                      {DAY_NAMES.map((name, i) => (
                        <option key={i} value={i}>
                          {i === d.day ? 'Move to…' : name}
                        </option>
                      ))}
                    </select>
                  )}
                </div>
              ))}
            </div>
          </div>
        ))}
        {phase.scheduleWarnings.map((w) => (
          <div className="banner" key={w} style={{ marginTop: 12, marginBottom: 0 }}>
            {w}
          </div>
        ))}
        {edit?.options.template && (
          <button className="btn link small" onClick={() => patch({ template: undefined })}>
            Reset to suggested schedule
          </button>
        )}
      </div>

      <h3 className="section-title">Strength: {phase.strength.splitName}</h3>
      <div className="card">
        {phase.strength.sessions.map((s) => (
          <p key={s.id}>
            <span className="badge lift">{s.label}</span> <span className="small">{s.focus}</span>
          </p>
        ))}
        <hr className="sep" />
        <table className="plain">
          <thead>
            <tr>
              <th>Muscle</th>
              <th className="num">Hard sets / week</th>
            </tr>
          </thead>
          <tbody>
            {MUSCLES.map((m) => (
              <tr key={m}>
                <td>{MUSCLE_LABEL[m]}</td>
                <td className="num">{phase.strength.weeklySets[m]}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="small muted" style={{ marginTop: 12 }}>
          {phase.strength.repGuide} {phase.strength.rirGuide}
        </p>
        <p className="small muted">Exercises, set-by-set targets and swaps are in the Lifts tab.</p>
      </div>

      <h3 className="section-title">Running progression</h3>
      <div className="card" style={{ overflowX: 'auto' }}>
        <table className="plain">
          <thead>
            <tr>
              <th>Wk</th>
              <th>Key sessions</th>
              <th className="num">Min</th>
            </tr>
          </thead>
          <tbody>
            {phase.weeks.map((w) => {
              const key = runIds.map((id) => w.runs[id]).filter(Boolean);
              const quality = key.find((r) => r.slot === 'quality' || r.kind === 'timetrial');
              const long = key.find((r) => r.slot === 'long');
              return (
                <tr key={w.index}>
                  <td>{w.index}</td>
                  <td>
                    <WeekTags tags={w.tags} />
                    <div className="small">
                      {quality && quality !== long ? `${quality.title}` : key[0]?.title}
                      {long && quality !== long ? <span className="muted"> · {long.title}</span> : null}
                    </div>
                  </td>
                  <td className="num">{w.runMinutes}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <h3 className="section-title">Why it's built this way</h3>
      <div className="card">
        {phase.rationale.map((r) => (
          <details className="explain" key={r.title}>
            <summary>{r.title}</summary>
            <p>{r.body}</p>
          </details>
        ))}
      </div>
    </div>
  );
}
