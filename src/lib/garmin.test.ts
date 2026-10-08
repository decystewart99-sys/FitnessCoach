import { describe, expect, it } from 'vitest';
import { parseCsv } from './csv';
import { isDuplicate, matchToPlan, parseClock, parseGarminCsv } from './garmin';
import { generatePhase } from '../engine/phase';
import type { Profile } from '../types';

const SAMPLE = `﻿Activity Type,Date,Favorite,Title,Distance,Calories,Time,Avg HR,Max HR,Aerobic TE,Avg Run Cadence,Avg Pace
Running,2026-10-12 07:01:22,false,"Leeds Running",5.02,"412",00:31:40,148,163,3.1,164,6:18
Strength Training,2026-10-13 18:00:00,false,Strength,0.00,250,00:55:00,110,140,1.2,--,--
Treadmill Running,2026-10-14 06:30:00,false,"Intervals, 6x400",4.50,380,00:28:10.5,155,178,3.8,170,6:15
Running,2026-10-18 08:15:00,false,"Long run",10.10,"1,020",01:07:30,145,160,3.4,162,6:41
Walking,2026-10-18 12:00:00,false,Walk,2.1,120,00:30:00,95,110,0.5,--,--`;

describe('csv + garmin', () => {
  it('parses quoted fields with commas', () => {
    const rows = parseCsv('a,"b,c","d ""q"""\n1,2,3\n');
    expect(rows).toEqual([
      ['a', 'b,c', 'd "q"'],
      ['1', '2', '3'],
    ]);
  });

  it('parses clock times', () => {
    expect(parseClock('00:31:40')).toBe(1900);
    expect(parseClock('31:40')).toBe(1900);
    expect(parseClock('00:28:10.5')).toBeCloseTo(1690.5);
    expect(parseClock('--')).toBeUndefined();
  });

  it('keeps runs, skips other activities, reads distance/time/HR/kind', () => {
    const p = parseGarminCsv(SAMPLE, 'km');
    expect(p.runs).toHaveLength(3);
    expect(p.skipped).toEqual({ 'Strength Training': 1, Walking: 1 });
    expect(p.runs[0]).toMatchObject({ date: '2026-10-12', distanceKm: 5.02, durationSec: 1900, avgHr: 148, maxHr: 163, kind: 'easy', source: 'garmin' });
    expect(p.runs[1].kind).toBe('intervals');
    expect(p.runs[2].kind).toBe('long');
  });

  it('converts miles', () => {
    expect(parseGarminCsv(SAMPLE, 'mi').runs[0].distanceKm).toBeCloseTo(5.02 * 1.609344);
  });

  it('rejects files that are not Garmin exports', () => {
    expect(parseGarminCsv('name,age\nbob,3', 'km').problems.length).toBe(1);
  });

  it('detects duplicates and matches runs to planned sessions', () => {
    const [a] = parseGarminCsv(SAMPLE, 'km').runs;
    expect(isDuplicate(a, { ...a, durationSec: a.durationSec + 10, source: 'manual' })).toBe(true);
    expect(isDuplicate(a, { ...a, durationSec: a.durationSec + 300 })).toBe(false);

    const profile: Profile = {
      age: 35, sex: 'male', heightCm: 180, weightKg: 90, jobActivity: 'sedentary', goalRanking: ['run', 'fat', 'muscle'],
      weeklyLossPct: 0.5, runGoal: { kind: '10k' }, liftExperience: 'beginner', runContinuousMin: 30, trainingDays: [0, 2, 4, 6],
      allowDoubles: false, sessionMinutes: 60, longRunDay: 6, equipment: 'gym', homeEquipment: [], injuries: [], injuryNotes: '',
      mealsPerDay: 3, nutritionMode: 'calories_protein',
    };
    const phase = generatePhase(profile, { startDate: '2026-10-12' });
    const runDays = phase.template.filter((d) => d.sessions.some((s) => s.type === 'run')).map((d) => d.day);
    const onRunDay = { ...a, date: ['2026-10-12', '2026-10-13', '2026-10-14', '2026-10-15', '2026-10-16', '2026-10-17', '2026-10-18'][runDays[0]] };
    const [matched] = matchToPlan(phase, [onRunDay], []);
    expect(matched.sessionId).toBeDefined();
  });
});
