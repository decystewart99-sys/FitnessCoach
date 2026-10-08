// Small dependency-free SVG time-series chart: line and/or dot series on one shared y-axis,
// with a snapping crosshair + tooltip (touch, mouse and keyboard). Reused across tabs.

import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react';
import { daysBetween, formatDate } from '../lib/dates';

export interface ChartSeries {
  id: string;
  label: string;
  /** CSS colour, usually a var(--series-n) token. */
  color: string;
  kind: 'line' | 'dots';
  points: Array<{ x: string; y: number }>;
}

interface Props {
  series: ChartSeries[];
  height?: number;
  formatTick: (v: number) => string;
  formatValue: (v: number) => string;
  refLines?: Array<{ y: number; label: string }>;
  ariaLabel: string;
  /** Hide the legend (e.g. when the card title already names the single series). */
  hideLegend?: boolean;
}

const PAD = { top: 12, right: 12, bottom: 26, left: 46 };

export function niceTicks(min: number, max: number, count = 4): number[] {
  if (min === max) {
    min -= 1;
    max += 1;
  }
  const raw = (max - min) / count;
  const mag = Math.pow(10, Math.floor(Math.log10(raw)));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw)!;
  const ticks: number[] = [];
  for (let v = Math.floor(min / step) * step; v <= max + step * 0.001; v += step) ticks.push(Number(v.toFixed(6)));
  if (ticks[ticks.length - 1] < max) ticks.push(ticks[ticks.length - 1] + step);
  return ticks;
}

export default function LineChart({ series, height = 220, formatTick, formatValue, refLines = [], ariaLabel, hideLegend }: Props) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(320);
  const [hover, setHover] = useState<number>();

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setWidth(Math.max(200, e.contentRect.width)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const dates = useMemo(() => [...new Set(series.flatMap((s) => s.points.map((p) => p.x)))].sort(), [series]);
  const ys = series.flatMap((s) => s.points.map((p) => p.y));

  if (!dates.length) {
    return (
      <div ref={wrapRef} className="chart-empty muted small">
        No data yet.
      </div>
    );
  }

  const first = dates[0];
  const span = Math.max(1, daysBetween(first, dates[dates.length - 1]));
  const innerW = width - PAD.left - PAD.right;
  const innerH = height - PAD.top - PAD.bottom;
  const visibleRefs = refLines.filter((r) => {
    const lo = Math.min(...ys);
    const hi = Math.max(...ys);
    return r.y >= lo - (hi - lo) * 0.5 && r.y <= hi + (hi - lo) * 0.5;
  });
  const allY = [...ys, ...visibleRefs.map((r) => r.y)];
  const ticks = niceTicks(Math.min(...allY), Math.max(...allY));
  const yMin = ticks[0];
  const yMax = ticks[ticks.length - 1];

  const xPos = (d: string) => PAD.left + (dates.length === 1 ? innerW / 2 : (daysBetween(first, d) / span) * innerW);
  const yPos = (v: number) => PAD.top + innerH - ((v - yMin) / (yMax - yMin)) * innerH;

  // ~3–4 date labels along the bottom
  const xLabelCount = Math.min(dates.length, width < 360 ? 3 : 4);
  const xLabels =
    xLabelCount <= 1 ? [first] : Array.from({ length: xLabelCount }, (_, i) => dates[Math.round((i * (dates.length - 1)) / (xLabelCount - 1))]);

  const pick = (clientX: number) => {
    const rect = wrapRef.current!.getBoundingClientRect();
    const x = clientX - rect.left;
    let best = 0;
    let bestDist = Infinity;
    dates.forEach((d, i) => {
      const dist = Math.abs(xPos(d) - x);
      if (dist < bestDist) {
        bestDist = dist;
        best = i;
      }
    });
    setHover(best);
  };

  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'ArrowLeft') setHover((h) => Math.max(0, (h ?? dates.length) - 1));
    else if (e.key === 'ArrowRight') setHover((h) => Math.min(dates.length - 1, (h ?? -1) + 1));
    else if (e.key === 'Escape') setHover(undefined);
    else return;
    e.preventDefault();
  };

  const hoverDate = hover !== undefined ? dates[hover] : undefined;
  const hx = hoverDate ? xPos(hoverDate) : 0;
  const tipLeft = Math.min(Math.max(hx - 70, 0), width - 140);

  return (
    <div className="chart">
      {!hideLegend && series.length > 1 && (
        <div className="chart-legend">
          {series.map((s) => (
            <span key={s.id}>
              {s.kind === 'line' ? <i className="key-line" style={{ background: s.color }} /> : <i className="key-dot" style={{ background: s.color }} />}
              {s.label}
            </span>
          ))}
        </div>
      )}
      <div ref={wrapRef} style={{ position: 'relative' }}>
        <svg
          width={width}
          height={height}
          role="img"
          aria-label={ariaLabel}
          tabIndex={0}
          onKeyDown={onKey}
          onPointerDown={(e: PointerEvent) => pick(e.clientX)}
          onPointerMove={(e: PointerEvent) => pick(e.clientX)}
          onPointerLeave={(e: PointerEvent) => e.pointerType === 'mouse' && setHover(undefined)}
          onBlur={() => setHover(undefined)}
          style={{ display: 'block', touchAction: 'pan-y' }}
        >
          {ticks.map((t) => (
            <g key={t}>
              <line x1={PAD.left} x2={width - PAD.right} y1={yPos(t)} y2={yPos(t)} className="chart-grid" />
              <text x={PAD.left - 6} y={yPos(t)} className="chart-tick" textAnchor="end" dominantBaseline="middle">
                {formatTick(t)}
              </text>
            </g>
          ))}
          {xLabels.map((d, i) => (
            <text
              key={d + i}
              x={xPos(d)}
              y={height - 6}
              className="chart-tick"
              textAnchor={i === 0 && xLabels.length > 1 ? 'start' : i === xLabels.length - 1 && xLabels.length > 1 ? 'end' : 'middle'}
            >
              {formatDate(d)}
            </text>
          ))}
          {visibleRefs.map((r) => (
            <g key={r.label}>
              <line x1={PAD.left} x2={width - PAD.right} y1={yPos(r.y)} y2={yPos(r.y)} className="chart-ref" />
              <text x={width - PAD.right} y={yPos(r.y) - 5} className="chart-tick" textAnchor="end">
                {r.label}
              </text>
            </g>
          ))}
          {series.map((s) =>
            s.kind === 'line' ? (
              <path
                key={s.id}
                d={s.points.map((p, i) => `${i ? 'L' : 'M'}${xPos(p.x).toFixed(1)},${yPos(p.y).toFixed(1)}`).join('')}
                fill="none"
                stroke={s.color}
                strokeWidth={2}
                strokeLinejoin="round"
                strokeLinecap="round"
              />
            ) : (
              <g key={s.id}>
                {s.points.map((p) => (
                  <circle key={p.x} cx={xPos(p.x)} cy={yPos(p.y)} r={4} fill={s.color} stroke="var(--surface)" strokeWidth={2} />
                ))}
              </g>
            ),
          )}
          {/* End-of-line marker for line series */}
          {series
            .filter((s) => s.kind === 'line' && s.points.length)
            .map((s) => {
              const p = s.points[s.points.length - 1];
              return <circle key={s.id + '-end'} cx={xPos(p.x)} cy={yPos(p.y)} r={4} fill={s.color} stroke="var(--surface)" strokeWidth={2} />;
            })}
          {hoverDate && <line x1={hx} x2={hx} y1={PAD.top} y2={PAD.top + innerH} className="chart-crosshair" />}
        </svg>
        {hoverDate && (
          <div className="chart-tip" style={{ left: tipLeft }} role="status">
            <div className="chart-tip-date">{formatDate(hoverDate, { weekday: 'short', day: 'numeric', month: 'short' })}</div>
            {series.map((s) => {
              const p = s.points.find((q) => q.x === hoverDate);
              if (!p) return null;
              return (
                <div key={s.id} className="chart-tip-row">
                  <i className={s.kind === 'line' ? 'key-line' : 'key-dot'} style={{ background: s.color }} />
                  <strong>{formatValue(p.y)}</strong>
                  <span className="muted">{s.label}</span>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
