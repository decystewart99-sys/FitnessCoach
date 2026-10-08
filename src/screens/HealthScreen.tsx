// Daily health data from Garmin (via Apple Health): steps, resting heart rate, sleep.

import { useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db';
import BarChart from '../components/BarChart';
import LineChart, { type ChartSeries } from '../components/LineChart';
import { recoverySignals } from '../lib/recovery';
import { addDays, formatDate, today } from '../lib/dates';

export default function HealthScreen() {
  const navigate = useNavigate();
  const days = useLiveQuery(() => db.health.orderBy('date').toArray(), []) ?? [];
  const t = today();
  const from = addDays(t, -42);
  const recent = days.filter((d) => d.date >= from);
  const signals = useMemo(() => recoverySignals(days, t), [days, t]);
  const hrs = (m: number) => `${Math.floor(m / 60)}h ${String(Math.round(m % 60)).padStart(2, '0')}m`;

  const rhr: ChartSeries[] = [{ id: 'rhr', label: 'Resting HR', color: 'var(--series-1)', kind: 'line', points: recent.filter((d) => d.restingHr).map((d) => ({ x: d.date, y: d.restingHr! })) }];
  const sleep: ChartSeries[] = [{ id: 'sleep', label: 'Sleep', color: 'var(--series-1)', kind: 'line', points: recent.filter((d) => d.sleepMin).map((d) => ({ x: d.date, y: d.sleepMin! / 60 })) }];
  const steps = recent.filter((d) => d.steps).slice(-28);

  return (
    <div className="page no-nav">
      <button className="btn link" onClick={() => navigate(-1)}>
        ‹ Back
      </button>
      <h1>Health</h1>
      <p className="small muted">
        Steps, resting heart rate and sleep from your Garmin, via Apple Health and your <Link to="/settings/health">import shortcut</Link>.
      </p>

      {days.length === 0 ? (
        <div className="card small">
          No health data yet. Add the steps, resting heart rate and sleep actions to your shortcut (see <Link to="/settings/health">the guide</Link>), and make sure Garmin Connect shares
          with Apple Health.
        </div>
      ) : (
        <>
          <div className="stat-grid">
            <div className="stat">
              <div className="label">Steps</div>
              <div className="value" style={{ fontSize: '1.15rem' }}>
                {signals.steps7 ? Math.round(signals.steps7).toLocaleString() : '—'}
              </div>
              <div className="sub">7-day average</div>
            </div>
            <div className="stat">
              <div className="label">Resting HR</div>
              <div className="value" style={{ fontSize: '1.15rem' }}>
                {signals.rhr7 ? `${Math.round(signals.rhr7)} bpm` : '—'}
              </div>
              <div className="sub">{signals.rhrBaseline ? `usual ${Math.round(signals.rhrBaseline)} bpm` : '7-day average'}</div>
            </div>
            <div className="stat">
              <div className="label">Sleep</div>
              <div className="value" style={{ fontSize: '1.15rem' }}>
                {signals.sleep7 ? hrs(signals.sleep7) : '—'}
              </div>
              <div className="sub">7-day average</div>
            </div>
          </div>
          {signals.notes.map((n) => (
            <div className="banner" key={n} style={{ marginTop: 12 }}>
              {n}
            </div>
          ))}

          {steps.length > 0 && (
            <div className="card" style={{ marginTop: 12 }}>
              <h3>Daily steps</h3>
              <BarChart
                data={steps.map((d) => ({ key: d.date, label: formatDate(d.date), value: d.steps! }))}
                formatValue={(v) => Math.round(v).toLocaleString()}
                formatTick={(v) => (v >= 1000 ? `${Math.round(v / 1000)}k` : String(v))}
                ariaLabel="Daily steps, last 4 weeks"
              />
            </div>
          )}
          {rhr[0].points.length > 1 && (
            <div className="card" style={{ marginTop: 12 }}>
              <h3>Resting heart rate</h3>
              <LineChart series={rhr} ariaLabel="Resting heart rate" formatTick={(v) => String(Math.round(v))} formatValue={(v) => `${Math.round(v)} bpm`} hideLegend />
              <p className="small muted" style={{ marginBottom: 0 }}>
                Trending down over weeks = improving fitness. A jump of 5+ bpm above usual often means poor recovery, illness or stress.
              </p>
            </div>
          )}
          {sleep[0].points.length > 1 && (
            <div className="card" style={{ marginTop: 12 }}>
              <h3>Sleep</h3>
              <LineChart series={sleep} ariaLabel="Sleep per night" formatTick={(v) => `${Math.round(v)}h`} formatValue={(v) => hrs(v * 60)} hideLegend />
              <p className="small muted" style={{ marginBottom: 0 }}>
                7–9 hours supports recovery, appetite control and keeping muscle while dieting.
              </p>
            </div>
          )}
        </>
      )}
    </div>
  );
}
