import { useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db';
import { useActivePhase, useSettings } from '../hooks';
import { WeighInCard, FoodCard } from '../components/LogCards';
import LineChart, { type ChartSeries } from '../components/LineChart';
import { computeWeightStats } from '../lib/weightStats';
import { addDays, formatDate, today } from '../lib/dates';
import { formatWeight, formatWeightDelta, kgToLb } from '../lib/units';
import type { WeightUnit } from '../types';

type Range = '1m' | '3m' | 'all';

export default function WeightScreen() {
  const settings = useSettings();
  const phase = useActivePhase();
  const weights = useLiveQuery(() => db.weights.orderBy('date').toArray(), []) ?? [];
  const nutrition = useLiveQuery(() => db.nutrition.toArray(), []) ?? [];
  const [range, setRange] = useState<Range>('1m');
  const [showAll, setShowAll] = useState(false);
  const unit = settings.weightUnit;

  const stats = useMemo(
    () => computeWeightStats(weights, { phaseStart: phase?.startDate, targetKg: phase?.profile.targetWeightKg }),
    [weights, phase?.startDate, phase?.profile.targetWeightKg],
  );

  const plannedRate = phase ? -phase.energy.plannedLossKgPerWeek : undefined;
  const from = range === '1m' ? addDays(today(), -30) : range === '3m' ? addDays(today(), -91) : '0000';
  const shown = stats.points.filter((p) => p.date >= from);
  const toAxis = (kg: number) => (unit === 'kg' ? kg : kgToLb(kg));
  const fromAxis = (v: number) => (unit === 'kg' ? v : v / kgToLb(1));
  const series: ChartSeries[] = [
    { id: 'weighins', label: 'Weigh-ins', color: 'var(--series-2)', kind: 'dots', points: shown.map((p) => ({ x: p.date, y: toAxis(p.kg) })) },
    { id: 'trend', label: 'Trend', color: 'var(--series-1)', kind: 'line', points: shown.map((p) => ({ x: p.date, y: toAxis(p.trend) })) },
  ];
  const food = new Map(nutrition.map((n) => [n.date, n]));
  const history = [...stats.points].reverse();

  return (
    <div className="page">
      <h1>Weight</h1>

      <WeighInCard settings={settings} />
      {phase && <FoodCard phase={phase} />}

      <h3 className="section-title">Progress</h3>
      {stats.count === 0 ? (
        <div className="card muted">Log your first weigh-in above. Weigh daily, first thing in the morning after the toilet – the trend sorts out the day-to-day noise.</div>
      ) : (
        <>
          <div className="stat-grid">
            <Stat label="Trend weight" value={formatWeight(stats.trendNow!, unit)} sub={`Last weigh-in ${formatWeight(stats.latest!.kg, unit)}`} />
            <Stat label="This week" value={delta(stats.change7, unit)} sub="trend change, 7 days" />
            <Stat
              label="Average rate"
              value={stats.ratePerWeek !== undefined ? `${formatWeightDelta(stats.ratePerWeek, unit, 2)}/wk` : '—'}
              sub={
                stats.ratePerWeek === undefined
                  ? 'needs ~10 days of weigh-ins'
                  : plannedRate !== undefined
                    ? `plan: ${formatWeightDelta(plannedRate, unit, 2)}/wk`
                    : 'last 4 weeks'
              }
            />
            <Stat label="This month" value={delta(stats.change30, unit)} sub="trend change, 30 days" />
            <Stat label="Since phase start" value={delta(stats.sinceStart, unit)} sub={phase ? formatDate(phase.startDate) : ''} />
            <Stat
              label="To goal"
              value={stats.toGoal !== undefined ? (stats.toGoal <= 0 ? 'Reached 🎉' : `${formatWeightDelta(stats.toGoal, unit).slice(1)} to go`) : '—'}
              sub={stats.projectedGoalDate ? `at this rate: ${formatDate(stats.projectedGoalDate, { day: 'numeric', month: 'short', year: 'numeric' })}` : stats.toGoal === undefined ? 'no target set' : ''}
            />
            <Stat label="Streak" value={`${stats.streak} day${stats.streak === 1 ? '' : 's'}`} sub={`${stats.count} weigh-ins total`} />
          </div>

          <div className="card" style={{ marginTop: 12 }}>
            <div className="spread" style={{ marginBottom: 6 }}>
              <h3 style={{ margin: 0 }}>Trend</h3>
              <div className="range-row" style={{ margin: 0 }}>
                {(['1m', '3m', 'all'] as Range[]).map((r) => (
                  <button key={r} aria-pressed={range === r} onClick={() => setRange(r)}>
                    {r === 'all' ? 'All' : r.toUpperCase()}
                  </button>
                ))}
              </div>
            </div>
            <LineChart
              series={series}
              ariaLabel="Weight trend chart"
              formatTick={(v) => (Number.isInteger(v) ? String(v) : v.toFixed(1))}
              formatValue={(v) => formatWeight(fromAxis(v), unit)}
              refLines={phase?.profile.targetWeightKg ? [{ y: toAxis(phase.profile.targetWeightKg), label: 'Goal' }] : []}
            />
            <p className="small muted" style={{ marginTop: 8 }}>
              Dots are daily weigh-ins; the line is the smoothed trend. Tap or drag the chart to see values. Daily jumps of 0.5–1 kg are water and food, not fat – judge progress by the line.
              {unit === 'stlb' && ' Axis in lb.'}
            </p>
          </div>

          <h3 className="section-title">History</h3>
          <div className="card">
            {(showAll ? history : history.slice(0, 14)).map((p) => {
              const f = food.get(p.date);
              return (
                <div className="history-row" key={p.date}>
                  <div>
                    <div>{formatDate(p.date, { weekday: 'short', day: 'numeric', month: 'short' })}</div>
                    <div className="small muted">{f ? `${f.kcal} kcal · ${f.proteinG} g protein` : 'no food logged'}</div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div>{formatWeight(p.kg, unit)}</div>
                    <div className="small muted">trend {formatWeight(p.trend, unit)}</div>
                  </div>
                  <button
                    className="icon-btn"
                    aria-label={`Delete weigh-in for ${p.date}`}
                    onClick={() => confirm(`Delete the weigh-in for ${formatDate(p.date)}?`) && db.weights.delete(p.date)}
                  >
                    ×
                  </button>
                </div>
              );
            })}
            {history.length > 14 && (
              <button className="btn link small" onClick={() => setShowAll(!showAll)}>
                {showAll ? 'Show less' : `Show all ${history.length}`}
              </button>
            )}
            <p className="small muted" style={{ marginTop: 8 }}>
              To fix a past entry, pick its date in the weigh-in card above.
            </p>
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

function delta(kg: number | undefined, unit: WeightUnit): string {
  return kg === undefined ? '—' : formatWeightDelta(kg, unit);
}
