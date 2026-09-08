import { z } from 'zod';
import { isCalendarDate } from '../src/lib/calendar-date.ts';

// A public-field projection, never a raw API dump. Executed only against rows
// already fetched by the account holder's existing bounded diagnostic.
const DateValue = z.string().refine(isCalendarDate);
const Airport = z.string().regex(/^[A-Z]{3}$/);
const Airline = z.string().regex(/^[A-Z0-9]{2}$/);
const FlightNumber = z.string().max(32).refine((value) =>
  /^(?:(?:[A-Z][A-Z0-9]|[0-9][A-Z])\s*)?\d{1,4}[A-Z]?$/.test(value.trim().toUpperCase()));
const Clock = z.string().max(32).refine((value) =>
  /^(?:[01]\d|2[0-3]):[0-5]\d(?:\s*(?:\(\s*)?[+-][0-2](?:\s*\))?)?$/.test(value.trim()));
const Share = z.union([FlightNumber, z.object({
  AirlineID: Airline.nullable().optional(), FlightNumber: FlightNumber.nullable(),
}).strict()]);
const PublicRow = z.object({
  AirlineID: Airline, FlightNumber,
  DepartureAirportID: Airport, ArrivalAirportID: Airport,
  ScheduleStartDate: DateValue, ScheduleEndDate: DateValue,
  DepartureTime: Clock.nullable(), ArrivalTime: Clock.nullable(),
  Monday: z.boolean(), Tuesday: z.boolean(), Wednesday: z.boolean(), Thursday: z.boolean(),
  Friday: z.boolean(), Saturday: z.boolean(), Sunday: z.boolean(),
  CodeShare: z.array(Share).max(200).nullish(), UpdateTime: z.string().datetime({ offset: true }),
  IsCargo: z.boolean().nullish(), IsCargoFlight: z.boolean().nullish(),
  IsCodeShare: z.boolean().nullish(), IsWetlease: z.boolean().nullish(),
  ServiceType: z.string().regex(/^[A-Z]$/).nullable().optional(),
}).strict();

export const TdxReplaySnapshotSchema = z.object({
  from: Airport, to: Airport, fetchedAt: z.string().datetime(),
  receivedRows: z.number().int().min(0).max(2500),
  capturedRows: z.number().int().min(0).max(2500),
  redactedRows: z.number().int().min(0).max(2500),
  // Null preserves an unsafe/rejected row's position/count without its text.
  rows: z.array(PublicRow.nullable()).max(2500),
}).strict().superRefine((value, ctx) => {
  const captured = value.rows.filter((row) => row !== null).length;
  if (value.from === value.to || value.receivedRows !== value.rows.length
    || value.capturedRows !== captured || value.redactedRows !== value.rows.length - captured) {
    ctx.addIssue({ code: 'custom', message: 'Invalid public snapshot counts or route' });
  }
});
export type TdxReplaySnapshot = z.infer<typeof TdxReplaySnapshotSchema>;

export const TdxReplayBundleSchema = z.object({
  snapshotVersion: z.literal(1), purpose: z.literal('offline-normalizer-regression'),
  capturedWithNormalizer: z.string().max(80).regex(/^\d+-[a-z0-9-]+$/),
  capturedAt: z.string().datetime(), queryStart: DateValue,
  snapshots: z.array(TdxReplaySnapshotSchema).min(1).max(3),
}).strict().superRefine((value, ctx) => {
  const pairs = value.snapshots.map((snapshot) => `${snapshot.from}:${snapshot.to}`);
  if (new Set(pairs).size !== pairs.length
    || value.snapshots.some((snapshot) => Date.parse(snapshot.fetchedAt) > Date.parse(value.capturedAt))) {
    ctx.addIssue({ code: 'custom', message: 'Duplicate route or inconsistent capture timestamp' });
  }
});

function fields(value: object, keys: string[]): Record<string, unknown> {
  const source = value as Record<string, unknown>;
  return Object.fromEntries(keys.filter((key) => Object.hasOwn(source, key)).map((key) => [key, source[key]]));
}

/** Unknown keys are not persisted, even inside CodeShare. If a known field
 * contains arbitrary/unsupported text, redact the WHOLE row rather than omit
 * a flag and accidentally promote a cargo/marketing record. Such a snapshot
 * is explicitly incomplete for replay; callers must not claim live parity. */
export function captureTdxReplaySnapshot(raw: ReadonlyArray<unknown>, from: string, to: string, fetchedAt: number): TdxReplaySnapshot {
  if (raw.length > 2500) throw new Error('Public snapshot exceeds row limit');
  const rows = raw.map((value) => {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;
    const selected = fields(value, Object.keys(PublicRow.shape));
    if (Array.isArray(selected.CodeShare)) {
      selected.CodeShare = selected.CodeShare.map((share: unknown) =>
        typeof share === 'object' && share !== null && !Array.isArray(share)
          ? fields(share, ['AirlineID', 'FlightNumber']) : share);
    }
    const parsed = PublicRow.safeParse(selected);
    return parsed.success ? parsed.data : null;
  });
  const capturedRows = rows.filter((row) => row !== null).length;
  return TdxReplaySnapshotSchema.parse({
    from, to, fetchedAt: new Date(fetchedAt).toISOString(), receivedRows: raw.length,
    capturedRows, redactedRows: raw.length - capturedRows, rows,
  });
}
