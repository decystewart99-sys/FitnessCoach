// Dates are stored as local calendar days in 'YYYY-MM-DD' form. Weeks start on Monday.

export const DAY_NAMES = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
export const DAY_SHORT = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

export function toISODate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function parseISODate(s: string): Date {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function today(): string {
  return toISODate(new Date());
}

export function addDays(iso: string, n: number): string {
  const d = parseISODate(iso);
  d.setDate(d.getDate() + n);
  return toISODate(d);
}

/** 0 = Monday … 6 = Sunday */
export function weekday(iso: string): number {
  return (parseISODate(iso).getDay() + 6) % 7;
}

export function daysBetween(a: string, b: string): number {
  return Math.round((parseISODate(b).getTime() - parseISODate(a).getTime()) / 86_400_000);
}

export function mondayOf(iso: string): string {
  return addDays(iso, -weekday(iso));
}

/** Today if it's Monday, otherwise the coming Monday. */
export function nextMonday(from: string = today()): string {
  const wd = weekday(from);
  return wd === 0 ? from : addDays(from, 7 - wd);
}

export function formatDate(iso: string, opts: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short' }): string {
  return parseISODate(iso).toLocaleDateString(undefined, opts);
}
