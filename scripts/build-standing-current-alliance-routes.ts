import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import airportsRaw from '../public/data/airports.json' with { type: 'json' };
import alliancesRaw from '../public/data/alliances/current.json' with { type: 'json' };
import { AllianceCatalogSchema } from '../src/lib/schemas/alliance.ts';
import { RouteNetworkCatalogSchema } from '../src/lib/schemas/route-network.ts';

interface CrosscheckCarrier { standingCurrent?: string[] }
interface Crosscheck { currentPairCount: number; carriers: Record<string, CrosscheckCarrier> }

const input = resolve(process.argv[2] ?? 'E:/workspace/.gcmp-route-work/current-pair-crosscheck.json');
const output = resolve(process.argv[3] ?? 'public/data/route-network/standing-current.json');
const inputBytes = readFileSync(input);
const crosscheck = JSON.parse(inputBytes.toString('utf8')) as Crosscheck;
const knownAirports = new Set(airportsRaw.map((airport) => airport.iata));
const alliances = AllianceCatalogSchema.parse(alliancesRaw);
const asOf = '2026-09-08';
const activeMembers = new Set(alliances.memberships
  .filter((membership) => membership.status === 'member'
    && (!membership.effectiveFrom || membership.effectiveFrom <= asOf)
    && (!membership.effectiveTo || membership.effectiveTo >= asOf))
  .map((membership) => membership.airline));
const sourceIds = ['vrs-standing-data-20260907-candidate', 'air-routes-current-pair-index-20260908-standing'];
const routes: Array<{
  carrier: string;
  pair: [string, string];
  service: 'nonstop';
  status: 'published';
  carrierIdentity: 'provider-listed';
  sourceIds: string[];
  effectiveFrom: string;
  effectiveUntil: string;
}> = [];
const represented = new Set<string>();

for (const carrier of [...activeMembers].sort()) {
  const value = crosscheck.carriers[carrier];
  for (const pair of [...new Set(value?.standingCurrent ?? [])].sort()) {
    const [from, to] = pair.split('>');
    if (!from || !to || !knownAirports.has(from) || !knownAirports.has(to)) {
      throw new Error(`Unknown/invalid airport in standing candidate ${carrier}:${pair}`);
    }
    routes.push({
      carrier,
      pair: [from, to],
      service: 'nonstop',
      status: 'published',
      carrierIdentity: 'provider-listed',
      sourceIds,
      effectiveFrom: asOf,
      effectiveUntil: '2026-10-07',
    });
    represented.add(carrier);
  }
}

const catalog = RouteNetworkCatalogSchema.parse({
  version: '2026.3',
  coverage: 'curated-not-complete',
  sources: [
    {
      id: 'vrs-standing-data-20260907-candidate',
      url: 'https://github.com/vradarserver/standing-data/commit/3c4afbf23a9933c00bcd8db514b4af21ae86e4a2',
      checkedOn: '2026-09-07',
      note: 'CC0 callsign-to-route dictionary used as a high-recall carrier attribution candidate. A standing row can outlive active service, so it is never operating-carrier proof by itself.',
    },
    {
      id: 'air-routes-current-pair-index-20260908-standing',
      url: 'https://air-routes.com/sitemap.xml',
      checkedOn: asOf,
      note: `Each retained physical airport pair is still present in the public current scheduled-passenger route sitemap (${crosscheck.currentPairCount.toLocaleString('en-US')} directional pairs). This confirms the pair, not the listed carrier identity.`,
    },
  ],
  carrierUniverses: [...represented].sort().map((carrier) => ({
    carrier,
    scope: 'partial',
    asOf,
    sourceIds,
    note: 'High-recall candidate universe from current physical-pair presence plus a current-maintained callsign route dictionary. Every route remains provider-listed until recent observation, official schedule, or dated operator evidence confirms the carrier identity.',
  })),
  routes,
});
writeFileSync(output, `${JSON.stringify(catalog)}\n`);
console.log(JSON.stringify({
  output,
  inputSha256: createHash('sha256').update(inputBytes).digest('hex'),
  routes: catalog.routes.length,
  carriers: catalog.carrierUniverses.length,
  missingActiveMembers: [...activeMembers].filter((carrier) => !represented.has(carrier)).sort(),
}, null, 2));
