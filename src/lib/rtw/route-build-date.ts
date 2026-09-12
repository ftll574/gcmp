import { isCalendarDate } from '../calendar-date.ts';

/** Resolve a reproducible route-network build date from an optional CLI date. */
export function resolveRouteBuildDate(value: string | undefined, now: Date = new Date()): string {
  if (value === undefined) return now.toISOString().slice(0, 10);
  if (!isCalendarDate(value)) {
    throw new Error('route build date must be a real YYYY-MM-DD date');
  }
  return value;
}
