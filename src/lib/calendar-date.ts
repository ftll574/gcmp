/** Calendar dates are labels, not instants. UTC is used only for arithmetic. */
export function isCalendarDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

export function addCalendarDays(date: string, days: number): string {
  if (!isCalendarDate(date) || !Number.isInteger(days)) throw new Error('Invalid calendar date or day offset');
  return new Date(Date.parse(`${date}T00:00:00Z`) + days * 86400000).toISOString().slice(0, 10);
}

export function datesBetween(start: string, end: string): string[] {
  if (!isCalendarDate(start) || !isCalendarDate(end) || start > end) throw new Error('Invalid date range');
  const count = Math.round((Date.parse(end) - Date.parse(start)) / 86400000) + 1;
  if (count > 31) throw new Error('A schedule query is limited to 31 dates');
  return Array.from({ length: count }, (_, i) => addCalendarDays(start, i));
}

export function monthDates(month: string): string[] {
  const start = `${month}-01`;
  if (!isCalendarDate(start)) throw new Error('Invalid month');
  const next = new Date(`${start}T00:00:00Z`);
  next.setUTCMonth(next.getUTCMonth() + 1);
  return datesBetween(start, addCalendarDays(next.toISOString().slice(0, 10), -1));
}

export function shiftCalendarMonth(month: string, offset: number): string {
  if (!isCalendarDate(`${month}-01`) || !Number.isInteger(offset)) throw new Error('Invalid month');
  const date = new Date(`${month}-01T00:00:00Z`);
  date.setUTCMonth(date.getUTCMonth() + offset);
  return date.toISOString().slice(0, 7);
}
