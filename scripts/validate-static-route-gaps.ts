import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import airportsRaw from '../public/data/airports.json' with { type: 'json' };
import { LiveRouteResponseSchema, type LiveRouteResponse } from '../src/lib/schemas/live-routes.ts';
import { extractStaticRouteCandidates } from '../src/lib/rtw/static-route-research.ts';
import { buildValidatedStaticRouteCatalog, validateStaticRouteCandidates } from '../src/lib/rtw/static-route-validation.ts';
import { activeAllianceAirlineCodes } from './lib/alliance-airline-icao.ts';

const DEFAULT_STATIC_INPUT = 'E:/workspace/.gcmp-route-work/static-route-research/jonty-airline-routes.json';
const DEFAULT_CACHE_ROOT = 'E:/workspace/.gcmp-route-work/static-route-validation/air-routes';
const DEFAULT_REPORT = 'E:/workspace/.gcmp-route-work/static-route-validation/report.json';

function argValue(name: string): string | undefined {
  const prefix = `--${name}=`;
  return process.argv.find((arg) => arg.startsWith(prefix))?.slice(prefix.length);
}

function numericArg(name: string, fallback: number): number {
  const raw = argValue(name);
  const value = raw === undefined ? fallback : Number(raw);
  if (!Number.isInteger(value) || value < 0) throw new Error(`Invalid --${name}`);
  return value;
}

function routeKey(carrier: string, from: string, to: string): string {
  return `${carrier}:${from}-${to}`;
}

async function sleep(ms: number): Promise<void> {
  await new Promise<void>((resolvePromise) => setTimeout(resolvePromise, ms));
}

async function fetchOrigin(origin: string): Promise<LiveRouteResponse> {
  const response = await fetch(`https://air-routes.com/api/airport/${origin}/destinations`, {
    headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(15_000), redirect: 'error',
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const raw = await response.json();
  const now = Date.now();
  const routes = (raw as { destinations?: unknown[] }).destinations;
  if (!Array.isArray(routes)) throw new Error('Invalid provider payload');
  const normalized = await import('../server/live-routes.ts');
  return normalized.normalizeLiveRoutes(raw, origin, now, 24 * 60 * 60 * 1000);
}

async function main(): Promise<void> {
  const staticInput = resolve(argValue('input') ?? DEFAULT_STATIC_INPUT);
  const cacheRoot = resolve(argValue('cache-root') ?? DEFAULT_CACHE_ROOT);
  const reportPath = resolve(argValue('report') ?? DEFAULT_REPORT);
  const confirmedOutput = argValue('confirmed-output');
  const maxOrigins = numericArg('max-origins', 0);
  const delayMs = numericArg('delay-ms', 1100);
  const allowFetch = process.argv.includes('--fetch');
  mkdirSync(cacheRoot, { recursive: true });
  mkdirSync(dirname(reportPath), { recursive: true });

  const runtime = JSON.parse(readFileSync('public/data/route-network/runtime-current.json', 'utf8')) as {
    routes: Array<{ carrier: string; pair: [string, string]; status: string }>;
  };
  const staticRaw = JSON.parse(readFileSync(staticInput, 'utf8'));
  const extracted = extractStaticRouteCandidates(staticRaw, {
    eligibleCarriers: new Set(activeAllianceAirlineCodes().map((carrier) => carrier.iata)),
    knownAirports: new Set(airportsRaw.map((airport) => airport.iata)),
  });
  const runtimePublished = new Set(runtime.routes
    .filter((route) => route.status === 'published')
    .map((route) => routeKey(route.carrier, route.pair[0], route.pair[1])));
  const runtimeAny = new Map(runtime.routes.map((route) => [routeKey(route.carrier, route.pair[0], route.pair[1]), route] as const));
  const gaps = extracted.routes.filter((route) => !runtimePublished.has(routeKey(route.carrier, route.from, route.to)));
  const explicitKnown = gaps.filter((route) => runtimeAny.has(routeKey(route.carrier, route.from, route.to)));
  const absent = gaps.filter((route) => !runtimeAny.has(routeKey(route.carrier, route.from, route.to)));
  const origins = [...new Set(absent.map((route) => route.from))].sort();
  const selectedOrigins = maxOrigins > 0 ? origins.slice(0, maxOrigins) : origins;
  const responses = new Map<string, LiveRouteResponse>();
  const failures: Array<{ origin: string; error: string }> = [];
  let fetched = 0;
  let cacheHits = 0;

  for (const [index, origin] of selectedOrigins.entries()) {
    const cachePath = resolve(cacheRoot, `${origin}.json`);
    if (existsSync(cachePath)) {
      const cached = LiveRouteResponseSchema.safeParse(JSON.parse(readFileSync(cachePath, 'utf8')));
      if (cached.success) {
        responses.set(origin, cached.data);
        cacheHits++;
        continue;
      }
    }
    if (!allowFetch) continue;
    if (index > 0) await sleep(delayMs);
    try {
      const result = await fetchOrigin(origin);
      responses.set(origin, result);
      writeFileSync(cachePath, `${JSON.stringify(result)}\n`);
      fetched++;
    } catch (error) {
      failures.push({ origin, error: error instanceof Error ? error.message : 'unknown error' });
      if (failures.at(-1)?.error.includes('429')) break;
    }
  }

  const validation = validateStaticRouteCandidates(absent, responses);
  const counts = Object.fromEntries(['confirmed-current', 'carrier-not-listed', 'route-not-listed', 'unresolved']
    .map((status) => [status, validation.filter((row) => row.status === status).length]));
  const explicitStates = Object.fromEntries([...new Set(explicitKnown.map((row) => {
    const existing = runtimeAny.get(routeKey(row.carrier, row.from, row.to))!;
    return existing.status;
  }))].map((status) => [status, explicitKnown.filter((row) => runtimeAny.get(routeKey(row.carrier, row.from, row.to))?.status === status).length]));
  const report = {
    version: 1,
    generatedAt: new Date().toISOString(),
    staticSource: staticInput,
    gaps: gaps.length,
    absentCandidates: absent.length,
    explicitKnown: explicitKnown.length,
    explicitStates,
    origins: origins.length,
    selectedOrigins: selectedOrigins.length,
    checkedOrigins: responses.size,
    fetched,
    cacheHits,
    failures,
    counts,
    validation,
  };
  writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
  if (confirmedOutput) {
    const runtimeVersion = JSON.parse(readFileSync('public/data/route-network/runtime-current.json', 'utf8')) as { version: string };
    const catalog = buildValidatedStaticRouteCatalog({ validation, responsesByOrigin: responses, version: runtimeVersion.version });
    const outputPath = resolve(confirmedOutput);
    mkdirSync(dirname(outputPath), { recursive: true });
    writeFileSync(outputPath, `${JSON.stringify(catalog)}\n`);
  }
  console.log(JSON.stringify({ report: reportPath, ...report, validation: undefined }, null, 2));
}

await main();
