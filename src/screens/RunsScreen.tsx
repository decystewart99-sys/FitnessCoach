// Runs tab: this week's planned runs, weekly distance, easy-pace trend, bests and history.

import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db';
import { useActivePhase, useSettings } from '../hooks';
import BarChart from '../components/BarChart';
import LineChart, { type ChartSeries } from '../components/LineChart';
import { RunDetail } from '../components/PhaseDetails';
import { bestEfforts, easyPaceSeries, longestRun, pace, RUN_KIND_LABEL, weeklyTotals } from '../lib/runStats';
import { sessionsOn } from '../lib/plan';
import { addDays, DAY_SHORT, formatDate, mondayOf, today, weekday } from '../lib/dates';
import { formatDuration, formatPace, KM_PER_MI } from '../lib/units';

export default function RunsScreen() {
  const phase = useActivePhase();
  const settings = useSettings();
  const runs = useLiveQuery(() => db.runs.orderBy('date').reverse().toArray(), []) ?? [];
  const mi = settings.distanceUnit === 'mi';
  const unit = settings.distanceUnit;
  const dist = (km: number) => (mi ? km / KM_PER_MI : km);
  const fmtDist = (km: number, d = 1) => `${dist(km).toFixed(d)} ${unit}`;

  const t = today();
  const weeks = useMemo(() => weeklyTotals(runs, t, 12), [runs, t]);
  const thisWeek = weeks[weeks.length - 1];
  const last4 = weeks.slice(-5, -1);
  const easy = useMemo(() => easyPaceSeries(runs), [runs]);
  const bests = useMemo(() => bestEfforts(runs), [runs]);
  const longest = longestRun(runs);
  const timeTrials = runs.filter((r) => r.kind === 'timetrial' || r.kind === 'race');

  // This week's planned runs and whether each was logged.
  const monday = mondayOf(t);
  const planned = phase
    ? Array.from({ length: 7 }, (_, i) => addDays(monday, i)).flatMap((date) =>
        sessionsOn(phase, date)
          .sessions.filter((s) => s.session.type === 'run')
          .map((s) => ({ date, ...s, logged: runs.find((r) => r.date === date && r.sessionId === s.session.id) })),
      )
    : [];
  const nextUp = planned.find((p) => !p.logged && p.date >= t);

  const toUnitPace = (secPerKm: number) => (mi ? secPerKm * KM_PER_MI : secPerKm);
  // Dots per run, plus a rolling average of the last 4 so long-vs-short run differences don't zigzag.
  const paceSeries: ChartSeries[] = [
    { id: 'runs', label: 'Each easy/long run', color: 'var(--series-2)', kind: 'dots', points: easy.map((p) => ({ x: p.date, y: toUnitPace(p.secPerKm) / 60 })) },
    {
      id: 'avg',
      label: 'Rolling average',
      color: 'var(--series-1)',
      kind: 'line',
      points: easy.map((p, i) => ({ x: p.date, y: toUnitPace(avg(easy.slice(Math.max(0, i - 3), i + 1).map((q) => q.secPerKm))) / 60 })),
    },
  ];
  const mmss = (minutes: number) => formatDuration(minutes * 60);

  return (
    <div className="page">
      <div className="spread">
        <h1 style={{ margin: 0 }}>Runs</h1>
        <Link className="btn primary small" to="/runs/log">
          + Log a run
        </Link>
      </div>

      {nextUp && (
        <div className="card" style={{ marginTop: 12 }}>
          <div className="small muted">{nextUp.date === t ? 'Today' : `${DAY_SHORT[weekday(nextUp.date)]} ${formatDate(nextUp.date)}`}</div>
          {nextUp.run && <RunDetail run={nextUp.run} settings={settings} />}
          {nextUp.date <= t && (
            <Link className="btn primary block" to={`/runs/log?session=${nextUp.session.id}&date=${nextUp.date}`}>
              Log this run
            </Link>
          )}
        </div>
      )}

      {planned.length > 0 && (
        <>
          <h3 className="section-title">This week's plan</h3>
          <div className="card">
            {planned.map((p) => (
              <div className="list-row" key={p.date + p.session.id}>
                <div>
                  <div>
                    {DAY_SHORT[weekday(p.date)]} · {p.run?.title ?? p.session.label}
                  </div>
                  {p.logged && (
                    <div className="small muted">
                      {p.logged.distanceKm ? `${fmtDist(p.logged.distanceKm, 2)} · ` : ''}
                      {formatDuration(p.logged.durationSec)}
                    </div>
                  )}
                </div>
                {p.logged ? (
                  <span className="badge accent">✓ Done</span>
                ) : p.date < t ? (
                  <Link className="btn small" to={`/runs/log?session=${p.session.id}&date=${p.date}`}>
                    Log
                  </Link>
                ) : (
                  <span className="small muted">Planned</span>
                )}
              </div>
            ))}
          </div>
        </>
      )}

      <h3 className="section-title">Progress</h3>
      {runs.length === 0 ? (
        <div className="card muted small">Log your first run to see distance, pace and personal bests here.</div>
      ) : (
        <>
          <div className="stat-grid">
            <div className="stat">
              <div className="label">This week</div>
              <div className="value" style={{ fontSize: '1.15rem' }}>
                {fmtDist(thisWeek.km)}
              </div>
              <div className="sub">
                {thisWeek.runs} run{thisWeek.runs === 1 ? '' : 's'} · {Math.round(thisWeek.minutes)} min
              </div>
            </div>
            <div className="stat">
              <div className="label">4-week average</div>
              <div className="value" style={{ fontSize: '1.15rem' }}>
                {fmtDist(last4.reduce((a, w) => a + w.km, 0) / 4)}
              </div>
              <div className="sub">per week</div>
            </div>
            <div className="stat">
              <div className="label">Longest run</div>
              <div className="value" style={{ fontSize: '1.15rem' }}>
                {longest?.distanceKm ? fmtDist(longest.distanceKm) : '—'}
              </div>
              <div className="sub">{longest ? formatDate(longest.date) : ''}</div>
            </div>
            <div className="stat">
              <div className="label">Recent easy pace</div>
              <div className="value" style={{ fontSize: '1.15rem' }}>
                {easy.length ? formatPace(avg(easy.slice(-4).map((p) => p.secPerKm)), unit) : '—'}
              </div>
              <div className="sub">avg of last {Math.min(4, easy.length) || 4} easy runs</div>
            </div>
          </div>

          <div className="card" style={{ marginTop: 12 }}>
            <h3>Weekly distance</h3>
            <BarChart
              data={weeks.map((w) => ({ key: w.weekStart, label: formatDate(w.weekStart), value: dist(w.km) }))}
              formatValue={(v) => `${v.toFixed(1)} ${unit}`}
              formatTick={(v) => String(Math.round(v * 10) / 10)}
              ariaLabel="Weekly running distance, last 12 weeks"
            />
            <p className="small muted" style={{ marginBottom: 0 }}>Weeks start on Monday. Build gradually – about 10% more per week at most.</p>
          </div>

          <div className="card" style={{ marginTop: 12 }}>
            <h3>Easy pace trend</h3>
            {easy.length >= 2 ? (
              <LineChart series={paceSeries} ariaLabel="Easy run pace over time" formatTick={mmss} formatValue={(v) => `${mmss(v)} /${unit}`} />
            ) : (
              <p className="small muted">Appears after two easy or long runs with a distance.</p>
            )}
            <p className="small muted" style={{ marginBottom: 0 }}>
              Pace per {unit} – lower is faster. If your easy runs get quicker at the same effort, your aerobic fitness is improving.
            </p>
          </div>

          <h3 className="section-title">Best efforts</h3>
          <div className="card">
            {bests.map((b) => (
              <div className="list-row" key={b.label}>
                <span>{b.label}</span>
                <span style={{ textAlign: 'right' }}>
                  {b.sec ? (
                    <>
                      {formatDuration(b.sec)}
                      <div className="small muted">{formatDate(b.date)}</div>
                    </>
                  ) : (
                    <span className="muted">—</span>
                  )}
                </span>
              </div>
            ))}
            <p className="small muted" style={{ marginBottom: 0 }}>From runs that covered the distance, at that run's average pace.</p>
          </div>

          {timeTrials.length > 0 && (
            <>
              <h3 className="section-title">Time trials & races</h3>
              <div className="card">
                {timeTrials.map((r) => (
                  <Link className="list-row" key={r.id} to={`/runs/edit/${r.id}`}>
                    <span>
                      {formatDate(r.date, { day: 'numeric', month: 'short', year: 'numeric' })} · {RUN_KIND_LABEL[r.kind]}
                    </span>
                    <span>
                      {r.distanceKm ? `${fmtDist(r.distanceKm, 2)} · ` : ''}
                      {formatDuration(r.durationSec)}
                    </span>
                  </Link>
                ))}
              </div>
            </>
          )}

          <h3 className="section-title">History</h3>
          <div className="card">
            {runs.slice(0, 30).map((r) => {
              const p = pace(r);
              return (
                <Link className="list-row" key={r.id} to={`/runs/edit/${r.id}`}>
                  <div>
                    <div>
                      {RUN_KIND_LABEL[r.kind]} {r.distanceKm ? `· ${fmtDist(r.distanceKm, 2)}` : ''}
                    </div>
                    <div className="small muted">{formatDate(r.date, { weekday: 'short', day: 'numeric', month: 'short' })}</div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div>{formatDuration(r.durationSec)}</div>
                    <div className="small muted">
                      {p ? formatPace(p, unit) : ''}
                      {r.avgHr ? ` · ${r.avgHr} bpm` : ''}
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}

const avg = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
