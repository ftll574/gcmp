import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import airportsRaw from '../public/data/airports.json' with { type: 'json' };
import { RouteNetworkCatalogSchema } from '../src/lib/schemas/route-network.ts';
import { activeAllianceAirlineCodes } from './lib/alliance-airline-icao.ts';

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

function currentPairs(paths: string[]): Set<string> {
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

const callsignPath = resolve(process.argv[2] ?? 'E:/workspace/.gcmp-route-work/adsbiq-alliance-callsigns-20260801-0906.json');
const standingRoot = resolve(process.argv[3] ?? 'E:/workspace/.gcmp-route-work/standing-data/routes/schema-01');
const sitemapPaths = (process.argv[4] ?? 'E:/workspace/.gcmp-route-work/air-routes-routes-1.xml;E:/workspace/.gcmp-route-work/air-routes-routes-2.xml')
  .split(';').map((path) => resolve(path));
const output = resolve(process.argv[5] ?? 'public/data/route-network/recent-current.json');
const rawCallsigns = readFileSync(callsignPath);
const snapshot = JSON.parse(rawCallsigns.toString('utf8')) as CallsignSnapshot;
if (snapshot.version !== 1 || snapshot.from !== '2026-08-01' || snapshot.until !== '2026-09-06') {
  throw new Error('Unexpected ADSBiq callsign snapshot window');
}
if ((snapshot.missingDates ?? []).some((date) => date !== '2026-08-30')) {
  throw new Error(`Unexpected ADSBiq missing dates: ${(snapshot.missingDates ?? []).join(',')}`);
}

const airlineCodes = activeAllianceAirlineCodes('2026-09-08');
const observedCallsigns = new Set(snapshot.callsigns.map((value) => value.trim().toUpperCase()).filter(Boolean));
const airportByIcao = new Map(airportsRaw.flatMap((airport) => airport.icao ? [[airport.icao, airport.iata] as const] : []));
const knownIata = new Set(airportsRaw.map((airport) => airport.iata));
const activePairs = currentPairs(sitemapPaths);
const sourceIds = ['adsbiq-20260801-0906', 'vrs-standing-data-20260907-recent', 'air-routes-current-pair-index-20260908-recent'];
const routeKeys = new Set<string>();
const routes: Array<{ carrier: string; pair: [string, string]; service: 'nonstop'; status: 'published'; sourceIds: string[]; effectiveFrom: string; effectiveUntil: string }> = [];
const counts = new Map<string, number>();
let matchedCallsigns = 0;
let unmappedAirportSegments = 0;

for (const { iata, icao } of airlineCodes) {
  const directory = resolve(standingRoot, icao[0]!);
  const allFile = resolve(directory, `${icao}-all.csv`);
  const routeFiles = existsSync(allFile)
    ? [allFile]
    : readdirSync(directory)
      .filter((name) => name.startsWith(`${icao}-`) && name.endsWith('.csv'))
      .sort()
      .map((name) => resolve(directory, name));
  if (routeFiles.length === 0) throw new Error(`Missing standing-data route files for ${icao}`);
  for (const routeFile of routeFiles) {
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
        const key = `${iata}:${pair}`;
        if (routeKeys.has(key)) continue;
        routeKeys.add(key);
        routes.push({ carrier: iata, pair: [from, to], service: 'nonstop', status: 'published', sourceIds,
          effectiveFrom: '2026-09-08', effectiveUntil: '2026-10-07' });
        counts.set(iata, (counts.get(iata) ?? 0) + 1);
      }
    }
  }
}

const represented = [...counts.keys()].sort();
const catalog = RouteNetworkCatalogSchema.parse({
  version: '2026.3', coverage: 'curated-not-complete',
  sources: [
    {
      id: 'adsbiq-20260801-0906',
      url: 'https://github.com/Sky-Power-Services/adsbiq-data/releases',
      checkedOn: '2026-09-08',
      note: `ODbL ADSBiq aircraft-diff observations from 2026-08-01 through 2026-09-06, using the public 2026-08 and 2026-09 release assets. Only exact active-alliance callsigns observed during this recent window are considered; observation alone does not provide an airport pair. Missing upstream daily assets: ${(snapshot.missingDates ?? []).join(', ') || 'none'}.`,
    },
    {
      id: 'vrs-standing-data-20260907-recent',
      url: 'https://github.com/vradarserver/standing-data/commit/3c4afbf23a9933c00bcd8db514b4af21ae86e4a2',
      checkedOn: '2026-09-07',
      note: 'CC0 standing-data exact callsign-to-route mapping. A route is retained only when the exact callsign was actually observed in the Aug 1-Sep 6 ADSBiq window.',
    },
    {
      id: 'air-routes-current-pair-index-20260908-recent',
      url: 'https://air-routes.com/sitemap.xml',
      checkedOn: '2026-09-08',
      note: `Public search-index sitemap additionally confirms each retained physical pair remains in the current scheduled-passenger route index (${activePairs.size.toLocaleString('en-US')} directional pairs).`,
    },
  ],
  carrierUniverses: represented.map((carrier) => ({
    carrier, scope: 'partial', asOf: '2026-09-08', sourceIds,
    note: 'Recent observed operating-route layer: exact alliance callsign observed Aug 1-Sep 6, resolved through Sep 7 standing-data, and corroborated by Sep 8 current physical-pair presence. Partial because actual observation can still miss dormant/future seasonal service and affiliate marketing attribution.',
  })),
  routes: routes.sort((a, b) => a.carrier.localeCompare(b.carrier) || a.pair[0].localeCompare(b.pair[0]) || a.pair[1].localeCompare(b.pair[1])),
});
writeFileSync(output, `${JSON.stringify(catalog)}\n`);
console.log(JSON.stringify({
  output,
  callsignSnapshotSha256: createHash('sha256').update(rawCallsigns).digest('hex'),
  observedCallsigns: observedCallsigns.size,
  matchedCallsigns,
  unmappedAirportSegments,
  routes: catalog.routes.length,
  carriers: catalog.carrierUniverses.length,
  missingCarriers: airlineCodes.map((row) => row.iata).filter((carrier) => !counts.has(carrier)),
  byCarrier: Object.fromEntries([...counts].sort(([a], [b]) => a.localeCompare(b))),
}, null, 2));
