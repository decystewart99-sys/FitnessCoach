import { describe, expect, it } from 'vitest';
import { buildIcs, escapeText, fold } from './ics';
import { generatePhase } from '../engine/phase';
import { buildProgram } from '../engine/program';
import type { Profile } from '../types';

const profile: Profile = {
  age: 35, sex: 'male', heightCm: 180, weightKg: 90, jobActivity: 'sedentary', goalRanking: ['fat', 'run', 'muscle'],
  weeklyLossPct: 0.5, runGoal: { kind: '5k' }, liftExperience: 'beginner', runContinuousMin: 0, trainingDays: [0, 2, 4, 6],
  allowDoubles: false, sessionMinutes: 60, longRunDay: 6, equipment: 'gym', homeEquipment: [], injuries: [], injuryNotes: '',
  mealsPerDay: 3, nutritionMode: 'calories_protein',
};

describe('ics export', () => {
  const phase = { ...generatePhase(profile, { startDate: '2026-10-12', lengthWeeks: 8 }), id: 3 };
  const ics = buildIcs(phase, buildProgram(phase), { from: '2026-10-12', workoutTime: '18:00', runTime: '07:00', alarmMinutes: 30, weighIn: { time: '07:00' }, checkin: true }, new Date('2026-10-08T12:00:00Z'));
  const unfolded = ics.replace(/\r\n /g, '');

  it('is a valid calendar with CRLF line endings and folded lines', () => {
    expect(ics.startsWith('BEGIN:VCALENDAR\r\n')).toBe(true);
    expect(ics.trimEnd().endsWith('END:VCALENDAR')).toBe(true);
    for (const line of ics.split('\r\n')) expect(line.length).toBeLessThanOrEqual(75);
    expect((ics.match(/BEGIN:VEVENT/g) ?? []).length).toBe((ics.match(/END:VEVENT/g) ?? []).length);
  });

  it('has one event per planned session plus the two reminders', () => {
    const sessionsPerWeek = phase.template.reduce((a, d) => a + d.sessions.length, 0);
    expect((unfolded.match(/BEGIN:VEVENT/g) ?? []).length).toBe(sessionsPerWeek * 8 + 2);
    expect(unfolded).toContain('RRULE:FREQ=DAILY;UNTIL=20261206T235959');
    expect(unfolded).toContain('SUMMARY:📋 Weekly check-in');
    expect(unfolded).toContain('TRIGGER:-PT30M');
    expect(unfolded).toContain('DTSTART:20261012T070000');
  });

  it('skips sessions before the chosen start date and keeps UIDs stable', () => {
    const later = buildIcs(phase, buildProgram(phase), { from: '2026-11-02', workoutTime: '18:00', runTime: '07:00', alarmMinutes: 0 });
    expect(later).not.toContain('DTSTART:20261012');
    const uids = (s: string) => new Set((s.replace(/\r\n /g, '').match(/UID:[^\r]+/g) ?? []).filter((u) => !u.includes('weighin') && !u.includes('checkin')));
    for (const u of uids(later)) expect(uids(unfolded).has(u)).toBe(true);
  });

  it('escapes text and folds long lines', () => {
    expect(escapeText('a,b;c\nd\\e')).toBe('a\\,b\\;c\\nd\\\\e');
    expect(fold('x'.repeat(200)).split('\r\n').every((l) => l.length <= 75)).toBe(true);
    // An emoji straddling the fold point stays intact.
    const s = 'x'.repeat(74) + '🏃' + 'y'.repeat(10);
    expect(fold(s).replace(/\r\n /g, '')).toBe(s);
    expect(fold(s).split('\r\n')[1].startsWith(' 🏃')).toBe(true);
  });
});
