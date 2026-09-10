import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import airportsRaw from '../public/data/airports.json' with { type: 'json' };
import { normalizeLiveRoutes } from '../server/live-routes.ts';
import { buildGlobalRouteCatalog, type GlobalRouteScanRecord } from '../src/lib/rtw/global-route-collection.ts';
import { activeAllianceAirlineCodes } from './lib/alliance-airline-icao.ts';

const DEFAULT_WORK_ROOT = 'E:/workspace/.gcmp-route-work/air-routes-global';
const DEFAULT_OUTPUT = 'public/data/route-network/air-routes-global-current.json';
const MAX_RESPONSE_BYTES = 1_500_000;

interface CachedScanRecord {
  version: 1;
  origin: string;
  checkedAt: string;
  status: 200 | 404;
  response?: unknown;
}

function argValue(name: string): string | undefined {
  const prefix = `--${name}=`;
  return process.argv.find((arg) => arg.startsWith(prefix))?.slice(prefix.length);
}

function positiveIntArg(name: string, fallback: number): number {
  const raw = argValue(name);
  if (raw === undefined) return fallback;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < 1) throw new Error(`--${name} must be a positive integer`);
  return value;
}

async function readBoundedJson(response: Response): Promise<unknown> {
  const length = Number(response.headers.get('content-length'));
  if (Number.isFinite(length) && length > MAX_RESPONSE_BYTES) throw new Error('air-routes response too large');
  const reader = response.body?.getReader();
  if (!reader) throw new Error('air-routes returned no body');
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const part = await reader.read();
    if (part.done) break;
    size += part.value.byteLength;
    if (size > MAX_RESPONSE_BYTES) {
      await reader.cancel();
      throw new Error('air-routes response too large');
    }
    chunks.push(part.value);
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
  return JSON.parse(new TextDecoder().decode(bytes));
}

async function fetchOrigin(origin: string): Promise<CachedScanRecord> {
  const response = await fetch(`https://air-routes.com/api/airport/${origin}/destinations`, {
    headers: { Accept: 'application/json' },
    signal: AbortSignal.timeout(12_000),
    redirect: 'error',
  });
  const checkedAt = new Date().toISOString();
  if (response.status === 404) return { version: 1, origin, checkedAt, status: 404 };
  if (!response.ok) throw new Error(`air-routes ${origin} HTTP ${response.status}`);
  return { version: 1, origin, checkedAt, status: 200, response: await readBoundedJson(response) };
}

function cachePath(workRoot: string, origin: string): string {
  return resolve(workRoot, `${origin}.json`);
}

function loadCached(path: string, origin: string): CachedScanRecord | null {
  if (!existsSync(path)) return null;
  const value = JSON.parse(readFileSync(path, 'utf8')) as CachedScanRecord;
  if (value.version !== 1 || value.origin !== origin || ![200, 404].includes(value.status)) {
    throw new Error(`Invalid global route cache ${path}`);
  }
  return value;
}

async function main(): Promise<void> {
  const workRoot = resolve(argValue('work-root') ?? DEFAULT_WORK_ROOT);
  const output = resolve(argValue('output') ?? DEFAULT_OUTPUT);
  const allowFetch = process.argv.includes('--fetch');
  const concurrency = Math.min(16, positiveIntArg('concurrency', 6));
  const maxOrigins = positiveIntArg('max-origins', airportsRaw.length);
  const current = JSON.parse(readFileSync('public/data/route-network/runtime-current.json', 'utf8')) as { version: string };
  const origins = airportsRaw.map((airport) => airport.iata).sort().slice(0, maxOrigins);
  const expectedOrigins = new Set(airportsRaw.map((airport) => airport.iata));
  const knownAirports = new Set(expectedOrigins);
  const eligibleCarriers = new Set(activeAllianceAirlineCodes().map((carrier) => carrier.iata));
  mkdirSync(workRoot, { recursive: true });

  const records = new Map<string, CachedScanRecord>();
  const failures: Array<{ origin: string; error: string }> = [];
  let cacheHits = 0;
  let fetched = 0;
  let cursor = 0;
  async function worker(): Promise<void> {
    while (cursor < origins.length) {
      const origin = origins[cursor++]!;
      const path = cachePath(workRoot, origin);
      const cached = loadCached(path, origin);
      if (cached) {
        records.set(origin, cached);
        cacheHits++;
        continue;
      }
      if (!allowFetch) continue;
      try {
        const result = await fetchOrigin(origin);
        records.set(origin, result);
        writeFileSync(path, `${JSON.stringify(result)}\n`);
        fetched++;
      } catch (error) {
        failures.push({ origin, error: error instanceof Error ? error.message : 'unknown error' });
      }
    }
  }
  await Promise.all(Array.from({ length: concurrency }, () => worker()));

  const normalized: GlobalRouteScanRecord[] = [...records.values()].map((record) => ({
    origin: record.origin,
    status: record.status,
    ...(record.status === 200 ? {
      response: normalizeLiveRoutes(record.response, record.origin, Date.parse(record.checkedAt)),
    } : {}),
  }));
  if (normalized.length === 0) throw new Error('No global route scan records available');
  const completeAirportScan = normalized.length === expectedOrigins.size && failures.length === 0;
  if (!completeAirportScan && !process.argv.includes('--allow-partial-output')) {
    console.log(JSON.stringify({
      airportUniverse: expectedOrigins.size,
      requestedOrigins: origins.length,
      scannedOrigins: normalized.length,
      cacheHits,
      fetched,
      failures: failures.length,
      failureExamples: failures.slice(0, 20),
      targetCarriers: eligibleCarriers.size,
      completeAirportScan: false,
      outputWritten: false,
      note: 'Incomplete scan retained in the resumable cache; rerun later or pass --allow-partial-output for research-only output.',
    }, null, 2));
    return;
  }
  const checkedOn = [...records.values()].map((record) => record.checkedAt.slice(0, 10)).sort().at(-1)!;
  const catalog = buildGlobalRouteCatalog({ records: normalized, eligibleCarriers, knownAirports, expectedOrigins, checkedOn, version: current.version });
  writeFileSync(output, `${JSON.stringify(catalog)}\n`);

  console.log(JSON.stringify({
    output,
    airportUniverse: expectedOrigins.size,
    requestedOrigins: origins.length,
    scannedOrigins: normalized.length,
    cacheHits,
    fetched,
    failures: failures.length,
    failureExamples: failures.slice(0, 20),
    targetCarriers: eligibleCarriers.size,
    collectedRoutes: catalog.routes.length,
    carriersObserved: new Set(catalog.routes.map((route) => route.carrier)).size,
    checkedOn,
    completeAirportScan,
    outputWritten: true,
  }, null, 2));
}

await main();
