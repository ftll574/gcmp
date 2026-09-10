import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import airportsRaw from '../public/data/airports.json' with { type: 'json' };
import { extractStaticRouteCandidates } from '../src/lib/rtw/static-route-research.ts';
import { activeAllianceAirlineCodes } from './lib/alliance-airline-icao.ts';

const SOURCE_URL = 'https://raw.githubusercontent.com/Jonty/airline-route-data/main/airline_routes.json';
const DEFAULT_SNAPSHOT = 'E:/workspace/.gcmp-route-work/static-route-research/jonty-airline-routes.json';
const DEFAULT_REPORT = 'E:/workspace/.gcmp-route-work/static-route-research/jonty-gap-report.json';
const MAX_RESPONSE_BYTES = 40_000_000;

function argValue(name: string): string | undefined {
  const prefix = `--${name}=`;
  return process.argv.find((arg) => arg.startsWith(prefix))?.slice(prefix.length);
}

async function readBoundedText(response: Response): Promise<string> {
  const length = Number(response.headers.get('content-length'));
  if (Number.isFinite(length) && length > MAX_RESPONSE_BYTES) throw new Error('Static route snapshot is too large');
  const reader = response.body?.getReader();
  if (!reader) throw new Error('Static route snapshot returned no body');
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const part = await reader.read();
    if (part.done) break;
    size += part.value.byteLength;
    if (size > MAX_RESPONSE_BYTES) {
      await reader.cancel();
      throw new Error('Static route snapshot is too large');
    }
    chunks.push(part.value);
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  return new TextDecoder().decode(bytes);
}

async function main(): Promise<void> {
  const snapshotPath = resolve(argValue('snapshot') ?? DEFAULT_SNAPSHOT);
  const reportPath = resolve(argValue('report') ?? DEFAULT_REPORT);
  const refresh = process.argv.includes('--refresh');
  mkdirSync(dirname(snapshotPath), { recursive: true });
  mkdirSync(dirname(reportPath), { recursive: true });

  if (refresh || !existsSync(snapshotPath)) {
    const response = await fetch(SOURCE_URL, { headers: { Accept: 'application/json' }, redirect: 'error', signal: AbortSignal.timeout(60_000) });
    if (!response.ok) throw new Error(`Static route source failed with HTTP ${response.status}`);
    writeFileSync(snapshotPath, await readBoundedText(response));
  }

  const extracted = extractStaticRouteCandidates(JSON.parse(readFileSync(snapshotPath, 'utf8')), {
    eligibleCarriers: new Set(activeAllianceAirlineCodes().map((carrier) => carrier.iata)),
    knownAirports: new Set(airportsRaw.map((airport) => airport.iata)),
  });
  const runtime = JSON.parse(readFileSync('public/data/route-network/runtime-current.json', 'utf8')) as {
    routes: Array<{ carrier: string; pair: [string, string]; status: string }>;
  };
  const current = new Set(runtime.routes
    .filter((route) => route.status === 'published')
    .map((route) => `${route.carrier}:${route.pair[0]}-${route.pair[1]}`));
  const missing = extracted.routes.filter((route) => !current.has(`${route.carrier}:${route.from}-${route.to}`));
  const byCarrier = new Map<string, number>();
  for (const route of missing) byCarrier.set(route.carrier, (byCarrier.get(route.carrier) ?? 0) + 1);
  const report = {
    source: SOURCE_URL,
    snapshotPath,
    generatedAt: new Date().toISOString(),
    licenseStatus: 'source-repository-has-no-explicit-license-use-for-local-research-only',
    ...extracted.stats,
    missingFromCurrentRuntime: missing.length,
    missingByCarrier: Object.fromEntries([...byCarrier.entries()].sort((a, b) => b[1] - a[1])),
    examples: missing.slice(0, 100),
  };
  writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify(report, null, 2));
}

await main();
