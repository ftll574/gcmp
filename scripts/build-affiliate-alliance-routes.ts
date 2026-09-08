import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import airportsRaw from '../public/data/airports.json' with { type: 'json' };
import { RouteNetworkCatalogSchema, type RouteNetworkEntry } from '../src/lib/schemas/route-network.ts';
import { allianceAffiliateOperators } from './lib/alliance-affiliate-operators.ts';

interface CallsignSnapshot {
  version: 1;
  from: string;
  until: string;
  sourceUrls: string[];
  missingDates?: string[];
  callsigns: string[];
}

function parseCsvLine(line: string): string[] {
  const fields: string[] = [];
  let field = '';
  let quoted = false;
  for (let index = 0; index < line.length; index++) {
    const char = line[index]!;
    if (quoted) {
      if (char === '"') {
        if (line[index + 1] === '"') { field += '"'; index++; }
        else quoted = false;
      } else field += char;
    } else if (char === '"') quoted = true;
    else if (char === ',') { fields.push(field); field = ''; }
    else field += char;
  }
  fields.push(field.replace(/\r$/, ''));
  return fields;
}

function activePairsFromSitemaps(paths: string[]): Set<string> {
  const result = new Set<string>();
  for (const path of paths) {
    const xml = readFileSync(path, 'utf8');
    for (const match of xml.matchAll(/https:\/\/air-routes\.com\/r\/([A-Z]{3})-([A-Z]{3})/g)) {
      result.add(`${match[1]}>${match[2]}`);
    }
  }
  if (result.size < 60_000) throw new Error(`Current route-pair sitemap unexpectedly small: ${result.size}`);
  return result;
}

function routeFilesFor(standingRoot: string, icao: string): string[] {
  const directory = resolve(standingRoot, icao[0]!);
  const allFile = resolve(directory, `${icao}-all.csv`);
  if (existsSync(allFile)) return [allFile];
  if (!existsSync(directory)) return [];
  return readdirSync(directory)
    .filter((name) => name.startsWith(`${icao}-`) && name.endsWith('.csv'))
    .sort()
    .map((name) => resolve(directory, name));
}

const callsignPath = resolve(process.argv[2] ?? 'E:/workspace/.gcmp-route-work/adsbiq-affiliate-callsigns-20260801-0906.json');
const standingRoot = resolve(process.argv[3] ?? 'E:/workspace/.gcmp-route-work/standing-data/routes/schema-01');
const sitemapPaths = (process.argv[4] ?? 'E:/workspace/.gcmp-route-work/air-routes-routes-1.xml;E:/workspace/.gcmp-route-work/air-routes-routes-2.xml')
  .split(';').map((path) => resolve(path));
const output = resolve(process.argv[5] ?? 'public/data/route-network/affiliate-current.json');
const rawCallsigns = readFileSync(callsignPath);
const snapshot = JSON.parse(rawCallsigns.toString('utf8')) as CallsignSnapshot;
if (snapshot.version !== 1 || snapshot.from !== '2026-08-01' || snapshot.until !== '2026-09-06') {
  throw new Error('Unexpected affiliate ADSBiq callsign snapshot window');
}
if ((snapshot.missingDates ?? []).some((date) => date !== '2026-08-30')) {
  throw new Error(`Unexpected ADSBiq missing dates: ${(snapshot.missingDates ?? []).join(',')}`);
}

const activePairs = activePairsFromSitemaps(sitemapPaths);
const observedCallsigns = new Set(snapshot.callsigns.map((value) => value.trim().toUpperCase()).filter(Boolean));
const airportByIcao = new Map(airportsRaw.flatMap((airport) => airport.icao ? [[airport.icao, airport.iata] as const] : []));
const knownIata = new Set(airportsRaw.map((airport) => airport.iata));
const commonSourceIds = ['adsbiq-affiliates-20260801-0906', 'vrs-standing-data-20260907-affiliates', 'air-routes-current-pair-index-20260908-affiliates'];
const relationshipSourceId = (brand: string, operatorIcao: string): string =>
  `affiliate-${brand.toLowerCase()}-${operatorIcao.toLowerCase()}`;

type MutableRoute = RouteNetworkEntry & { sourceIds: string[] };
const routes = new Map<string, MutableRoute>();
const byBrand = new Map<string, { routes: Set<string>; airports: Set<string>; operators: Set<string> }>();
let matchedCallsigns = 0;
let unmappedAirportSegments = 0;

for (const mapping of allianceAffiliateOperators) {
  const files = routeFilesFor(standingRoot, mapping.operatorIcao);
  if (files.length === 0) throw new Error(`Missing standing-data route files for affiliate ${mapping.operatorIcao}`);
  for (const routeFile of files) {
    const lines = readFileSync(routeFile, 'utf8').replace(/^\uFEFF/, '').split(/\r?\n/);
    const header = parseCsvLine(lines.shift() ?? '');
    const callsignIndex = header.indexOf('Callsign');
    const airportsIndex = header.indexOf('AirportCodes');
    if (callsignIndex < 0 || airportsIndex < 0) throw new Error(`Invalid standing-data route file ${routeFile}`);
    for (const line of lines) {
      if (!line) continue;
      const fields = parseCsvLine(line);
      const callsign = fields[callsignIndex]?.trim().toUpperCase();
      if (!callsign || !observedCallsigns.has(callsign)) continue;
      matchedCallsigns++;
      const path = fields[airportsIndex]?.trim().toUpperCase().split('-').filter(Boolean) ?? [];
      for (let index = 0; index + 1 < path.length; index++) {
        const from = airportByIcao.get(path[index]!);
        const to = airportByIcao.get(path[index + 1]!);
        if (!from || !to) { unmappedAirportSegments++; continue; }
        if (!knownIata.has(from) || !knownIata.has(to)) throw new Error(`Resolved unknown IATA ${from}>${to}`);
        const pair = `${from}>${to}`;
        if (!activePairs.has(pair)) continue;
        const key = `${mapping.brand}:${pair}`;
        const relationId = relationshipSourceId(mapping.brand, mapping.operatorIcao);
        const existing = routes.get(key);
        if (existing) {
          if (!existing.sourceIds.includes(relationId)) existing.sourceIds.push(relationId);
        } else {
          routes.set(key, {
            carrier: mapping.brand,
            pair: [from, to],
            service: 'nonstop',
            status: 'published',
            carrierIdentity: 'provider-listed',
            sourceIds: [...commonSourceIds, relationId],
            effectiveFrom: '2026-09-08',
            effectiveUntil: '2026-10-07',
          });
        }
        let summary = byBrand.get(mapping.brand);
        if (!summary) {
          summary = { routes: new Set(), airports: new Set(), operators: new Set() };
          byBrand.set(mapping.brand, summary);
        }
        summary.routes.add(pair); summary.airports.add(from); summary.airports.add(to); summary.operators.add(mapping.operatorIcao);
      }
    }
  }
}

const sources = [
  {
    id: 'adsbiq-affiliates-20260801-0906',
    url: 'https://github.com/Sky-Power-Services/adsbiq-data/releases',
    checkedOn: '2026-09-08',
    note: `ODbL ADSBiq observations from 2026-08-01 through 2026-09-06 for explicitly source-backed regional/affiliate operator ICAO prefixes. Missing upstream daily assets: ${(snapshot.missingDates ?? []).join(', ') || 'none'}.`,
  },
  {
    id: 'vrs-standing-data-20260907-affiliates',
    url: 'https://github.com/vradarserver/standing-data/commit/3c4afbf23a9933c00bcd8db514b4af21ae86e4a2',
    checkedOn: '2026-09-07',
    note: 'CC0 exact callsign-to-route lookup used only for affiliate callsigns actually observed in the ADSBiq window.',
  },
  {
    id: 'air-routes-current-pair-index-20260908-affiliates',
    url: 'https://air-routes.com/sitemap.xml',
    checkedOn: '2026-09-08',
    note: `Public route sitemap additionally confirms each retained physical pair remains in the current scheduled-passenger index (${activePairs.size.toLocaleString('en-US')} directional pairs).`,
  },
  ...allianceAffiliateOperators.map((mapping) => ({
    id: relationshipSourceId(mapping.brand, mapping.operatorIcao),
    url: mapping.sourceUrl,
    checkedOn: '2026-09-08',
    note: `${mapping.operatorName}: ${mapping.sourceNote}`,
  })),
];

const catalog = RouteNetworkCatalogSchema.parse({
  version: '2026.3', coverage: 'curated-not-complete', sources,
  carrierUniverses: [...byBrand.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([carrier, summary]) => ({
    carrier, scope: 'partial', asOf: '2026-09-08',
    sourceIds: [...commonSourceIds, ...[...summary.operators].sort().map((operator) => relationshipSourceId(carrier, operator))],
    note: 'Branded/regional affiliate route layer. Recent exact affiliate callsigns establish physical operation by the affiliate; the member airline is only a provider-listed/marketing brand until dated operator evidence resolves the selected flight.',
  })),
  routes: [...routes.values()].sort((a, b) => a.carrier.localeCompare(b.carrier) || a.pair[0].localeCompare(b.pair[0]) || a.pair[1].localeCompare(b.pair[1])),
});
writeFileSync(output, `${JSON.stringify(catalog)}\n`);
console.log(JSON.stringify({
  output,
  callsignSnapshotSha256: createHash('sha256').update(rawCallsigns).digest('hex'),
  observedCallsigns: observedCallsigns.size,
  matchedCallsigns,
  unmappedAirportSegments,
  routes: catalog.routes.length,
  brands: Object.fromEntries([...byBrand.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([brand, value]) => [brand, {
    routes: value.routes.size, airports: value.airports.size, operators: [...value.operators].sort(),
  }])),
}, null, 2));
