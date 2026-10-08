// Small form building blocks shared by the onboarding and settings screens.

import { useEffect, useState, type ReactNode } from 'react';
import type { HeightUnit, WeightUnit } from '../types';
import { cmToFtIn, CM_PER_IN, formatDuration, kgToLb, kgToStLb, lbToKg, parseDuration } from '../lib/units';
import { DAY_SHORT } from '../lib/dates';

export function Field({ label, hint, children }: { label: string; hint?: ReactNode; children: ReactNode }) {
  return (
    <label className="field">
      <span className="field-label">{label}</span>
      {children}
      {hint && <span className="field-hint">{hint}</span>}
    </label>
  );
}

/** Numeric input that keeps its own text while typing (so "8." or "" don't get clobbered). */
export function NumberInput({
  value,
  onChange,
  suffix,
  step = 1,
  min,
  max,
  placeholder,
  decimals,
}: {
  value: number | undefined;
  onChange: (v: number | undefined) => void;
  suffix?: string;
  step?: number;
  min?: number;
  max?: number;
  placeholder?: string;
  decimals?: number;
}) {
  const fmt = (v: number | undefined) =>
    v === undefined || !Number.isFinite(v) ? '' : decimals !== undefined ? String(Number(v.toFixed(decimals))) : String(v);
  const [text, setText] = useState(fmt(value));
  useEffect(() => {
    // Sync external changes unless they match what's typed.
    const parsed = text.trim() === '' ? undefined : Number(text.replace(',', '.'));
    if (parsed !== value && !(parsed !== undefined && value !== undefined && Math.abs(parsed - value) < 1e-9)) setText(fmt(value));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  const input = (
    <input
      type="text"
      inputMode={step < 1 || decimals ? 'decimal' : 'numeric'}
      value={text}
      placeholder={placeholder}
      onChange={(e) => {
        const t = e.target.value;
        setText(t);
        if (t.trim() === '') return onChange(undefined);
        const n = Number(t.replace(',', '.'));
        if (!Number.isFinite(n)) return;
        if (min !== undefined && n < min) return onChange(n); // let validation flag it
        if (max !== undefined && n > max) return onChange(n);
        onChange(n);
      }}
    />
  );
  return suffix ? (
    <div className="input-suffix">
      {input}
      <span>{suffix}</span>
    </div>
  ) : (
    input
  );
}

export function WeightInput({ kg, onChange, unit }: { kg: number | undefined; onChange: (kg: number | undefined) => void; unit: WeightUnit }) {
  if (unit === 'kg') return <NumberInput value={kg} onChange={onChange} suffix="kg" step={0.1} decimals={1} />;
  if (unit === 'lb')
    return <NumberInput value={kg === undefined ? undefined : kgToLb(kg)} onChange={(lb) => onChange(lb === undefined ? undefined : lbToKg(lb))} suffix="lb" step={0.1} decimals={1} />;
  return <StLbInput kg={kg} onChange={onChange} />;
}

function StLbInput({ kg, onChange }: { kg: number | undefined; onChange: (kg: number | undefined) => void }) {
  const init = kg === undefined ? undefined : kgToStLb(kg);
  const [st, setSt] = useState<number | undefined>(init?.st);
  const [lb, setLb] = useState<number | undefined>(init?.lb);
  const emit = (s: number | undefined, l: number | undefined) => {
    if (s === undefined && l === undefined) onChange(undefined);
    else onChange(lbToKg((s ?? 0) * 14 + (l ?? 0)));
  };
  return (
    <div className="row">
      <NumberInput value={st} onChange={(v) => (setSt(v), emit(v, lb))} suffix="st" />
      <NumberInput value={lb} onChange={(v) => (setLb(v), emit(st, v))} suffix="lb" step={0.1} decimals={1} />
    </div>
  );
}

export function HeightInput({ cm, onChange, unit }: { cm: number | undefined; onChange: (cm: number | undefined) => void; unit: HeightUnit }) {
  const init = cm === undefined ? undefined : cmToFtIn(cm);
  const [ft, setFt] = useState<number | undefined>(init?.ft);
  const [inch, setInch] = useState<number | undefined>(init?.inch);
  if (unit === 'cm') return <NumberInput value={cm === undefined ? undefined : Math.round(cm)} onChange={onChange} suffix="cm" />;
  const emit = (f: number | undefined, i: number | undefined) => {
    if (f === undefined && i === undefined) onChange(undefined);
    else onChange(((f ?? 0) * 12 + (i ?? 0)) * CM_PER_IN);
  };
  return (
    <div className="row">
      <NumberInput value={ft} onChange={(v) => (setFt(v), emit(v, inch))} suffix="ft" />
      <NumberInput value={inch} onChange={(v) => (setInch(v), emit(ft, v))} suffix="in" />
    </div>
  );
}

/** Lengths like waist: cm, or inches when the user prefers imperial. */
export function LengthInput({ cm, onChange, unit }: { cm: number | undefined; onChange: (cm: number | undefined) => void; unit: HeightUnit }) {
  if (unit === 'cm') return <NumberInput value={cm} onChange={onChange} suffix="cm" decimals={1} step={0.5} />;
  return (
    <NumberInput
      value={cm === undefined ? undefined : cm / CM_PER_IN}
      onChange={(v) => onChange(v === undefined ? undefined : v * CM_PER_IN)}
      suffix="in"
      decimals={1}
      step={0.5}
    />
  );
}

/** "25:30" or "1:52:00" */
export function DurationInput({ seconds, onChange, placeholder }: { seconds: number | undefined; onChange: (s: number | undefined) => void; placeholder?: string }) {
  const [text, setText] = useState(seconds ? formatDuration(seconds) : '');
  const parsed = parseDuration(text);
  return (
    <>
      <input
        type="text"
        inputMode="numeric"
        placeholder={placeholder ?? 'mm:ss'}
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          onChange(parseDuration(e.target.value));
        }}
      />
      {text && parsed === undefined && <span className="field-hint">Use minutes:seconds, e.g. 27:45</span>}
    </>
  );
}

export function Segmented<T extends string | number>({
  value,
  options,
  onChange,
}: {
  value: T | undefined;
  options: Array<{ value: T; label: string }>;
  onChange: (v: T) => void;
}) {
  return (
    <div className="segmented" role="group">
      {options.map((o) => (
        <button type="button" key={String(o.value)} aria-pressed={value === o.value} onClick={() => onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function OptionList<T extends string | number>({
  value,
  options,
  onChange,
}: {
  value: T | undefined;
  options: Array<{ value: T; label: string; hint?: string }>;
  onChange: (v: T) => void;
}) {
  return (
    <div className="options" role="group">
      {options.map((o) => (
        <button type="button" className="option" key={String(o.value)} aria-pressed={value === o.value} onClick={() => onChange(o.value)}>
          {o.label}
          {o.hint && <small>{o.hint}</small>}
        </button>
      ))}
    </div>
  );
}

export function Chips<T extends string>({
  values,
  options,
  onChange,
}: {
  values: T[];
  options: Array<{ value: T; label: string }>;
  onChange: (v: T[]) => void;
}) {
  return (
    <div className="segmented" role="group">
      {options.map((o) => {
        const on = values.includes(o.value);
        return (
          <button
            type="button"
            className="chip"
            key={o.value}
            aria-pressed={on}
            onClick={() => onChange(on ? values.filter((v) => v !== o.value) : [...values, o.value])}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

export function DayPicker({ days, onChange, single }: { days: number[]; onChange: (d: number[]) => void; single?: boolean }) {
  return (
    <div className="days" role="group">
      {DAY_SHORT.map((label, d) => {
        const on = days.includes(d);
        return (
          <button
            type="button"
            key={d}
            aria-pressed={on}
            aria-label={label}
            onClick={() => onChange(single ? [d] : on ? days.filter((x) => x !== d) : [...days, d].sort())}
          >
            {label}
          </button>
        );
      })}
    </div>
  );
}

export function RankList<T extends string>({ items, labels, onChange }: { items: T[]; labels: Record<T, string>; onChange: (items: T[]) => void }) {
  const move = (i: number, dir: -1 | 1) => {
    const next = [...items];
    [next[i], next[i + dir]] = [next[i + dir], next[i]];
    onChange(next);
  };
  return (
    <div>
      {items.map((item, i) => (
        <div className="rank-item" key={item}>
          <span className="rank-num">{i + 1}</span>
          <span className="grow">{labels[item]}</span>
          <button type="button" className="icon-btn" aria-label={`Move ${labels[item]} up`} disabled={i === 0} onClick={() => move(i, -1)}>
            ↑
          </button>
          <button type="button" className="icon-btn" aria-label={`Move ${labels[item]} down`} disabled={i === items.length - 1} onClick={() => move(i, 1)}>
            ↓
          </button>
        </div>
      ))}
    </div>
  );
}
