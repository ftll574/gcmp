import { createReadStream, existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createInterface } from 'node:readline';
import airportsRaw from '../public/data/airports.json' with { type: 'json' };
import { mergeRouteNetworkCatalogs } from '../src/lib/rtw/route-network-merge.ts';
import {
  RouteNetworkCatalogSchema,
  parseRouteNetworkCatalog,
  type RouteNetworkCatalog,
  type RouteNetworkEntry,
  type RouteNetworkSource,
} from '../src/lib/schemas/route-network.ts';
import { activeAllianceAirlineCodes } from './lib/alliance-airline-icao.ts';
import { allianceAffiliateOperators } from './lib/alliance-affiliate-operators.ts';

const BASE_INPUTS = [
  'current.json',
  'recent-current.json',
  'observed-current.json',
  'affiliate-current.json',
  'bts-marketing-current.json',
  'standing-current.json',
] as const;
const BTS_TARGETS = new Set(['AA', 'AS', 'DL', 'UA']);
const DEFAULT_WORK_ROOT = 'E:/workspace/.gcmp-route-work';
const DEFAULT_OUTPUT = 'public/data/route-network/flight-numbers-current.json';
const CHECKED_ON = '2026-09-09';
const RECENT_SOURCE_ID = 'flight-numbers-adsbiq-recent-20260908';
const STANDING_SOURCE_ID = 'flight-numbers-vrs-standing-20260907';
const AFFILIATE_STANDING_SOURCE_ID = 'flight-numbers-vrs-affiliate-standing-20260907';
const BTS_SOURCE_ID = 'flight-numbers-bts-marketing-202606';
const FLIGHTSFROM_SNAPSHOT = 'public/data/route-network/flightsfrom-flight-numbers-20260909.json';
const CORRECTIONS_INPUT = 'public/data/route-network/current-corrections.json';

interface FlightsFromSnapshot {
  version: 1;
  checkedOn: string;
  source: string;
  note: string;
  entries: Array<{
    strength: 'confirmed' | 'candidate';
    carrier: string;
    from: string;
    to: string;
    flightNumbers: string[];
  }>;
}

const AUDITED_CURRENT_REFERENCES = [
  {
    carrier: 'TK', from: 'LED', to: 'DLM',
    flightNumbers: ['TK3069', 'TK3075', 'TK3089'],
    sourceId: 'airportia-led-dlm-20260909',
    sourceUrl: 'https://www.airportia.com/route/st-petersburg-dalaman-flights-led-dlm/',
    note: 'Recent St. Petersburg→Dalaman Turkish Airlines flight history checked 2026-09-09. TK3069 was last seen 2026-09-03, TK3075 on 2026-09-02 and TK3089 on 2026-08-05. Kept as candidate designators only; this does not assert a future operating date.',
  },
] as const;

interface FlightAccumulator {
  confirmed: Set<string>;
  candidates: Set<string>;
  confirmedSourceIds: Set<string>;
  candidateSourceIds: Set<string>;
}

interface FlightConnectionsCache {
  checkedOn: string;
  from: string;
  to: string;
  sourceUrl: string;
  status: number;
  flightNumbers: string[];
}

interface FlightInformationCache {
  checkedOn: string;
  from: string;
  to: string;
  sourceUrl: string;
  status: number;
  flightNumbers: string[];
}

function argValue(name: string): string | undefined {
  const prefix = `--${name}=`;
  return process.argv.find((arg) => arg.startsWith(prefix))?.slice(prefix.length);
}

function routeKey(carrier: string, from: string, to: string): string {
  return `${carrier}:${from}-${to}`;
}

function fullDesignator(carrier: string, suffix: string): string | null {
  const normalizedCarrier = carrier.trim().toUpperCase();
  const normalizedSuffix = suffix.trim().toUpperCase().replace(/\s+/g, '');
  return /^\d{1,4}[A-Z]?$/.test(normalizedSuffix) ? `${normalizedCarrier}${normalizedSuffix}` : null;
}

function accumulator(map: Map<string, FlightAccumulator>, key: string): FlightAccumulator {
  let value = map.get(key);
  if (!value) {
    value = {
      confirmed: new Set(), candidates: new Set(),
      confirmedSourceIds: new Set(), candidateSourceIds: new Set(),
    };
    map.set(key, value);
  }
  return value;
}

function addConfirmed(
  map: Map<string, FlightAccumulator>, key: string, designator: string, sourceId: string,
): void {
  const value = accumulator(map, key);
  value.confirmed.add(designator);
  value.candidates.delete(designator);
  value.confirmedSourceIds.add(sourceId);
}

function addCandidate(
  map: Map<string, FlightAccumulator>, key: string, designator: string, sourceId: string,
): void {
  const value = accumulator(map, key);
  if (!value.confirmed.has(designator)) value.candidates.add(designator);
  value.candidateSourceIds.add(sourceId);
}

function parseCsvLine(line: string): string[] {
  const fields: string[] = [];
  let field = '';
  let quoted = false;
  for (let index = 0; index < line.length; index++) {
    const char = line[index]!;
    if (quoted) {
      if (char === '"') {
        if (line[index + 1] === '"') { field += '"'; index++; }
        else quoted = false;
      } else field += char;
    } else if (char === '"') quoted = true;
    else if (char === ',') { fields.push(field); field = ''; }
    else field += char;
  }
  if (quoted) throw new Error('Unterminated CSV quote');
  fields.push(field.replace(/\r$/, ''));
  return fields;
}

function standingFiles(workRoot: string, icao: string): string[] {
  const dir = resolve(workRoot, 'standing-data/routes/schema-01', icao[0]!);
  if (!existsSync(dir)) return [];
  const all = resolve(dir, `${icao}-all.csv`);
  if (existsSync(all)) return [all];
  return readdirSync(dir)
    .filter((name) => name.startsWith(`${icao}-`) && name.endsWith('.csv'))
    .map((name) => resolve(dir, name));
}

function parseStandingRows(
  workRoot: string,
  publishedRoutes: ReadonlyMap<string, RouteNetworkEntry>,
  accumulators: Map<string, FlightAccumulator>,
): { rows: number; invalidNumbers: number; recentRows: number } {
  const snapshot = JSON.parse(readFileSync(resolve(workRoot, 'adsbiq-alliance-callsigns-20260801-0906.json'), 'utf8')) as { callsigns: string[] };
  const observedCallsigns = new Set(snapshot.callsigns.map((value) => value.trim().toUpperCase()));
  const airportsByIcao = new Map(
    airportsRaw.flatMap((airport) => airport.icao ? [[airport.icao, airport.iata] as const] : []),
  );
  let rows = 0;
  let invalidNumbers = 0;
  let recentRows = 0;
  for (const { iata, icao } of activeAllianceAirlineCodes()) {
    for (const path of standingFiles(workRoot, icao)) {
      const lines = readFileSync(path, 'utf8').replace(/^\uFEFF/, '').split(/\r?\n/);
      const header = (lines.shift() ?? '').split(',');
      const callsignIndex = header.indexOf('Callsign');
      const numberIndex = header.indexOf('Number');
      const airportsIndex = header.indexOf('AirportCodes');
      if ([callsignIndex, numberIndex, airportsIndex].some((index) => index < 0)) {
        throw new Error(`Required VRS columns missing: ${path}`);
      }
      for (const line of lines) {
        if (!line) continue;
        const fields = line.split(',');
        const callsign = fields[callsignIndex]?.trim().toUpperCase();
        const number = fields[numberIndex]?.trim().toUpperCase();
        if (!callsign || !number) continue;
        const designator = fullDesignator(iata, number);
        if (!designator) { invalidNumbers++; continue; }
        rows++;
        const airportPath = (fields[airportsIndex] ?? '').split('-').filter(Boolean);
        for (let index = 0; index + 1 < airportPath.length; index++) {
          const from = airportsByIcao.get(airportPath[index]!);
          const to = airportsByIcao.get(airportPath[index + 1]!);
          if (!from || !to) continue;
          const key = routeKey(iata, from, to);
          const runtimeRoute = publishedRoutes.get(key);
          if (!runtimeRoute) continue;
          addCandidate(accumulators, key, designator, STANDING_SOURCE_ID);
          if (observedCallsigns.has(callsign) && runtimeRoute.carrierIdentity !== 'provider-listed') {
            addConfirmed(accumulators, key, designator, RECENT_SOURCE_ID);
            recentRows++;
          }
        }
      }
    }
  }
  return { rows, invalidNumbers, recentRows };
}

function affiliateRelationshipSourceId(brand: string, operatorIcao: string): string {
  return `flight-numbers-affiliate-${brand.toLowerCase()}-${operatorIcao.toLowerCase()}`;
}

function parseAffiliateStandingRows(
  workRoot: string,
  publishedRoutes: ReadonlyMap<string, RouteNetworkEntry>,
  accumulators: Map<string, FlightAccumulator>,
  sources: Map<string, RouteNetworkSource>,
): { rows: number; invalidNumbers: number; matchedRoutes: number } {
  const airportsByIcao = new Map(
    airportsRaw.flatMap((airport) => airport.icao ? [[airport.icao, airport.iata] as const] : []),
  );
  const matchedRoutes = new Set<string>();
  let rows = 0;
  let invalidNumbers = 0;

  sources.set(AFFILIATE_STANDING_SOURCE_ID, {
    id: AFFILIATE_STANDING_SOURCE_ID,
    url: 'https://github.com/vradarserver/standing-data/commit/3c4afbf23a9933c00bcd8db514b4af21ae86e4a2',
    checkedOn: '2026-09-07',
    note: 'CC0 VRS standing flight-number suffixes for documented regional/affiliate operators. The suffix is mapped to the parent member-airline brand only as a candidate designator; it never upgrades the parent airline to operating-carrier evidence.',
  });

  for (const mapping of allianceAffiliateOperators) {
    const relationshipId = affiliateRelationshipSourceId(mapping.brand, mapping.operatorIcao);
    sources.set(relationshipId, {
      id: relationshipId,
      url: mapping.sourceUrl,
      checkedOn: '2026-09-08',
      note: `${mapping.operatorName}: ${mapping.sourceNote} Used only to justify mapping the affiliate's numeric flight identity to a ${mapping.brand} candidate designator; actual operating identity remains the affiliate until independently resolved.`,
    });
    const routeRelationshipId = `affiliate-${mapping.brand.toLowerCase()}-${mapping.operatorIcao.toLowerCase()}`;
    for (const path of standingFiles(workRoot, mapping.operatorIcao)) {
      const lines = readFileSync(path, 'utf8').replace(/^\uFEFF/, '').split(/\r?\n/);
      const header = parseCsvLine(lines.shift() ?? '');
      const numberIndex = header.indexOf('Number');
      const airportsIndex = header.indexOf('AirportCodes');
      if ([numberIndex, airportsIndex].some((index) => index < 0)) {
        throw new Error(`Required affiliate VRS columns missing: ${path}`);
      }
      for (const line of lines) {
        if (!line) continue;
        const fields = parseCsvLine(line);
        const number = fields[numberIndex]?.trim().toUpperCase();
        if (!number) continue;
        const designator = fullDesignator(mapping.brand, number);
        if (!designator) { invalidNumbers++; continue; }
        rows++;
        const airportPath = (fields[airportsIndex] ?? '').trim().toUpperCase().split('-').filter(Boolean);
        for (let index = 0; index + 1 < airportPath.length; index++) {
          const from = airportsByIcao.get(airportPath[index]!);
          const to = airportsByIcao.get(airportPath[index + 1]!);
          if (!from || !to) continue;
          const key = routeKey(mapping.brand, from, to);
          const runtimeRoute = publishedRoutes.get(key);
          if (!runtimeRoute || !runtimeRoute.sourceIds.includes(routeRelationshipId)) continue;
          addCandidate(accumulators, key, designator, AFFILIATE_STANDING_SOURCE_ID);
          addCandidate(accumulators, key, designator, relationshipId);
          matchedRoutes.add(key);
        }
      }
    }
  }
  return { rows, invalidNumbers, matchedRoutes: matchedRoutes.size };
}

async function parseBtsRows(
  workRoot: string,
  publishedRoutes: ReadonlyMap<string, RouteNetworkEntry>,
  accumulators: Map<string, FlightAccumulator>,
): Promise<number> {
  const path = resolve(
    workRoot,
    'bts/marketing-2026-06/On_Time_Marketing_Carrier_On_Time_Performance_(Beginning_January_2018)_2026_6.csv',
  );
  const lines = createInterface({ input: createReadStream(path, { encoding: 'utf8' }), crlfDelay: Infinity });
  let header: string[] | null = null;
  let marketingIndex = -1;
  let originIndex = -1;
  let destinationIndex = -1;
  let flightNumberIndex = -1;
  let matched = 0;
  for await (const line of lines) {
    const fields = parseCsvLine(line);
    if (!header) {
      header = fields;
      marketingIndex = header.indexOf('IATA_Code_Marketing_Airline');
      originIndex = header.indexOf('Origin');
      destinationIndex = header.indexOf('Dest');
      flightNumberIndex = header.indexOf('Flight_Number_Marketing_Airline');
      if ([marketingIndex, originIndex, destinationIndex, flightNumberIndex].some((index) => index < 0)) {
        throw new Error('Required BTS flight-number columns missing');
      }
      continue;
    }
    const carrier = fields[marketingIndex]?.trim().toUpperCase();
    if (!carrier || !BTS_TARGETS.has(carrier)) continue;
    const from = fields[originIndex]?.trim().toUpperCase();
    const to = fields[destinationIndex]?.trim().toUpperCase();
    const suffix = fields[flightNumberIndex]?.trim().toUpperCase();
    if (!from || !to || !suffix) continue;
    const key = routeKey(carrier, from, to);
    if (!publishedRoutes.has(key)) continue;
    const designator = fullDesignator(carrier, suffix);
    if (!designator) continue;
    addCandidate(accumulators, key, designator, BTS_SOURCE_ID);
    matched++;
  }
  return matched;
}

function parseFlightsFromSnapshot(
  publishedRoutes: ReadonlyMap<string, RouteNetworkEntry>,
  accumulators: Map<string, FlightAccumulator>,
  sources: Map<string, RouteNetworkSource>,
): { confirmedRoutes: number; candidateRoutes: number } {
  const snapshot = JSON.parse(readFileSync(FLIGHTSFROM_SNAPSHOT, 'utf8')) as FlightsFromSnapshot;
  if (snapshot.version !== 1 || snapshot.checkedOn !== CHECKED_ON || snapshot.source !== 'https://www.flightsfrom.com/') {
    throw new Error('Unexpected FlightsFrom flight-number snapshot metadata');
  }
  const seen = new Set<string>();
  let confirmedRoutes = 0;
  let candidateRoutes = 0;
  for (const entry of snapshot.entries) {
    const key = routeKey(entry.carrier, entry.from, entry.to);
    if (seen.has(key)) throw new Error(`Duplicate FlightsFrom route ${key}`);
    seen.add(key);
    const route = publishedRoutes.get(key);
    if (!route) throw new Error(`FlightsFrom snapshot references non-published route ${key}`);
    if (entry.strength === 'confirmed' && route.carrierIdentity === 'provider-listed') {
      throw new Error(`FlightsFrom cannot promote provider-listed route ${key}`);
    }
    const sourceId = `flightsfrom-${entry.from.toLowerCase()}-${entry.to.toLowerCase()}-${CHECKED_ON.replaceAll('-', '')}`;
    if (!sources.has(sourceId)) {
      sources.set(sourceId, {
        id: sourceId,
        url: `https://www.flightsfrom.com/${entry.from}-${entry.to}`,
        checkedOn: CHECKED_ON,
        note: entry.strength === 'confirmed'
          ? 'FlightsFrom current direct-route schedule page lists this same-carrier commercial designator. GCMP already had independent operating-carrier evidence for the route, so the designator is selectable; this source alone does not establish operating identity, weekday, time, or award availability.'
          : 'FlightsFrom current direct-route schedule page lists this same-brand commercial designator. The route remains provider-listed, so the designator is a candidate until date/operator verification succeeds.',
      });
    }
    const normalized = entry.flightNumbers.map((number) => number.trim().toUpperCase());
    if (normalized.length === 0 || new Set(normalized).size !== normalized.length) {
      throw new Error(`Invalid FlightsFrom flight-number list for ${key}`);
    }
    for (const number of normalized) {
      if (!number.startsWith(entry.carrier) || !/^\d{1,4}[A-Z]?$/.test(number.slice(entry.carrier.length))) {
        throw new Error(`Invalid FlightsFrom designator ${number} for ${key}`);
      }
      if (entry.strength === 'confirmed') addConfirmed(accumulators, key, number, sourceId);
      else addCandidate(accumulators, key, number, sourceId);
    }
    if (entry.strength === 'confirmed') confirmedRoutes++;
    else candidateRoutes++;
  }
  return { confirmedRoutes, candidateRoutes };
}

function existingFlightNumberKeys(): Set<string> {
  const result = new Set<string>();
  const schedulesRaw = JSON.parse(readFileSync('public/data/schedules/current.json', 'utf8')) as {
    entries: Array<{ carrier: string; pair: [string, string]; flightNumbers?: string[] }>;
  };
  for (const row of schedulesRaw.entries) {
    if ((row.flightNumbers?.length ?? 0) > 0) result.add(routeKey(row.carrier, row.pair[0], row.pair[1]));
  }
  const official = JSON.parse(readFileSync('public/data/official-schedules.json', 'utf8')) as {
    services: Array<{ carrier: string; from: string; to: string }>;
    flightNumberReferences: Array<{ carrier: string; from: string; to: string; flightNumbers: string[] }>;
  };
  for (const row of official.services) result.add(routeKey(row.carrier, row.from, row.to));
  for (const row of official.flightNumberReferences) {
    if (row.flightNumbers.length > 0) result.add(routeKey(row.carrier, row.from, row.to));
  }
  return result;
}

function parseFlightConnectionsNumbers(html: string): string[] {
  const numbers = new Set<string>();
  const pattern = /<li[^>]*flightno[^>]*>\s*<p>\s*([A-Z0-9]{2,3})\s+(\d{1,4}[A-Z]?)\s*<\/p>/gi;
  for (const match of html.matchAll(pattern)) {
    const carrier = match[1]!.toUpperCase();
    const suffix = match[2]!.toUpperCase();
    const designator = fullDesignator(carrier, suffix);
    if (designator) numbers.add(designator);
  }
  return [...numbers].sort();
}

async function sleep(ms: number): Promise<void> {
  await new Promise<void>((resolvePromise) => setTimeout(resolvePromise, ms));
}

async function fetchFlightConnectionsPage(url: string): Promise<{ status: number; html: string }> {
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      const response = await fetch(url, {
        headers: {
          'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/152.0.0.0 Safari/537.36',
          accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
          'accept-language': 'en-US,en;q=0.9',
        },
        signal: AbortSignal.timeout(25_000),
      });
      if (response.status === 200) return { status: response.status, html: await response.text() };
      if (response.status !== 202 && response.status !== 429 && response.status < 500) {
        return { status: response.status, html: '' };
      }
    } catch {
      // Retry bounded transient failures; unresolved routes remain explicit.
    }
    const backoff = [1_000, 1_800, 3_000, 5_000, 8_000][attempt] ?? 8_000;
    await sleep(backoff);
  }
  return { status: 0, html: '' };
}

async function loadFlightConnectionsPair(
  workRoot: string,
  from: string,
  to: string,
  allowFetch: boolean,
): Promise<{ cache: FlightConnectionsCache | null; fetched: boolean }> {
  const cacheRoot = resolve(workRoot, `flightconnections-flightnumbers-${CHECKED_ON.replaceAll('-', '')}`);
  mkdirSync(cacheRoot, { recursive: true });
  const cachePath = resolve(cacheRoot, `${from}-${to}.json`);
  if (existsSync(cachePath)) {
    const cached = JSON.parse(readFileSync(cachePath, 'utf8')) as FlightConnectionsCache;
    if (cached.status === 200 || !allowFetch) return { cache: cached, fetched: false };
  }
  if (!allowFetch) return { cache: null, fetched: false };
  const sourceUrl = `https://www.flightconnections.com/flights-from-${from.toLowerCase()}-to-${to.toLowerCase()}`;
  const result = await fetchFlightConnectionsPage(sourceUrl);
  const cache: FlightConnectionsCache = {
    checkedOn: CHECKED_ON,
    from,
    to,
    sourceUrl,
    status: result.status,
    flightNumbers: result.status === 200 ? parseFlightConnectionsNumbers(result.html) : [],
  };
  writeFileSync(cachePath, `${JSON.stringify(cache, null, 2)}\n`);
  return { cache, fetched: true };
}

async function enrichFlightConnections(
  workRoot: string,
  allowFetch: boolean,
  publishedRoutes: ReadonlyMap<string, RouteNetworkEntry>,
  accumulators: Map<string, FlightAccumulator>,
  existingKeys: ReadonlySet<string>,
  sources: Map<string, RouteNetworkSource>,
): Promise<{ fetched: number; cacheHits: number; failedPairs: number }> {
  const missingRoutes = [...publishedRoutes.entries()]
    .filter(([key]) => {
      const value = accumulators.get(key);
      return !existingKeys.has(key) && !value?.confirmed.size && !value?.candidates.size;
    });
  const pairRoutes = new Map<string, Array<[string, RouteNetworkEntry]>>();
  for (const [key, route] of missingRoutes) {
    const pairKey = `${route.pair[0]}-${route.pair[1]}`;
    const rows = pairRoutes.get(pairKey) ?? [];
    rows.push([key, route]);
    pairRoutes.set(pairKey, rows);
  }
  const queue = [...pairRoutes.entries()];
  let cursor = 0;
  let fetched = 0;
  let cacheHits = 0;
  let failedPairs = 0;
  async function worker(): Promise<void> {
    while (cursor < queue.length) {
      const index = cursor++;
      const [pairKey, routes] = queue[index]!;
      const [from, to] = pairKey.split('-') as [string, string];
      const result = await loadFlightConnectionsPair(workRoot, from, to, allowFetch);
      if (!result.cache) continue;
      if (result.fetched) fetched++; else cacheHits++;
      if (result.cache.status !== 200) { failedPairs++; continue; }
      let used = false;
      for (const [key, route] of routes) {
        const numbers = result.cache.flightNumbers.filter((number) =>
          number.startsWith(route.carrier) && /^\d{1,4}[A-Z]?$/.test(number.slice(route.carrier.length)),
        );
        if (numbers.length === 0) continue;
        const sourceId = `flightconnections-${from.toLowerCase()}-${to.toLowerCase()}-${CHECKED_ON.replaceAll('-', '')}`;
        for (const number of numbers) addCandidate(accumulators, key, number, sourceId);
        if (!sources.has(sourceId)) {
          sources.set(sourceId, {
            id: sourceId,
            url: result.cache.sourceUrl,
            checkedOn: CHECKED_ON,
            note: 'FlightConnections public nonstop route schedule page flight-number reference. Used as a candidate designator only; date and operating identity still require stronger evidence before itinerary persistence.',
          });
        }
        used = true;
      }
      if (!used) failedPairs++;
      if (result.fetched) await sleep(650);
    }
  }
  await Promise.all(Array.from({ length: 2 }, () => worker()));
  return { fetched, cacheHits, failedPairs };
}

function parseFlightInformationNumbers(html: string, from: string, to: string): string[] {
  const numbers = new Set<string>();
  const pattern = new RegExp(`\\b([A-Z0-9]{2,3}\\d{1,4}[A-Z]?)-${from}-${to}\\b`, 'g');
  for (const match of html.matchAll(pattern)) {
    const designator = match[1]!.toUpperCase();
    if (/^[A-Z0-9]{2,3}\d{1,4}[A-Z]?$/.test(designator)) numbers.add(designator);
  }
  return [...numbers].sort();
}

function flightInformationSourceId(from: string, to: string): string {
  return `flightinformation-${from.toLowerCase()}-${to.toLowerCase()}-${CHECKED_ON.replaceAll('-', '')}`;
}

function ensureFlightInformationSource(
  sources: Map<string, RouteNetworkSource>,
  from: string,
  to: string,
  sourceUrl: string,
): string {
  const sourceId = flightInformationSourceId(from, to);
  if (!sources.has(sourceId)) {
    sources.set(sourceId, {
      id: sourceId,
      url: sourceUrl,
      checkedOn: CHECKED_ON,
      note: 'Flightinformation.com current direct-route timetable check. Same-carrier designators become candidate flight numbers; when a previously sourced route has no same-carrier designator in this current check and no other number evidence, GCMP keeps the relationship as flight-identity unresolved instead of presenting it as a current plannable route.',
    });
  }
  return sourceId;
}

async function loadFlightInformationPair(
  workRoot: string,
  from: string,
  to: string,
  allowFetch: boolean,
): Promise<{ cache: FlightInformationCache | null; fetched: boolean }> {
  const cacheRoot = resolve(workRoot, `flightinformation-flightnumbers-${CHECKED_ON.replaceAll('-', '')}`);
  mkdirSync(cacheRoot, { recursive: true });
  const cachePath = resolve(cacheRoot, `${from}-${to}.json`);
  if (existsSync(cachePath)) {
    return { cache: JSON.parse(readFileSync(cachePath, 'utf8')) as FlightInformationCache, fetched: false };
  }
  if (!allowFetch) return { cache: null, fetched: false };
  const sourceUrl = `https://www.flightinformation.com/${from}-${to}`;
  let status = 0;
  let html = '';
  try {
    const response = await fetch(sourceUrl, {
      headers: { 'user-agent': 'Mozilla/5.0' },
      signal: AbortSignal.timeout(25_000),
    });
    status = response.status;
    if (response.ok) html = await response.text();
  } catch {
    // Keep the default status=0 so the cache records a transport failure.
  }
  const cache: FlightInformationCache = {
    checkedOn: CHECKED_ON,
    from,
    to,
    sourceUrl,
    status,
    flightNumbers: status === 200 ? parseFlightInformationNumbers(html, from, to) : [],
  };
  writeFileSync(cachePath, `${JSON.stringify(cache, null, 2)}\n`);
  return { cache, fetched: true };
}

async function enrichFlightInformation(
  workRoot: string,
  allowFetch: boolean,
  publishedRoutes: ReadonlyMap<string, RouteNetworkEntry>,
  accumulators: Map<string, FlightAccumulator>,
  existingKeys: ReadonlySet<string>,
  sources: Map<string, RouteNetworkSource>,
): Promise<{ fetched: number; cacheHits: number; matchedRoutes: number; unresolvedPairs: number }> {
  const missingRoutes = [...publishedRoutes.entries()].filter(([key]) => {
    const value = accumulators.get(key);
    return !existingKeys.has(key) && !value?.confirmed.size && !value?.candidates.size;
  });
  const pairRoutes = new Map<string, Array<[string, RouteNetworkEntry]>>();
  for (const [key, route] of missingRoutes) {
    const pairKey = `${route.pair[0]}-${route.pair[1]}`;
    const rows = pairRoutes.get(pairKey) ?? [];
    rows.push([key, route]);
    pairRoutes.set(pairKey, rows);
  }
  const queue = [...pairRoutes.entries()];
  let cursor = 0;
  let fetched = 0;
  let cacheHits = 0;
  const matchedRouteKeys = new Set<string>();
  let unresolvedPairs = 0;
  async function worker(): Promise<void> {
    while (cursor < queue.length) {
      const index = cursor++;
      const [pairKey, routes] = queue[index]!;
      const [from, to] = pairKey.split('-') as [string, string];
      const result = await loadFlightInformationPair(workRoot, from, to, allowFetch);
      if (!result.cache) continue;
      if (result.fetched) fetched++; else cacheHits++;
      if (result.cache.status !== 200) { unresolvedPairs++; continue; }
      let used = false;
      for (const [key, route] of routes) {
        const numbers = result.cache.flightNumbers.filter((number) =>
          number.startsWith(route.carrier) && /^\d{1,4}[A-Z]?$/.test(number.slice(route.carrier.length)),
        );
        if (numbers.length === 0) continue;
        const sourceId = ensureFlightInformationSource(sources, from, to, result.cache.sourceUrl);
        for (const number of numbers) addCandidate(accumulators, key, number, sourceId);
        matchedRouteKeys.add(key);
        used = true;
      }
      if (!used) unresolvedPairs++;
      if (result.fetched) await sleep(80);
    }
  }
  await Promise.all(Array.from({ length: 8 }, () => worker()));
  return { fetched, cacheHits, matchedRoutes: matchedRouteKeys.size, unresolvedPairs };
}

function addAuditedCurrentReferences(
  publishedRoutes: ReadonlyMap<string, RouteNetworkEntry>,
  accumulators: Map<string, FlightAccumulator>,
  sources: Map<string, RouteNetworkSource>,
): number {
  let matched = 0;
  for (const reference of AUDITED_CURRENT_REFERENCES) {
    const key = routeKey(reference.carrier, reference.from, reference.to);
    if (!publishedRoutes.has(key)) continue;
    sources.set(reference.sourceId, {
      id: reference.sourceId,
      url: reference.sourceUrl,
      checkedOn: CHECKED_ON,
      note: reference.note,
    });
    for (const number of reference.flightNumbers) addCandidate(accumulators, key, number, reference.sourceId);
    matched++;
  }
  return matched;
}

function buildBaseRuntime(): RouteNetworkCatalog {
  const airportCodes = new Set(airportsRaw.map((airport) => airport.iata));
  const catalogs = BASE_INPUTS.map((file) =>
    parseRouteNetworkCatalog(
      JSON.parse(readFileSync(`public/data/route-network/${file}`, 'utf8')),
      airportCodes,
    ),
  );
  const base = catalogs.slice(1).reduce<RouteNetworkCatalog>(
    (network, layer) => mergeRouteNetworkCatalogs(network, layer),
    catalogs[0]!,
  );
  const corrections = parseRouteNetworkCatalog(
    JSON.parse(readFileSync(CORRECTIONS_INPUT, 'utf8')),
    airportCodes,
  );
  return mergeRouteNetworkCatalogs(corrections, base);
}

async function main(): Promise<void> {
  const workRoot = resolve(argValue('work-root') ?? DEFAULT_WORK_ROOT);
  const output = resolve(argValue('output') ?? DEFAULT_OUTPUT);
  const allowFetch = process.argv.includes('--fetch-flightconnections');
  const allowFlightInformationFetch = process.argv.includes('--fetch-flightinformation');
  if (!existsSync(workRoot)) throw new Error(`Research work root missing: ${workRoot}`);
  const runtime = buildBaseRuntime();
  const publishedRoutes = new Map(
    runtime.routes.filter((route) => route.status === 'published')
      .map((route) => [routeKey(route.carrier, route.pair[0], route.pair[1]), route] as const),
  );
  const accumulators = new Map<string, FlightAccumulator>();
  const sources = new Map<string, RouteNetworkSource>([
    [RECENT_SOURCE_ID, {
      id: RECENT_SOURCE_ID,
      url: 'https://github.com/Sky-Power-Services/adsbiq-data/releases',
      checkedOn: '2026-09-08',
      note: 'Recent exact ADSBiq callsign observation (2026-08-01 through 2026-09-06) joined to the VRS standing-data callsign route and valid commercial flight-number suffix. Only routes whose operating carrier was already confirmed elsewhere are promoted to selectable route-level flight numbers.',
    }],
    [STANDING_SOURCE_ID, {
      id: STANDING_SOURCE_ID,
      url: 'https://github.com/vradarserver/standing-data/commit/3c4afbf23a9933c00bcd8db514b4af21ae86e4a2',
      checkedOn: '2026-09-07',
      note: 'CC0 VRS standing callsign/route dictionary flight-number reference. Standing rows can outlive current service, so these numbers remain candidates unless independently observed and paired with already-confirmed operating-carrier evidence.',
    }],
    [BTS_SOURCE_ID, {
      id: BTS_SOURCE_ID,
      url: 'https://transtats.bts.gov/PREZIP/On_Time_Marketing_Carrier_On_Time_Performance_Beginning_January_2018_2026_6.zip',
      checkedOn: '2026-09-08',
      publishedOn: '2026-08-12',
      note: 'U.S. DOT BTS June 2026 marketing-carrier flight numbers for AA/AS/DL/UA route identities. Marketing designators are useful references but remain candidates because they can be codeshares or branded regional service.',
    }],
  ]);
  const standingSummary = parseStandingRows(workRoot, publishedRoutes, accumulators);
  const affiliateStandingSummary = parseAffiliateStandingRows(workRoot, publishedRoutes, accumulators, sources);
  const btsRows = await parseBtsRows(workRoot, publishedRoutes, accumulators);
  const flightsFrom = parseFlightsFromSnapshot(publishedRoutes, accumulators, sources);
  const existingKeys = existingFlightNumberKeys();
  for (const [key, route] of publishedRoutes) {
    if ((route.flightNumbers?.length ?? 0) > 0 || (route.flightNumberCandidates?.length ?? 0) > 0) existingKeys.add(key);
  }
  const auditedCurrentReferences = addAuditedCurrentReferences(publishedRoutes, accumulators, sources);
  const flightConnections = await enrichFlightConnections(
    workRoot, allowFetch, publishedRoutes, accumulators, existingKeys, sources,
  );
  const flightInformation = await enrichFlightInformation(
    workRoot, allowFlightInformationFetch, publishedRoutes, accumulators, existingKeys, sources,
  );

  const numberRoutes = [...publishedRoutes.entries()].flatMap(([key, route]) => {
    const value = accumulators.get(key);
    if (!value) return [];
    const confirmed = [...value.confirmed].sort();
    const confirmedSet = new Set(confirmed);
    const candidates = [...value.candidates].filter((number) => !confirmedSet.has(number)).sort();
    if (confirmed.length === 0 && candidates.length === 0) return [];
    const confirmedSourceIds = confirmed.length > 0 ? [...value.confirmedSourceIds].sort() : [];
    const candidateSourceIds = candidates.length > 0 ? [...value.candidateSourceIds].sort() : [];
    const sourceIds = [...new Set([...confirmedSourceIds, ...candidateSourceIds])];
    return [{
      carrier: route.carrier,
      pair: route.pair,
      service: 'nonstop' as const,
      status: 'published' as const,
      ...(confirmed.length > 0 ? { flightNumbers: confirmed, flightNumberSourceIds: confirmedSourceIds } : {}),
      ...(candidates.length > 0 ? {
        flightNumberCandidates: candidates,
        flightNumberCandidateSourceIds: candidateSourceIds,
      } : {}),
      sourceIds,
    }];
  });
  const routes = numberRoutes;
  const usedSourceIds = new Set(routes.flatMap((route) => [
    ...route.sourceIds,
    ...('flightNumberSourceIds' in route ? route.flightNumberSourceIds ?? [] : []),
    ...('flightNumberCandidateSourceIds' in route ? route.flightNumberCandidateSourceIds ?? [] : []),
  ]));
  const catalog = RouteNetworkCatalogSchema.parse({
    version: runtime.version,
    coverage: 'curated-not-complete',
    sources: [...sources.values()].filter((source) => usedSourceIds.has(source.id)).sort((a, b) => a.id.localeCompare(b.id)),
    carrierUniverses: [],
    routes: routes.sort((a, b) =>
      a.carrier.localeCompare(b.carrier)
      || a.pair[0].localeCompare(b.pair[0])
      || a.pair[1].localeCompare(b.pair[1])),
  });
  writeFileSync(output, `${JSON.stringify(catalog)}\n`);

  const anyLayerKeys = new Set(catalog.routes
    .filter((route) => (route.flightNumbers?.length ?? 0) > 0 || (route.flightNumberCandidates?.length ?? 0) > 0)
    .map((route) => routeKey(route.carrier, route.pair[0], route.pair[1])));
  const finalCovered = new Set([...existingKeys, ...anyLayerKeys]);
  const unresolved = [...publishedRoutes.entries()].filter(([key]) => !finalCovered.has(key));
  const unresolvedByCarrier = new Map<string, number>();
  unresolved.forEach(([, route]) => unresolvedByCarrier.set(route.carrier, (unresolvedByCarrier.get(route.carrier) ?? 0) + 1));
  console.log(JSON.stringify({
    output,
    publishedRoutes: publishedRoutes.size,
    layerRoutes: catalog.routes.length,
    confirmedNumberRoutes: catalog.routes.filter((route) => (route.flightNumbers?.length ?? 0) > 0).length,
    candidateNumberRoutes: catalog.routes.filter((route) => (route.flightNumberCandidates?.length ?? 0) > 0).length,
    existingScheduleNumberRoutes: existingKeys.size,
    finalCoveredRoutes: [...publishedRoutes.keys()].filter((key) => finalCovered.has(key)).length,
    currentPlannableRoutes: publishedRoutes.size - unresolved.length,
    currentPlannableCoveragePct: Number((100 * [...publishedRoutes.keys()].filter((key) => finalCovered.has(key)).length
      / Math.max(1, publishedRoutes.size - unresolved.length)).toFixed(2)),
    unresolvedRoutes: unresolved.length,
    coveragePct: Number((100 * (publishedRoutes.size - unresolved.length) / publishedRoutes.size).toFixed(2)),
    standingSummary,
    affiliateStandingSummary,
    btsRows,
    flightsFrom,
    auditedCurrentReferences,
    flightConnections,
    flightInformation,
    unresolvedByCarrier: Object.fromEntries([...unresolvedByCarrier.entries()].sort((a, b) => b[1] - a[1])),
  }, null, 2));
}

await main();
