import { describe, expect, it, vi } from 'vitest';

// The notification plugin and database are only used by the scheduling wrapper, not the planner.
vi.mock('@capacitor/local-notifications', () => ({ LocalNotifications: {} }));

import { planReminders } from './notifications';
import { generatePhase } from '../engine/phase';
import type { Profile, Settings } from '../types';

const profile: Profile = {
  age: 34, sex: 'male', heightCm: 178, weightKg: 96.8, jobActivity: 'sedentary', goalRanking: ['fat', 'run', 'muscle'],
  weeklyLossPct: 0.5, runGoal: { kind: '5k' }, liftExperience: 'intermediate', runContinuousMin: 0, trainingDays: [0, 1, 2, 3, 4, 6],
  allowDoubles: true, sessionMinutes: 60, longRunDay: 6, equipment: 'gym', homeEquipment: [], injuries: [], injuryNotes: '',
  mealsPerDay: 3, nutritionMode: 'calories_protein', otherSports: [{ day: 5, name: 'Football' }],
};
const phase = generatePhase(profile, { startDate: '2026-10-14' });
const settings: Settings = { id: 'settings', weightUnit: 'kg', distanceUnit: 'km', heightUnit: 'cm' };
const now = new Date(2026, 9, 28, 7, 0); // Wed 28 Oct, 07:00
const status = { weighedToday: false, photosThisWeek: 0 };

describe('reminder planning', () => {
  const plan = planReminders(phase, settings, now, status);

  it('plans two weeks of reminders, all in the future, with unique ids', () => {
    expect(plan.length).toBeGreaterThan(14);
    expect(plan.every((r) => r.at > now)).toBe(true);
    expect(new Set(plan.map((r) => r.id)).size).toBe(plan.length);
    expect(Math.max(...plan.map((r) => r.at.getTime())) - now.getTime()).toBeLessThan(15 * 86_400_000);
  });

  it('includes the day\'s sessions, football and targets in the training reminder', () => {
    const sat = plan.find((r) => r.title.startsWith('🏋️') && r.at.getDay() === 6);
    expect(sat?.title).toContain('Football');
    const any = plan.find((r) => r.title.startsWith('🏋️'));
    expect(any?.body).toMatch(/Target \d+ kcal · \d+ g protein/);
  });

  it('skips today\'s weigh-in once you have weighed in, and protein reminders once hit', () => {
    const done = planReminders(phase, settings, now, { weighedToday: true, proteinToday: 999, photosThisWeek: 0 });
    const isToday = (d: Date) => d.toDateString() === now.toDateString();
    expect(done.some((r) => r.title === '⚖️ Weigh in' && isToday(r.at))).toBe(false);
    expect(done.some((r) => r.title === '🍽️ Food check' && isToday(r.at))).toBe(false);
    expect(plan.some((r) => r.title === '⚖️ Weigh in' && isToday(r.at))).toBe(true);
  });

  it('respects switched-off reminders and custom times', () => {
    const custom = planReminders(phase, { ...settings, reminders: { food: null, weighIn: '06:45' } }, now, status);
    expect(custom.some((r) => r.title === '🍽️ Food check')).toBe(false);
    expect(custom.filter((r) => r.title === '⚖️ Weigh in').every((r) => r.at.getHours() === 6 && r.at.getMinutes() === 45)).toBe(true);
  });

  it('reminds about the weekly check-in on the day it opens', () => {
    const checkins = plan.filter((r) => r.title.includes('check-in'));
    expect(checkins.length).toBeGreaterThanOrEqual(1);
    expect(checkins.every((r) => r.at.getDay() === 3)).toBe(true); // phase weeks start on Wednesday
  });
});
