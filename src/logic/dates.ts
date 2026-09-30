import { WEEKDAYS, type ISODate, type Weekday } from '../shared/types';

const pad = (n: number) => String(n).padStart(2, '0');

export function toISODate(d: Date): ISODate {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function parseISODate(s: ISODate): Date {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function todayISO(now: Date = new Date()): ISODate {
  return toISODate(now);
}

export function addDays(s: ISODate, n: number): ISODate {
  const d = parseISODate(s);
  d.setDate(d.getDate() + n);
  return toISODate(d);
}

/** Whole days from a to b (b − a). */
export function daysBetween(a: ISODate, b: ISODate): number {
  return Math.round((parseISODate(b).getTime() - parseISODate(a).getTime()) / 86_400_000);
}

export function weekdayOf(s: ISODate): Weekday {
  // getDay: 0 = Sunday. WEEKDAYS starts on Monday.
  return WEEKDAYS[(parseISODate(s).getDay() + 6) % 7];
}

/** Monday of the week containing s. Weeks run Monday–Sunday. */
export function weekStart(s: ISODate): ISODate {
  const d = parseISODate(s);
  return addDays(s, -((d.getDay() + 6) % 7));
}

export function formatLongDate(s: ISODate): string {
  return parseISODate(s).toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' });
}

export function formatShortDate(s: ISODate): string {
  return parseISODate(s).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}
