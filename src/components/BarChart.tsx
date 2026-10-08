// Single-series column chart (e.g. weekly distance). Thin columns with rounded tops,
// tap/hover a column for its value; the latest column is direct-labelled.

import { useEffect, useRef, useState } from 'react';
import { niceTicks } from './LineChart';

interface Props {
  data: Array<{ key: string; label: string; value: number }>;
  formatValue: (v: number) => string;
  formatTick: (v: number) => string;
  ariaLabel: string;
  height?: number;
}

const PAD = { top: 18, right: 8, bottom: 24, left: 36 };

export default function BarChart({ data, formatValue, formatTick, ariaLabel, height = 180 }: Props) {
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

  const ticks = niceTicks(0, Math.max(1, ...data.map((d) => d.value)));
  const yMax = ticks[ticks.length - 1];
  const innerW = width - PAD.left - PAD.right;
  const innerH = height - PAD.top - PAD.bottom;
  const band = innerW / Math.max(1, data.length);
  const barW = Math.min(24, band - 4);
  const x = (i: number) => PAD.left + band * i + (band - barW) / 2;
  const y = (v: number) => PAD.top + innerH - (v / yMax) * innerH;
  const labelEvery = Math.ceil(data.length / (width < 360 ? 4 : 6));
  const last = data.length - 1;

  return (
    <div ref={wrapRef} className="chart" style={{ position: 'relative' }}>
      <svg width={width} height={height} role="img" aria-label={ariaLabel} style={{ display: 'block' }} onPointerLeave={() => setHover(undefined)}>
        {ticks.map((t) => (
          <g key={t}>
            <line x1={PAD.left} x2={width - PAD.right} y1={y(t)} y2={y(t)} className="chart-grid" />
            <text x={PAD.left - 6} y={y(t)} className="chart-tick" textAnchor="end" dominantBaseline="middle">
              {formatTick(t)}
            </text>
          </g>
        ))}
        {data.map((d, i) => {
          const h = Math.max(0, y(0) - y(d.value));
          const r = Math.min(4, h, barW / 2);
          const top = y(d.value);
          // Rounded top, square base.
          const path =
            h <= 0
              ? ''
              : `M${x(i)},${y(0)} V${top + r} Q${x(i)},${top} ${x(i) + r},${top} H${x(i) + barW - r} Q${x(i) + barW},${top} ${x(i) + barW},${top + r} V${y(0)} Z`;
          return (
            <g
              key={d.key}
              tabIndex={0}
              role="button"
              aria-label={`${d.label}: ${formatValue(d.value)}`}
              onPointerEnter={() => setHover(i)}
              onPointerDown={() => setHover(i)}
              onFocus={() => setHover(i)}
              onBlur={() => setHover(undefined)}
              style={{ cursor: 'pointer', outline: 'none' }}
            >
              {/* Hit target spans the whole band and height */}
              <rect x={PAD.left + band * i} y={PAD.top} width={band} height={innerH} fill="transparent" />
              {path && <path d={path} fill="var(--series-1)" opacity={hover === undefined || hover === i ? 1 : 0.55} />}
              {(i % labelEvery === last % labelEvery) && (
                <text x={x(i) + barW / 2} y={height - 6} className="chart-tick" textAnchor="middle">
                  {d.label}
                </text>
              )}
            </g>
          );
        })}
        {data.length > 0 && data[last].value > 0 && hover === undefined && (
          <text x={x(last) + barW / 2} y={y(data[last].value) - 5} className="chart-tick" textAnchor="middle" style={{ fill: 'var(--text)', fontWeight: 600 }}>
            {formatValue(data[last].value)}
          </text>
        )}
      </svg>
      {hover !== undefined && (
        <div className="chart-tip" role="status" style={{ left: Math.min(Math.max(x(hover) + barW / 2 - 70, 0), width - 140) }}>
          <div className="chart-tip-date">{data[hover].label}</div>
          <div className="chart-tip-row">
            <i className="key-dot" style={{ background: 'var(--series-1)', borderRadius: 2 }} />
            <strong>{formatValue(data[hover].value)}</strong>
          </div>
        </div>
      )}
    </div>
  );
}
