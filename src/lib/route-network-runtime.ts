import type { RouteNetworkCatalog } from './schemas/route-network.ts';

export interface RuntimeRouteNetworkMeta {
  readonly outputSha256: string;
  readonly routes: number;
  readonly originShards: Readonly<Record<string, RuntimeRouteNetworkShardMeta>>;
}

export interface RuntimeRouteNetworkShardMeta {
  readonly routes: number;
  readonly bytes: number;
  readonly sha256: string;
}

export interface RuntimeRouteNetworkCarrierManifest {
  readonly runtimeSha256: string;
  readonly carriers: Readonly<Record<string, RuntimeRouteNetworkShardMeta>>;
}

function fail(message: string): never {
  throw new Error(`runtime route-network: ${message}`);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function bytesToHex(bytes: ArrayBuffer): string {
  return Array.from(new Uint8Array(bytes), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

async function sha256Hex(bytes: ArrayBuffer): Promise<string> {
  if (!globalThis.crypto?.subtle) fail('Web Crypto SHA-256 is unavailable');
  return bytesToHex(await globalThis.crypto.subtle.digest('SHA-256', bytes));
}

export function parseRuntimeRouteNetworkMeta(raw: unknown): RuntimeRouteNetworkMeta {
  if (!isRecord(raw)) fail('metadata must be an object');
  if (typeof raw.outputSha256 !== 'string' || !/^[a-f0-9]{64}$/.test(raw.outputSha256)) {
    fail('metadata outputSha256 is invalid');
  }
  if (!Number.isInteger(raw.routes) || (raw.routes as number) < 0) fail('metadata routes is invalid');
  const originShards: Record<string, RuntimeRouteNetworkShardMeta> = {};
  if (raw.originShards !== undefined) {
    if (!isRecord(raw.originShards)) fail('metadata originShards is invalid');
    for (const [letter, shard] of Object.entries(raw.originShards)) {
      if (!/^[A-Z]$/.test(letter) || !isRecord(shard)) fail('metadata originShards entry is invalid');
      if (!Number.isInteger(shard.routes) || (shard.routes as number) < 0) fail(`metadata originShards.${letter}.routes is invalid`);
      if (!Number.isInteger(shard.bytes) || (shard.bytes as number) < 0) fail(`metadata originShards.${letter}.bytes is invalid`);
      if (typeof shard.sha256 !== 'string' || !/^[a-f0-9]{64}$/.test(shard.sha256)) {
        fail(`metadata originShards.${letter}.sha256 is invalid`);
      }
      originShards[letter] = {
        routes: shard.routes as number,
        bytes: shard.bytes as number,
        sha256: shard.sha256,
      };
    }
  }
  return { outputSha256: raw.outputSha256, routes: raw.routes as number, originShards };
}

export function parseRuntimeRouteNetworkCarrierManifest(raw: unknown): RuntimeRouteNetworkCarrierManifest {
  if (!isRecord(raw)) fail('carrier metadata must be an object');
  if (raw.version !== 1) fail('carrier metadata version is invalid');
  if (typeof raw.runtimeSha256 !== 'string' || !/^[a-f0-9]{64}$/.test(raw.runtimeSha256)) {
    fail('carrier metadata runtimeSha256 is invalid');
  }
  if (!isRecord(raw.carriers)) fail('carrier metadata carriers is invalid');
  const carriers: Record<string, RuntimeRouteNetworkShardMeta> = {};
  for (const [carrier, shard] of Object.entries(raw.carriers)) {
    if (!/^[A-Z0-9]{2,3}$/.test(carrier) || !isRecord(shard)) fail('carrier metadata entry is invalid');
    if (!Number.isInteger(shard.routes) || (shard.routes as number) < 0) fail(`carrier metadata ${carrier}.routes is invalid`);
    if (!Number.isInteger(shard.bytes) || (shard.bytes as number) < 0) fail(`carrier metadata ${carrier}.bytes is invalid`);
    if (typeof shard.sha256 !== 'string' || !/^[a-f0-9]{64}$/.test(shard.sha256)) {
      fail(`carrier metadata ${carrier}.sha256 is invalid`);
    }
    carriers[carrier] = {
      routes: shard.routes as number,
      bytes: shard.bytes as number,
      sha256: shard.sha256,
    };
  }
  return { runtimeSha256: raw.runtimeSha256, carriers };
}

function parseRuntimeJson(text: string, expectedRoutes: number, knownAirports?: ReadonlySet<string>): RouteNetworkCatalog {
  let raw: unknown;
  try {
    raw = JSON.parse(text) as unknown;
  } catch {
    fail('JSON is malformed');
  }
  if (!isRecord(raw)) fail('catalog must be an object');
  if (typeof raw.version !== 'string' || !/^\d{4}\.[1-4]$/.test(raw.version)) fail('catalog version is invalid');
  if (raw.coverage !== 'curated-not-complete') fail('catalog coverage is invalid');
  if (!Array.isArray(raw.sources) || raw.sources.length === 0) fail('catalog sources are invalid');
  if (!Array.isArray(raw.carrierUniverses)) fail('catalog carrierUniverses are invalid');
  if (!Array.isArray(raw.routes) || raw.routes.length !== expectedRoutes) {
    fail(`catalog route count does not match metadata (${String(expectedRoutes)})`);
  }
  if (knownAirports) {
    for (let index = 0; index < raw.routes.length; index += 1) {
      const route = raw.routes[index];
      if (!isRecord(route) || !Array.isArray(route.pair) || route.pair.length !== 2) {
        fail(`routes[${String(index)}].pair is invalid`);
      }
      const [from, to] = route.pair;
      if (typeof from !== 'string' || typeof to !== 'string' || !knownAirports.has(from) || !knownAirports.has(to)) {
        fail(`routes[${String(index)}].pair references an unknown airport`);
      }
    }
  }
  return raw as unknown as RouteNetworkCatalog;
}

/**
 * Loads the build-generated browser graph after checking its build hash.
 *
 * The canonical build pipeline validates every source layer, merged route,
 * source reference and flight identity with Zod before writing this file.
 * Repeating that schema parse in the browser deep-clones 30k+ route rows.
 * Here we verify the exact generated bytes against runtime metadata, then do
 * only cheap deployment sanity checks before returning the original graph.
 */
export async function parseHashedRuntimeRouteNetwork(
  bytes: ArrayBuffer,
  meta: RuntimeRouteNetworkMeta,
  knownAirports?: ReadonlySet<string>,
): Promise<RouteNetworkCatalog> {
  const decoder = new TextDecoder();
  let text: string | null = null;
  let actualHash = await sha256Hex(bytes);
  if (actualHash !== meta.outputSha256) {
    // Build hashes normalize CRLF so Windows checkouts remain deterministic.
    // Production artifacts are normally LF already; this fallback only pays
    // the normalization cost when raw bytes do not match directly.
    text = decoder.decode(bytes);
    const normalized = text.replace(/\r\n/g, '\n');
    if (normalized !== text) {
      actualHash = await sha256Hex(new TextEncoder().encode(normalized).buffer);
      text = normalized;
    }
  }
  if (actualHash !== meta.outputSha256) fail('SHA-256 does not match runtime metadata');
  return parseRuntimeJson(text ?? decoder.decode(bytes), meta.routes, knownAirports);
}

/** Verify and parse one build-generated origin shard without touching the full graph. */
export async function parseHashedRuntimeRouteNetworkShard(
  bytes: ArrayBuffer,
  meta: RuntimeRouteNetworkShardMeta,
  knownAirports?: ReadonlySet<string>,
): Promise<RouteNetworkCatalog> {
  return parseHashedRuntimeRouteNetwork(bytes, {
    outputSha256: meta.sha256,
    routes: meta.routes,
    originShards: {},
  }, knownAirports);
}

/** Verify and parse one build-generated carrier shard. */
export async function parseHashedRuntimeRouteNetworkCarrierShard(
  bytes: ArrayBuffer,
  meta: RuntimeRouteNetworkShardMeta,
  carrier: string,
  knownAirports?: ReadonlySet<string>,
): Promise<RouteNetworkCatalog> {
  const network = await parseHashedRuntimeRouteNetworkShard(bytes, meta, knownAirports);
  if (network.routes.some((route) => route.carrier !== carrier || route.status !== 'published')) {
    fail(`carrier shard ${carrier} contains routes outside its published carrier scope`);
  }
  return network;
}
