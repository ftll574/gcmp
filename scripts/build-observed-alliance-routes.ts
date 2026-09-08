import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import airportsRaw from '../public/data/airports.json' with { type: 'json' };
import alliancesRaw from '../public/data/alliances/current.json' with { type: 'json' };
import { AllianceCatalogSchema } from '../src/lib/schemas/alliance.ts';
import { RouteNetworkCatalogSchema } from '../src/lib/schemas/route-network.ts';

interface CrosscheckCarrier {
  alliance: 'oneworld' | 'star' | 'skyteam';
  q2Current?: string[];
  standingCurrent?: string[];
}
interface Crosscheck {
  currentPairCount: number;
  carriers: Record<string, CrosscheckCarrier>;
}

const input = resolve(process.argv[2] ?? 'E:/workspace/.gcmp-route-work/current-pair-crosscheck.json');
const output = resolve(process.argv[3] ?? 'public/data/route-network/observed-current.json');
const inputBytes = readFileSync(input);
const crosscheck = JSON.parse(inputBytes.toString('utf8')) as Crosscheck;
const checkedOn = '2026-09-08';
const effectiveUntil = '2026-10-07';
const knownAirports = new Set(airportsRaw.map((airport) => airport.iata));
const alliances = AllianceCatalogSchema.parse(alliancesRaw);
const activeMembers = new Set(alliances.memberships
  .filter((membership) => membership.status === 'member'
    && (!membership.effectiveFrom || membership.effectiveFrom <= checkedOn)
    && (!membership.effectiveTo || membership.effectiveTo >= checkedOn))
  .map((membership) => membership.airline));

const sourceIds = ['mr-airspace-q2-passenger', 'vrs-standing-data-20260907', 'air-routes-current-pair-index-20260908'];
const routes: Array<{ carrier: string; pair: [string, string]; service: 'nonstop'; status: 'published'; sourceIds: string[]; effectiveFrom: string; effectiveUntil: string }> = [];
const represented = new Set<string>();

for (const [carrier, value] of Object.entries(crosscheck.carriers).sort(([a], [b]) => a.localeCompare(b))) {
  if (!activeMembers.has(carrier)) continue;
  const q2 = new Set(value.q2Current ?? []);
  const standing = new Set(value.standingCurrent ?? []);
  for (const pair of [...q2].filter((candidate) => standing.has(candidate)).sort()) {
    const [from, to] = pair.split('>');
    if (!from || !to || !knownAirports.has(from) || !knownAirports.has(to)) {
      throw new Error(`Unknown/invalid airport in ${carrier}:${pair}`);
    }
    routes.push({ carrier, pair: [from, to], service: 'nonstop', status: 'published', sourceIds,
      effectiveFrom: checkedOn, effectiveUntil });
    represented.add(carrier);
  }
}

const catalog = RouteNetworkCatalogSchema.parse({
  version: '2026.3',
  coverage: 'curated-not-complete',
  sources: [
    {
      id: 'mr-airspace-q2-passenger',
      url: 'https://github.com/MrAirspace/aircraft-flight-schedules/releases/tag/aircraft_flight_schedules_2026_quarter2',
      checkedOn,
      note: '2026-Q2 worldwide ADS-B-derived passenger-flight observations. GCMP retains only callsign-validated directional routes with at least two known non-cargo passenger-config observations; this is recent-operation evidence, not a September timetable.',
    },
    {
      id: 'vrs-standing-data-20260907',
      url: 'https://github.com/vradarserver/standing-data/commit/3c4afbf23a9933c00bcd8db514b4af21ae86e4a2',
      checkedOn: '2026-09-07',
      note: 'CC0 Virtual Radar Server standing-data callsign-to-route mapping at the pinned commit. Used only to corroborate the observed carrier/route identity; standing-data alone is not treated as an active timetable.',
    },
    {
      id: 'air-routes-current-pair-index-20260908',
      url: 'https://air-routes.com/sitemap.xml',
      checkedOn,
      note: `Public search-index route sitemap confirmed that each retained physical airport pair remained present in the current scheduled-passenger route index (${crosscheck.currentPairCount.toLocaleString('en-US')} indexed directional pairs). It does not establish the operating carrier by itself.`,
    },
  ],
  carrierUniverses: [...represented].sort().map((carrier) => ({
    carrier,
    scope: 'partial',
    asOf: checkedOn,
    sourceIds,
    note: 'Broad corroborated observed-current route universe: Q2 passenger operation + current standing callsign mapping + current physical route-pair presence. It is intentionally partial until carrier-wide current denominator/affiliate/seasonal parity is independently closed.',
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
