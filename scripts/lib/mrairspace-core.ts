/**
 * Pure transform core for the MrAirspace ingestion pipeline.
 *
 * `scripts/ingest-mrairspace.ts` owns the I/O (GitHub release metadata,
 * the ~870MB parquet download, duckdb extraction). Everything that decides
 * WHAT ends up in the candidate file lives here, as a pure function, so it
 * can be tested offline without a parquet file, duckdb, or a network.
 *
 * MrAirspace parquet columns consumed (18 total; 6 matter here):
 *   Airline                          ICAO airline code (empty for GA)
 *   Callsign                         operating callsign, e.g. "BR008"
 *   Track_Origin_DateTime_UTC        approximate takeoff time
 *   Track_Destination_DateTime_UTC   approximate landing time
 *   Track_Origin_ApplicableAirports  ICAO code(s) within ~9km of the origin
 *   Track_Destination_ApplicableAirports  same, destination side
 *
 * Two traps the pipeline must not fall into, per the source's own docs:
 *   - Quarter files OVERLAP, so `drop_duplicates()` is forbidden. A row
 *     belongs to the quarter only if its origin datetime falls inside that
 *     quarter's months.
 *   - `ApplicableAirports` may list more than one airport (the two nearest
 *     commercial fields); the upstream value is kept as-is and only the
 *     first resolvable IATA code is used as the route endpoint.
 */

export interface MrAirspaceRow {
  readonly Airline?: unknown;
  readonly Callsign?: unknown;
  readonly Track_Origin_DateTime_UTC?: unknown;
  readonly Track_Destination_DateTime_UTC?: unknown;
  readonly Track_Origin_ApplicableAirports?: unknown;
  readonly Track_Destination_ApplicableAirports?: unknown;
  /** When the source's own enroute callsign validation rejected the row,
   * this column is falsy — the row is excluded from designator evidence. */
  readonly Route_Validation_Based_on_Callsign?: unknown;
}

export interface CandidateEntry {
  readonly airline_iata: string;
  readonly origin: string;
  readonly destination: string;
  readonly firstSeenUtc: string;
  readonly lastSeenUtc: string;
  readonly observationCount: number;
  readonly flightNumbers: readonly string[];
  readonly quarters: readonly string[];
}

export interface IngestOptions {
  /** e.g. "2026-Q2" — the quarter whose months the rows must fall inside. */
  readonly quarter: string;
  /** ICAO airline code → IATA airline code (from public/data/airlines.json). */
  readonly airlineIcaoToIata: ReadonlyMap<string, string>;
  /** ICAO airport code → IATA airport code (from public/data/airports.json). */
  readonly airportIcaoToIata: ReadonlyMap<string, string>;
  /** A row's origin date must start with one of these (YYYY-MM). */
  readonly quarterMonths: readonly string[];
}

const QUARTER_MONTHS: Readonly<Record<string, readonly string[]>> = {
  Q1: ['01', '02', '03'],
  Q2: ['04', '05', '06'],
  Q3: ['07', '08', '09'],
  Q4: ['10', '11', '12'],
};

/** "2026-Q2" → ["2026-04", "2026-05", "2026-06"]; null when malformed. */
export function quarterMonths(quarter: string): string[] | null {
  const match = /^(\d{4})-Q([1-4])$/.exec(quarter);
  if (!match) return null;
  const year = match[1]!;
  const months = QUARTER_MONTHS[`Q${match[2]!}`]!;
  return months.map((month) => `${year}-${month}`);
}

function firstHttpField(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 && trimmed !== '-' ? trimmed : null;
}

/** Split an ApplicableAirports cell into candidate ICAO codes. */
function parseAirportCell(value: unknown): string[] {
  const text = firstHttpField(value);
  if (!text) return [];
  return text
    .split(/[,;/|\s]+/)
    .map((code) => code.trim().toUpperCase())
    .filter((code) => /^[A-Z0-9]{4}$/.test(code));
}

/** UTC timestamp → { date: "YYYY-MM-DD", month: "YYYY-MM" }; null when unusable. */
function parseUtc(value: unknown): { date: string; month: string } | null {
  const text = firstHttpField(value);
  if (!text) return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(text);
  if (!match) return null;
  return {
    date: `${match[1]}-${match[2]}-${match[3]}`,
    month: `${match[1]}-${match[2]}`,
  };
}

/**
 * Derive an IATA-style candidate designator from a callsign.
 *
 * MrAirspace callsigns use the airline's ICAO prefix (`EVA008` for EVA Air
 * flight 008). The numeric suffix is converted to the same shape as an IATA
 * flight number (`BR8`) only when the airline's declared ICAO code actually
 * prefixes the callsign — no prefix guessing, and rows whose enroute
 * callsign validation failed contribute no designator at all.
 */
export function designatorFromCallsign(
  airlineIcao: string,
  callsign: string,
  carrierIata: string,
): string | null {
  const upper = callsign.trim().toUpperCase();
  if (!upper.startsWith(airlineIcao.toUpperCase())) return null;
  const suffix = upper.slice(airlineIcao.length);
  if (!/^\d{1,4}[A-Z]?$/.test(suffix)) return null;
  return `${carrierIata}${suffix.replace(/^0+(?=\d)/, '')}`;
}

interface Accumulator {
  from: string;
  to: string;
  first: string;
  last: string;
  count: number;
  numbers: Set<string>;
}

/**
 * Filter and normalize extracted MrAirspace rows into candidate entries.
 *
 * Deterministic: entries are sorted by (carrier, origin, destination) so
 * re-running against the same input yields byte-identical output.
 */
export function buildCandidateEntries(
  rows: readonly MrAirspaceRow[],
  options: IngestOptions,
): CandidateEntry[] {
  const months = new Set(options.quarterMonths);
  const byRoute = new Map<string, Accumulator>();

  for (const row of rows) {
    const airlineIcao = firstHttpField(row.Airline);
    if (!airlineIcao) continue; // general aviation / unattributed
    const carrierIata = options.airlineIcaoToIata.get(airlineIcao.toUpperCase());
    if (!carrierIata) continue;

    // Quarter membership is decided by the ORIGIN timestamp; overlapping
    // quarter files must not contribute the same observation twice.
    const originTime = parseUtc(row.Track_Origin_DateTime_UTC);
    if (!originTime || !months.has(originTime.month)) continue;

    const origins = parseAirportCell(row.Track_Origin_ApplicableAirports);
    const destinations = parseAirportCell(row.Track_Destination_ApplicableAirports);
    const origin = origins
      .map((code) => options.airportIcaoToIata.get(code))
      .find((iata): iata is string => typeof iata === 'string');
    const destination = destinations
      .map((code) => options.airportIcaoToIata.get(code))
      .find((iata): iata is string => typeof iata === 'string');
    if (!origin || !destination || origin === destination) continue;

    const key = `${carrierIata}|${origin}|${destination}`;
    const existing = byRoute.get(key);
    // first/last seen are ORIGIN-based, matching the quarter-membership
    // rule: mixing in the destination date would let a 06-30 23:00 flight
    // report a 07-01 "last seen" and imply Q3 membership.
    const accumulator: Accumulator = existing ?? {
      from: origin,
      to: destination,
      first: originTime.date,
      last: originTime.date,
      count: 0,
      numbers: new Set<string>(),
    };
    accumulator.count += 1;
    if (originTime.date < accumulator.first) accumulator.first = originTime.date;
    if (originTime.date > accumulator.last) accumulator.last = originTime.date;

    const validated = firstHttpField(row.Route_Validation_Based_on_Callsign);
    const callsign = firstHttpField(row.Callsign);
    if (validated && callsign) {
      const designator = designatorFromCallsign(airlineIcao, callsign, carrierIata);
      if (designator) accumulator.numbers.add(designator);
    }
    byRoute.set(key, accumulator);
  }

  return [...byRoute.entries()]
    .map(([key, accumulator]) => {
      const carrierIata = key.slice(0, key.indexOf('|'));
      return {
        airline_iata: carrierIata,
        origin: accumulator.from,
        destination: accumulator.to,
        firstSeenUtc: `${accumulator.first}T00:00:00Z`,
        lastSeenUtc: `${accumulator.last}T23:59:59Z`,
        observationCount: accumulator.count,
        flightNumbers: [...accumulator.numbers].sort(),
        quarters: [options.quarter],
      };
    })
    .filter((entry) => entry.observationCount >= 2)
    .sort((a, b) => {
      if (a.airline_iata !== b.airline_iata) return a.airline_iata < b.airline_iata ? -1 : 1;
      if (a.origin !== b.origin) return a.origin < b.origin ? -1 : 1;
      if (a.destination !== b.destination) return a.destination < b.destination ? -1 : 1;
      return 0;
    });
}
