import { readFileSync } from 'node:fs';
import { describe, expect, test } from 'vitest';
import {
  parseHashedRuntimeRouteNetwork,
  parseRuntimeRouteNetworkMeta,
} from '../../src/lib/route-network-runtime.ts';

const runtimeBytes = readFileSync('public/data/route-network/runtime-current.json');
const runtimeBuffer = runtimeBytes.buffer.slice(runtimeBytes.byteOffset, runtimeBytes.byteOffset + runtimeBytes.byteLength) as ArrayBuffer;
const metaRaw = JSON.parse(readFileSync('public/data/route-network/runtime-current.meta.json', 'utf8')) as unknown;
const airportCodes = new Set<string>(
  (JSON.parse(readFileSync('public/data/airports.json', 'utf8')) as Array<{ iata: string }>).map((row) => row.iata),
);

describe('hashed browser runtime route parser', () => {
  test('accepts the exact build-generated runtime and route count', async () => {
    const meta = parseRuntimeRouteNetworkMeta(metaRaw);
    const parsed = await parseHashedRuntimeRouteNetwork(runtimeBuffer, meta, airportCodes);
    expect(parsed.routes).toHaveLength(meta.routes);
    expect(parsed.routes.length).toBeGreaterThan(30_000);
    expect(parsed.sources.length).toBeGreaterThan(2_000);
  });

  test('rejects changed or truncated runtime bytes before parsing them', async () => {
    const meta = parseRuntimeRouteNetworkMeta(metaRaw);
    const changed = runtimeBytes.slice();
    changed[100] = (changed[100] ?? 0) ^ 1;
    const changedBuffer = changed.buffer.slice(changed.byteOffset, changed.byteOffset + changed.byteLength) as ArrayBuffer;
    await expect(parseHashedRuntimeRouteNetwork(changedBuffer, meta, airportCodes)).rejects.toThrow('SHA-256');
    await expect(parseHashedRuntimeRouteNetwork(runtimeBuffer.slice(0, runtimeBuffer.byteLength - 10), meta, airportCodes)).rejects.toThrow('SHA-256');
  });

  test('rejects malformed runtime metadata', () => {
    expect(() => parseRuntimeRouteNetworkMeta({ outputSha256: 'bad', routes: 1 })).toThrow('outputSha256');
    expect(() => parseRuntimeRouteNetworkMeta({ outputSha256: 'a'.repeat(64), routes: -1 })).toThrow('metadata routes');
  });

  test('rejects a validly hashed deployment with a mismatched route count', async () => {
    const meta = parseRuntimeRouteNetworkMeta(metaRaw);
    await expect(parseHashedRuntimeRouteNetwork(runtimeBuffer, { ...meta, routes: meta.routes + 1 }, airportCodes))
      .rejects.toThrow('route count does not match metadata');
  });

  test('rejects a validly hashed deployment when the airport catalog is inconsistent', async () => {
    const meta = parseRuntimeRouteNetworkMeta(metaRaw);
    await expect(parseHashedRuntimeRouteNetwork(runtimeBuffer, meta, new Set(['TPE'])))
      .rejects.toThrow('unknown airport');
  });
});
