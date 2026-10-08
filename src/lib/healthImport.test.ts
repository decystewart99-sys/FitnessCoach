import { describe, expect, it } from 'vitest';
import { extractParams, parseEnergy, parseImport, parseNumber, parseSleep, parseWeight } from './healthImport';

describe('lenient number parsing', () => {
  it('handles thousands separators and decimal commas', () => {
    expect(parseNumber('2,140', 'integer')).toBe(2140);
    expect(parseNumber('2.140', 'integer')).toBe(2140);
    expect(parseNumber('2140.6', 'integer')).toBe(2140.6);
    expect(parseNumber('94,4', 'decimal')).toBe(94.4);
    expect(parseNumber('1.234,5', 'decimal')).toBe(1234.5);
    expect(parseNumber('162 g', 'decimal')).toBe(162);
    expect(parseNumber('', 'decimal')).toBeUndefined();
  });

  it('converts energy units', () => {
    expect(parseEnergy('2,140 kcal')).toBe(2140);
    expect(parseEnergy('2140 Cal')).toBe(2140);
    expect(parseEnergy('8954 kJ')).toBe(2140);
    expect(parseEnergy('8954', 'kJ')).toBe(2140);
  });

  it('converts weight units including stones', () => {
    expect(parseWeight('94.4 kg')).toBe(94.4);
    expect(parseWeight('94,4')).toBe(94.4);
    expect(parseWeight('208.1 lb')).toBeCloseTo(94.39, 1);
    expect(parseWeight('14.86 st')).toBeCloseTo(94.37, 1);
    expect(parseWeight('14 st 12.1 lb')).toBeCloseTo(94.39, 1);
    expect(parseWeight('14.86', 'st')).toBeCloseTo(94.37, 1);
  });
});

describe('health fields', () => {
  it('parses sleep in any format Shortcuts might produce', () => {
    expect(parseSleep('7.5 hr')).toBe(450);
    expect(parseSleep('7.5')).toBe(450);
    expect(parseSleep('450 min')).toBe(450);
    expect(parseSleep('27000 s')).toBe(450);
    expect(parseSleep('27000')).toBe(450);
    expect(parseSleep('7:30')).toBe(450);
  });

  it('imports steps, resting HR and sleep, and accepts a health-only payload', () => {
    const r = parseImport(new URLSearchParams('date=2026-10-07&kcal=&weight=&steps=8,431&rhr=54 bpm&sleep=7:05'), '2026-10-08');
    expect(r).toEqual({ date: '2026-10-07', steps: 8431, restingHr: 54, sleepMin: 425 });
  });

  it('drops implausible health values', () => {
    const r = parseImport(new URLSearchParams('steps=9000&rhr=300&sleep=20 min'), '2026-10-08');
    expect(r).toEqual({ date: '2026-10-08', steps: 9000 });
  });
});

describe('import payload', () => {
  it('reads the clipboard format', () => {
    const params = extractParams('fitnesscoach:date=2026-10-07&kcal=2,140 kcal&protein=162 g&carbs=&fat=70&weight=94,4 kg')!;
    const r = parseImport(params, '2026-10-08');
    expect(r).toEqual({ date: '2026-10-07', kcal: 2140, proteinG: 162, fatG: 70, weightKg: 94.4 });
  });

  it('reads the link format', () => {
    const params = extractParams('https://x.github.io/FitnessCoach/#/import?kcal=1980&protein=150')!;
    const r = parseImport(params, '2026-10-08');
    expect(r).toMatchObject({ date: '2026-10-08', kcal: 1980, proteinG: 150 });
  });

  it('rejects text that is not an import, and silly values', () => {
    expect(extractParams('hello')).toBeUndefined();
    expect(parseImport(new URLSearchParams('kcal=&weight='))).toHaveProperty('error');
    expect(parseImport(new URLSearchParams('kcal=21400000'))).toHaveProperty('error');
    expect(parseImport(new URLSearchParams('date=2999-01-01&kcal=2000'))).toHaveProperty('error');
  });
});
