/**
 * Verify every committed generated route-network overlay against the
 * airport/airline indexes and the schema invariants.
 *
 *   npx tsx scripts/verify-runtime-generated.ts
 *
 * Checks per overlay file:
 *   - parses under GeneratedOverlaySchema (duplicate directional routes,
 *     confidence windows, designator/carrier prefix, license/strategy)
 *   - every origin/destination exists in `public/data/airports.json`
 *   - every airline_iata exists in `public/data/airlines.json` OR the
 *     current alliance memberships (spec §5.4 — overlays legitimately
 *     cover alliance carriers outside the small curated airline list)
 *
 * Exits non-zero on the first failure. Invoked from CI whenever a
 * `runtime-generated-*.json` file is committed.
 */

import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseGeneratedOverlay } from '../src/lib/schemas/route-network-generated.ts';

const ROOT = resolve(import.meta.dirname, '..');
const NETWORK_DIR = resolve(ROOT, 'public', 'data', 'route-network');

function loadIataSet(file: string, field: 'iata' | 'icao'): Set<string> {
  const rows = JSON.parse(readFileSync(resolve(ROOT, 'public', 'data', file), 'utf8')) as Array<{
    [key: string]: unknown;
  }>;
  const set = new Set<string>();
  for (const row of rows) {
    const value = row[field];
    if (typeof value === 'string') set.add(value.toUpperCase());
  }
  return set;
}

/**
 * Alliance memberships (`public/data/alliances/current.json`) are a second
 * valid airline index. Spec §5.4 says a generated overlay's airline_iata
 * must exist in `airlines.json` OR `alliance_membership` — ADS-B candidate
 * overlays legitimately cover alliance carriers (e.g. ITY/AZ) that are not
 * part of the small curated 45-airline list but are current members.
 */
function loadAllianceMemberIatas(): Set<string> {
  const raw = JSON.parse(
    readFileSync(resolve(ROOT, 'public', 'data', 'alliances', 'current.json'), 'utf8'),
  ) as {
    memberships?: Array<{ airline?: unknown; status?: unknown }>;
  };
  const set = new Set<string>();
  for (const row of raw.memberships ?? []) {
    if (typeof row.airline === 'string' && (row.status === undefined || row.status === 'member')) {
      set.add(row.airline.toUpperCase());
    }
  }
  return set;
}

function main(): void {
  const airportIatas = loadIataSet('airports.json', 'iata');
  const airlineIatas = new Set([
    ...loadIataSet('airlines.json', 'iata'),
    ...loadAllianceMemberIatas(),
  ]);

  const files = readdirSync(NETWORK_DIR)
    .filter((name) => /^runtime-generated-\d{4}-\d{2}\.json$/.test(name))
    .sort();
  if (files.length === 0) {
    console.log('No generated overlays committed — nothing to verify.');
    return;
  }

  let checked = 0;
  let routes = 0;
  for (const file of files) {
    const overlay = parseGeneratedOverlay(
      JSON.parse(readFileSync(resolve(NETWORK_DIR, file), 'utf8')),
    );
    for (const [idx, route] of overlay.routes.entries()) {
      if (!airportIatas.has(route.origin)) {
        throw new Error(`${file}: route ${idx} origin ${route.origin} missing from airports.json`);
      }
      if (!airportIatas.has(route.destination)) {
        throw new Error(`${file}: route ${idx} destination ${route.destination} missing from airports.json`);
      }
      if (!airlineIatas.has(route.airline_iata)) {
        throw new Error(`${file}: route ${idx} carrier ${route.airline_iata} missing from airlines.json`);
      }
      routes += 1;
    }
    checked += 1;
    console.log(`✓ ${file} — ${overlay.routes.length} routes`);
  }
  console.log(`Verified ${checked} overlay file(s), ${routes} routes.`);
}

main();
