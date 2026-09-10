import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { z } from 'zod';
import airportsRaw from '../public/data/airports.json' with { type: 'json' };
import { RouteNetworkCatalogSchema } from '../src/lib/schemas/route-network.ts';
import { activeAllianceAirlineCodes } from './lib/alliance-airline-icao.ts';

const DEFAULT_OUTPUT = 'public/data/route-network/aviation-edge-global-current.json';
const DEFAULT_RAW_OUTPUT = 'E:/workspace/.gcmp-route-work/aviation-edge-global-routes.json';
const MAX_RESPONSE_BYTES = 200_000_000;

const RawRouteSchema = z.object({
  departureIata: z.string().nullable().optional(),
  arrivalIata: z.string().nullable().optional(),
  airlineIata: z.string().nullable().optional(),
  flightNumber: z.union([z.string(), z.number()]).nullable().optional(),
}).passthrough();
const RawRoutesSchema = z.array(RawRouteSchema).max(2_000_000);
const RawSnapshotSchema = z.object({
  version: z.literal(1),
  checkedAt: z.string().datetime(),
  source: z.literal('https://aviation-edge.com/v2/public/routes'),
  rows: RawRoutesSchema,
}).strict();

function argValue(name: string): string | undefined {
  const prefix = `--${name}=`;
  return process.argv.find((arg) => arg.startsWith(prefix))?.slice(prefix.length);
}

function normalizeIata(value: string | null | undefined, length: 2 | 3): string | null {
  const normalized = value?.trim().toUpperCase() ?? '';
  return new RegExp(`^[A-Z0-9]{${length}}$`).test(normalized) ? normalized : null;
}

async function readBoundedJson(response: Response): Promise<unknown> {
  const length = Number(response.headers.get('content-length'));
  if (Number.isFinite(length) && length > MAX_RESPONSE_BYTES) throw new Error('Aviation Edge response too large');
  const reader = response.body?.getReader();
  if (!reader) throw new Error('Aviation Edge returned no body');
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const part = await reader.read();
    if (part.done) break;
    size += part.value.byteLength;
    if (size > MAX_RESPONSE_BYTES) {
      await reader.cancel();
      throw new Error('Aviation Edge response too large');
    }
    chunks.push(part.value);
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
  return JSON.parse(new TextDecoder().decode(bytes));
}

export function buildAviationEdgeGlobalRouteCatalog(raw: unknown, options: {
  checkedOn: string;
  version: string;
  knownAirports: ReadonlySet<string>;
  eligibleCarriers: ReadonlySet<string>;
}) {
  const rows = RawRoutesSchema.parse(raw);
  const sourceId = `aviation-edge-global-${options.checkedOn.replaceAll('-', '')}`;
  const routes = new Map<string, {
    carrier: string; pair: [string, string]; service: 'nonstop'; status: 'published';
    carrierIdentity: 'provider-listed'; sourceIds: string[];
  }>();
  let invalidRows = 0;
  let outsideAirportCatalog = 0;
  let targetRows = 0;
  const flightIdentityKeys = new Set<string>();

  for (const row of rows) {
    const from = normalizeIata(row.departureIata, 3);
    const to = normalizeIata(row.arrivalIata, 3);
    const carrier = normalizeIata(row.airlineIata, 2);
    if (!from || !to || !carrier || from === to) { invalidRows++; continue; }
    if (!options.eligibleCarriers.has(carrier)) continue;
    targetRows++;
    if (!options.knownAirports.has(from) || !options.knownAirports.has(to)) {
      outsideAirportCatalog++;
      continue;
    }
    routes.set(`${carrier}:${from}-${to}`, {
      carrier, pair: [from, to], service: 'nonstop', status: 'published',
      carrierIdentity: 'provider-listed', sourceIds: [sourceId],
    });
    const suffix = String(row.flightNumber ?? '').trim().toUpperCase().replace(/^0+(?=\d)/, '');
    if (/^\d{1,4}[A-Z]?$/.test(suffix)) flightIdentityKeys.add(`${carrier}${suffix}:${from}-${to}`);
  }

  const counts = new Map<string, number>();
  for (const route of routes.values()) counts.set(route.carrier, (counts.get(route.carrier) ?? 0) + 1);
  const catalog = RouteNetworkCatalogSchema.parse({
    version: options.version,
    coverage: 'curated-not-complete',
    sources: [{
      id: sourceId,
      url: 'https://aviation-edge.com/airline-routes-database-and-api/',
      checkedOn: options.checkedOn,
      note: `Bulk Aviation Edge Airline Routes dataset. ${routes.size} unique active target-carrier directional airport pairs retained; carrier identity remains provider-listed until independently corroborated. Flight-number fields are intentionally deferred to the second collection stage.`,
    }],
    carrierUniverses: [...counts.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([carrier, count]) => ({
      carrier,
      scope: 'partial' as const,
      asOf: options.checkedOn,
      sourceIds: [sourceId],
      note: `Bulk provider observed ${count} unique active directional nonstop listings for ${carrier}; GCMP does not promote this provider snapshot to a globally complete operating-carrier denominator.`,
    })),
    routes: [...routes.values()].sort((a, b) =>
      a.carrier.localeCompare(b.carrier) || a.pair[0].localeCompare(b.pair[0]) || a.pair[1].localeCompare(b.pair[1])),
  });
  return { catalog, stats: { inputRows: rows.length, targetRows, uniqueRoutes: routes.size, invalidRows, outsideAirportCatalog, candidateFlightIdentities: flightIdentityKeys.size } };
}

async function main(): Promise<void> {
  if (existsSync('.env.schedules.local')) process.loadEnvFile('.env.schedules.local');
  const apiKey = process.env.AVIATION_EDGE_API_KEY?.trim();
  const output = resolve(argValue('output') ?? DEFAULT_OUTPUT);
  const rawOutput = resolve(argValue('raw-output') ?? DEFAULT_RAW_OUTPUT);
  const cachedInput = argValue('input');
  let snapshot: z.infer<typeof RawSnapshotSchema>;
  if (cachedInput) {
    snapshot = RawSnapshotSchema.parse(JSON.parse(readFileSync(resolve(cachedInput), 'utf8')));
  } else {
    if (!apiKey) throw new Error('AVIATION_EDGE_API_KEY is not configured; use --input=<saved raw snapshot> for offline rebuilds');
    const url = new URL('https://aviation-edge.com/v2/public/routes');
    url.searchParams.set('key', apiKey);
    const response = await fetch(url, { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(60_000), redirect: 'error' });
    if (!response.ok) throw new Error(`Aviation Edge routes request failed with HTTP ${response.status}`);
    snapshot = RawSnapshotSchema.parse({
      version: 1,
      checkedAt: new Date().toISOString(),
      source: 'https://aviation-edge.com/v2/public/routes',
      rows: await readBoundedJson(response),
    });
    writeFileSync(rawOutput, `${JSON.stringify(snapshot)}\n`);
  }

  const checkedOn = snapshot.checkedAt.slice(0, 10);
  const runtime = JSON.parse(readFileSync('public/data/route-network/runtime-current.json', 'utf8')) as { version: string };
  const result = buildAviationEdgeGlobalRouteCatalog(snapshot.rows, {
    checkedOn,
    version: runtime.version,
    knownAirports: new Set(airportsRaw.map((airport) => airport.iata)),
    eligibleCarriers: new Set(activeAllianceAirlineCodes().map((carrier) => carrier.iata)),
  });
  writeFileSync(output, `${JSON.stringify(result.catalog)}\n`);
  console.log(JSON.stringify({ output, rawSnapshot: cachedInput ? resolve(cachedInput) : rawOutput, checkedOn, ...result.stats }, null, 2));
}

if (import.meta.url === new URL(`file:///${process.argv[1]?.replaceAll('\\', '/')}`).href) await main();
