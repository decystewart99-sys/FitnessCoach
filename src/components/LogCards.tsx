// Quick-entry cards for daily weigh-ins and food totals (used on Today and Weight tabs).

import { useEffect, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db';
import type { Phase, Settings } from '../types';
import { NumberInput, WeightInput } from './ui';
import { formatDate, today } from '../lib/dates';
import { formatWeight } from '../lib/units';
import { kcalFor } from '../lib/plan';

export function WeighInCard({ settings, date: fixedDate, compact }: { settings: Settings; date?: string; compact?: boolean }) {
  const [date, setDate] = useState(fixedDate ?? today());
  useEffect(() => {
    if (fixedDate) setDate(fixedDate);
  }, [fixedDate]);
  const existing = useLiveQuery(() => db.weights.get(date), [date]);
  const last = useLiveQuery(() => db.weights.orderBy('date').last(), []);
  const [kg, setKg] = useState<number>();
  const [editing, setEditing] = useState(false);
  const [saved, setSaved] = useState(false);

  // Pre-fill with the existing entry for this date, else the most recent weigh-in.
  useEffect(() => {
    setKg(existing?.kg ?? last?.kg);
    setEditing(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [existing?.kg, date, last === undefined]);

  const save = async () => {
    if (!kg || kg < 30 || kg > 350) return;
    await db.weights.put({ date, kg: Math.round(kg * 100) / 100 });
    setEditing(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 1500);
  };

  const showForm = !existing || editing;
  return (
    <div className="card">
      <div className="spread" style={{ marginBottom: showForm ? 10 : 0 }}>
        <h3 style={{ margin: 0 }}>{date === today() ? "Today's weigh-in" : `Weigh-in · ${formatDate(date)}`}</h3>
        {!compact && !fixedDate && (
          <input type="date" value={date} max={today()} onChange={(e) => e.target.value && setDate(e.target.value)} style={{ width: 'auto', minHeight: 36, padding: '4px 8px' }} aria-label="Weigh-in date" />
        )}
      </div>
      {showForm ? (
        <div className="inline-form">
          <WeightInput key={`${date}-${existing?.kg ?? last?.kg ?? ''}-${settings.weightUnit}`} kg={kg} onChange={setKg} unit={settings.weightUnit} />
          <button className="btn primary" onClick={save} disabled={!kg}>
            Save
          </button>
        </div>
      ) : (
        <div className="spread">
          <span style={{ fontSize: '1.3rem', fontWeight: 700 }}>
            {formatWeight(existing!.kg, settings.weightUnit)} {saved && <span className="badge accent">Saved</span>}
          </span>
          <button className="btn small" onClick={() => setEditing(true)}>
            Edit
          </button>
        </div>
      )}
    </div>
  );
}

export function FoodCard({ phase, date: fixedDate }: { phase: Phase; date?: string }) {
  const date = fixedDate ?? today();
  const existing = useLiveQuery(() => db.nutrition.get(date), [date]);
  const [kcal, setKcal] = useState<number>();
  const [protein, setProtein] = useState<number>();
  const [carb, setCarb] = useState<number>();
  const [fat, setFat] = useState<number>();
  const [editing, setEditing] = useState(false);
  const macros = phase.profile.nutritionMode === 'macros';
  const target = kcalFor(phase, date);

  useEffect(() => {
    setKcal(existing?.kcal);
    setProtein(existing?.proteinG);
    setCarb(existing?.carbG);
    setFat(existing?.fatG);
  }, [existing]);

  const save = async () => {
    if (!kcal) return;
    await db.nutrition.put({ date, kcal, proteinG: protein ?? 0, carbG: carb, fatG: fat });
    setEditing(false);
  };

  const showForm = !existing || editing;
  return (
    <div className="card">
      <div className="spread">
        <h3 style={{ margin: 0 }}>Food {date === today() ? 'today' : formatDate(date)}</h3>
        <span className="small muted">
          Target {target} kcal · {phase.energy.proteinG} g protein
        </span>
      </div>
      {showForm ? (
        <>
          <p className="small muted" style={{ margin: '6px 0 10px' }}>
            Copy your day's totals from MyFitnessPal (Diary → Nutrition). Log at the end of the day, or update as you go.
          </p>
          <div className="row">
            <NumberInput value={kcal} onChange={setKcal} suffix="kcal" placeholder="Calories" />
            <NumberInput value={protein} onChange={setProtein} suffix="g P" placeholder="Protein" />
          </div>
          {macros && (
            <div className="row" style={{ marginTop: 8 }}>
              <NumberInput value={carb} onChange={setCarb} suffix="g C" placeholder="Carbs" />
              <NumberInput value={fat} onChange={setFat} suffix="g F" placeholder="Fat" />
            </div>
          )}
          <button className="btn primary block" style={{ marginTop: 10 }} onClick={save} disabled={!kcal}>
            Save
          </button>
        </>
      ) : (
        <div className="spread" style={{ marginTop: 8 }}>
          <div>
            <div style={{ fontSize: '1.3rem', fontWeight: 700 }}>
              {existing!.kcal} kcal · {existing!.proteinG} g protein
            </div>
            <div className="small muted">
              {existing!.kcal - target > 0 ? `${existing!.kcal - target} over` : `${target - existing!.kcal} under`} target
              {existing!.proteinG < phase.energy.proteinG ? ` · ${phase.energy.proteinG - existing!.proteinG} g protein short` : ' · protein hit ✓'}
            </div>
          </div>
          <button className="btn small" onClick={() => setEditing(true)}>
            Edit
          </button>
        </div>
      )}
    </div>
  );
}
