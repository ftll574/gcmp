import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseRouteNetworkCatalog, type RouteNetworkCatalog } from '../src/lib/schemas/route-network.ts';

const ROOT = resolve(import.meta.dirname, '..');
const ROUTE_ROOT = resolve(ROOT, 'public', 'data', 'route-network');
const RUNTIME_PATH = resolve(ROUTE_ROOT, 'runtime-current.json');
const RUNTIME_META_PATH = resolve(ROUTE_ROOT, 'runtime-current.meta.json');
const OUT_DIR = resolve(ROUTE_ROOT, 'runtime-carriers');
const OUT_META = resolve(ROUTE_ROOT, 'runtime-carriers.meta.json');

function sha256(text: string): string {
  return createHash('sha256').update(text.replace(/\r\n/g, '\n')).digest('hex');
}

function normalizedBytes(text: string): number {
  return Buffer.byteLength(text.replace(/\r\n/g, '\n'));
}

const airportCodes = new Set<string>(
  (JSON.parse(readFileSync(resolve(ROOT, 'public', 'data', 'airports.json'), 'utf8')) as Array<{ iata: string }>)
    .map((row) => row.iata),
);
const runtimeText = readFileSync(RUNTIME_PATH, 'utf8');
const runtime = parseRouteNetworkCatalog(JSON.parse(runtimeText), airportCodes);
const runtimeMeta = JSON.parse(readFileSync(RUNTIME_META_PATH, 'utf8')) as { outputSha256?: unknown };

if (typeof runtimeMeta.outputSha256 !== 'string' || !/^[a-f0-9]{64}$/.test(runtimeMeta.outputSha256)) {
  throw new Error('runtime-current.meta.json is missing a valid outputSha256');
}
if (sha256(runtimeText) !== runtimeMeta.outputSha256) {
  throw new Error('runtime-current.json does not match runtime-current.meta.json; refusing to build carrier shards');
}

rmSync(OUT_DIR, { recursive: true, force: true });
mkdirSync(OUT_DIR, { recursive: true });

const publishedRoutes = runtime.routes.filter((route) => route.status === 'published');
const carriers = [...new Set(publishedRoutes.map((route) => route.carrier))].sort();
const carrierMeta: Record<string, { routes: number; bytes: number; sha256: string }> = {};
let totalBytes = 0;

for (const carrier of carriers) {
  const routes = publishedRoutes.filter((route) => route.carrier === carrier);
  const carrierUniverses = runtime.carrierUniverses.filter((universe) => universe.carrier === carrier);
  const sourceIds = new Set([
    ...routes.flatMap((route) => [
      ...route.sourceIds,
      ...(route.flightNumberSourceIds ?? []),
      ...(route.flightNumberCandidateSourceIds ?? []),
    ]),
    ...carrierUniverses.flatMap((universe) => universe.sourceIds),
  ]);
  const shard: RouteNetworkCatalog = {
    version: runtime.version,
    coverage: runtime.coverage,
    sources: runtime.sources.filter((source) => sourceIds.has(source.id)),
    carrierUniverses,
    routes,
  };
  parseRouteNetworkCatalog(shard, airportCodes);
  const text = `${JSON.stringify(shard)}\n`;
  const bytes = normalizedBytes(text);
  writeFileSync(resolve(OUT_DIR, `${carrier}.json`), text);
  carrierMeta[carrier] = { routes: routes.length, bytes, sha256: sha256(text) };
  totalBytes += bytes;
}

const manifest = {
  version: 1,
  runtimeSha256: runtimeMeta.outputSha256,
  carriers: carrierMeta,
};
writeFileSync(OUT_META, `${JSON.stringify(manifest, null, 2)}\n`);

console.log(JSON.stringify({
  built: true,
  carriers: carriers.length,
  totalBytes,
  runtimeSha256: runtimeMeta.outputSha256,
}, null, 2));
