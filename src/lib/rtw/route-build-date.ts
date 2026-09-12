const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Resolve a reproducible route-network build date from an optional CLI date. */
export function resolveRouteBuildDate(value: string | undefined, now: Date = new Date()): string {
  if (value === undefined) return now.toISOString().slice(0, 10);
  if (!DATE_RE.test(value) || Number.isNaN(Date.parse(`${value}T00:00:00Z`))) {
    throw new Error('route build date must be a real YYYY-MM-DD date');
  }
  return value;
}
