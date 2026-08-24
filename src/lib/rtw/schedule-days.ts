/**
 * UI-facing schedule lookups over the flight-schedule catalog
 * (docs/decisions/flight-schedule-model.md S4/S5).
 *
 * The ENGINE (src/lib/rtw/validate.ts) owns the schedule-day-mismatch
 * warning; THIS module owns the mirror-image UI rule: hard-disable
 * non-operating days in the leg calendar ONLY when an entry is verifiably
 * active on the specific date being picked. Both sides share the exact
 * same window semantics (ruling, Phase 10):
 *
 *   - Entries are directional (ordered from→to pair); never reversed.
 *   - One carrier+pair MAY have multiple rows with DIFFERENT season
 *     windows (winter vs summer timetables). The row active on the
 *     reference date wins; if several matched the first wins.
 *   - A row is ACTIVE on a date iff:
 *       status !== 'suspended', and
 *       effectiveFrom absent OR iso >= effectiveFrom, and
 *       effectiveUntil absent/null OR iso <= effectiveUntil, and
 *       season window (when present) contains MM-DD:
 *         start+end present: normal window if start<=end, wrapping if start>end;
 *         start only: mmdd >= start; end only: mmdd <= end.
 *   - No active row for that date ⇒ NULL (schedule unknown for that
 *     date) — never an empty set. Between-season gaps may hide unpinned
 *     base service (the CX extras lesson): treating "no active row" as
 *     "nothing flies" would fabricate certainty we do not have.
 *   - Expired-window rows (e.g. last year's CI timetable) therefore go
 *     silent instead of disabling/warning — honest stale seed, zero
 *     false hard-prevention.
 *
 * Presentational components import from here; keeping these helpers out
 * of LegDateCalendar.tsx also keeps that file react-refresh-clean
 * (component files export components only).
 */

/** Structural mirror of ScheduleEntrySchema rows (src/lib/schemas/
 * flight-schedules.ts) — declared locally so UI code depends on shape,
 * not on importing engine/schema modules into component bundles. */
export interface ScheduleLike {
  readonly carrier: string;
  readonly pair: readonly [string, string];
  readonly daysOfWeek: ReadonlyArray<number>;
  // Optional fields carry explicit `| undefined` so zod-inferred rows
  // (whose .optional() emits exactly that under exactOptionalPropertyTypes)
  // remain structurally assignable.
  readonly flightNumbers?: ReadonlyArray<string> | undefined;
  readonly seasonStart?: string | undefined;
  readonly seasonEnd?: string | undefined;
  readonly effectiveFrom?: string | undefined;
  readonly effectiveUntil?: string | null | undefined;
  readonly status: 'operating' | 'seasonal' | 'suspended';
}

/** ISO weekday (1=Mon…7=Sun) of a YYYY-MM-DD string. Returns 0 on garbage.
 * UTC-based so ISO strings never drift by a day across timezones. */
export function isoWeekday(iso: string): number {
  const parts = iso.split('-').map(Number);
  const y = parts[0];
  const m = parts[1];
  const d = parts[2];
  if (
    y === undefined ||
    m === undefined ||
    d === undefined ||
    !Number.isFinite(y) ||
    !Number.isFinite(m) ||
    !Number.isFinite(d)
  ) {
    return 0;
  }
  return ((new Date(Date.UTC(y, m - 1, d)).getUTCDay() + 6) % 7) + 1;
}

/** Today as YYYY-MM-DD in UTC (matches the ISO-string domain). */
export function todayIso(): string {
  const now = new Date();
  const y = now.getUTCFullYear();
  const m = now.getUTCMonth() + 1;
  const d = now.getUTCDate();
  const pad = (n: number): string => (n < 10 ? `0${n}` : `${n}`);
  return `${y}-${pad(m)}-${pad(d)}`;
}

function monthDayOf(iso: string): string {
  // iso is YYYY-MM-DD; MM-DD is the suffix.
  return iso.slice(5);
}

/** Season-window containment (MM-DD), supporting IATA wrap-around
 * seasons (e.g. 10-01 → 03-31 spans the northern-hemisphere winter). */
export function seasonContains(
  start: string | undefined,
  end: string | undefined,
  iso: string,
): boolean {
  const mmdd = monthDayOf(iso);
  if (start === undefined && end === undefined) return true;
  if (start !== undefined && end !== undefined) {
    return start <= end
      ? mmdd >= start && mmdd <= end // normal window
      : mmdd >= start || mmdd <= end; // wrapping window
  }
  if (start !== undefined) return mmdd >= start; // start-only bound
  return end !== undefined && mmdd <= end; // end-only bound
}

/** Is this catalog row verifiably active on `iso`?
 * Suspended rows are never active; absolute validity bounds and the
 * season window are enforced per the module docblock. */
export function isScheduleActiveOn(entry: ScheduleLike, iso: string): boolean {
  if (entry.status === 'suspended') return false;
  if (entry.effectiveFrom !== undefined && iso < entry.effectiveFrom) return false;
  if (
    entry.effectiveUntil !== undefined &&
    entry.effectiveUntil !== null &&
    iso > entry.effectiveUntil
  ) {
    return false;
  }
  return seasonContains(entry.seasonStart, entry.seasonEnd, iso);
}

/**
 * Operating weekdays for an ordered carrier pair ON a specific date.
 *   - returns null when the catalog is absent, the pair has no row, every
 *     candidate row is suspended/out-of-window (unknown ≠ nothing flies),
 *   - otherwise the active row's weekday set (ISO 1..7).
 */
export function operatingDaysForDate(
  schedules: ReadonlyArray<ScheduleLike> | null,
  carrier: string,
  fromIata: string,
  toIata: string,
  iso: string,
): ReadonlySet<number> | null {
  if (!schedules || !carrier) return null;
  let active: ScheduleLike | undefined;
  for (const entry of schedules) {
    if (entry.carrier !== carrier) continue;
    if (entry.pair[0] !== fromIata || entry.pair[1] !== toIata) continue;
    if (isScheduleActiveOn(entry, iso)) {
      active = entry;
      break;
    }
  }
  if (!active) return null;
  return new Set(active.daysOfWeek);
}

/** Humanized weekday chip ("一・三・五" / "M・W・F") via Intl narrow names,
 * emitted in ISO order regardless of input order. */
export function humanizeDays(
  days: ReadonlySet<number> | ReadonlyArray<number>,
  localeTag: string,
): string {
  // Normalize once — avoids Array.prototype.includes (missing under
  // older lib targets) and keeps the loop to Set#has only.
  const daySet = days instanceof Set ? days : new Set<number>(days);
  const formatter = new Intl.DateTimeFormat(localeTag, {
    weekday: 'narrow',
    timeZone: 'UTC',
  });
  // Anchor dates 2024-01-01(Mon)…07(Sun) give each ISO weekday a UTC-safe
  // representative for Intl formatting.
  const anchors: ReadonlyArray<Date> = [0, 1, 2, 3, 4, 5, 6].map(
    (i) => new Date(Date.UTC(2024, 0, 1 + i)),
  );
  const labels: string[] = [];
  for (let day = 1; day <= 7; day++) {
    if (!daySet.has(day)) continue;
    const anchor = anchors[day - 1];
    if (anchor) labels.push(formatter.format(anchor));
  }
  return labels.join('・');
}
