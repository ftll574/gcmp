import { createHash } from 'node:crypto';
import { createReadStream, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createInterface } from 'node:readline';
import airportsRaw from '../public/data/airports.json' with { type: 'json' };
import { RouteNetworkCatalogSchema } from '../src/lib/schemas/route-network.ts';

const TARGET = new Set(['AA', 'AS', 'DL', 'UA']);
const checkedOn = '2026-09-08';
const effectiveUntil = '2026-10-07';

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
  if (quoted) throw new Error('Unterminated CSV quote');
  fields.push(field.replace(/\r$/, ''));
  return fields;
}

function currentPairsFromSitemaps(paths: string[]): Set<string> {
  const pairs = new Set<string>();
  for (const path of paths) {
    const xml = readFileSync(path, 'utf8');
    for (const match of xml.matchAll(/https:\/\/air-routes\.com\/r\/([A-Z]{3})-([A-Z]{3})/g)) {
      pairs.add(`${match[1]}>${match[2]}`);
    }
  }
  return pairs;
}

async function main(): Promise<void> {
  const csvPath = resolve(process.argv[2] ?? 'E:/workspace/.gcmp-route-work/bts/marketing-2026-06/On_Time_Marketing_Carrier_On_Time_Performance_(Beginning_January_2018)_2026_6.csv');
  const sitemapPaths = (process.argv[3] ?? 'E:/workspace/.gcmp-route-work/air-routes-routes-1.xml;E:/workspace/.gcmp-route-work/air-routes-routes-2.xml')
    .split(';').map((path) => resolve(path));
  const output = resolve(process.argv[4] ?? 'public/data/route-network/bts-marketing-current.json');
  const knownAirports = new Set(airportsRaw.map((airport) => airport.iata));
  const currentPairs = currentPairsFromSitemaps(sitemapPaths);
  if (currentPairs.size < 60_000) throw new Error(`Current route-pair sitemap unexpectedly small: ${currentPairs.size}`);

  const marketed = new Map<string, Set<string>>([...TARGET].map((carrier) => [carrier, new Set()]));
  const inputHash = createHash('sha256');
  const input = createReadStream(csvPath, { encoding: 'utf8' });
  input.on('data', (chunk) => inputHash.update(chunk));
  const lines = createInterface({ input, crlfDelay: Infinity });
  let header: string[] | null = null;
  let marketingIndex = -1;
  let originIndex = -1;
  let destIndex = -1;
  let rowCount = 0;

  for await (const line of lines) {
    const fields = parseCsvLine(line);
    if (!header) {
      header = fields;
      marketingIndex = header.indexOf('IATA_Code_Marketing_Airline');
      originIndex = header.indexOf('Origin');
      destIndex = header.indexOf('Dest');
      if ([marketingIndex, originIndex, destIndex].some((index) => index < 0)) throw new Error('Required BTS marketing columns missing');
      continue;
    }
    rowCount++;
    const carrier = fields[marketingIndex]?.trim().toUpperCase();
    if (!carrier || !TARGET.has(carrier)) continue;
    const from = fields[originIndex]?.trim().toUpperCase();
    const to = fields[destIndex]?.trim().toUpperCase();
    if (!from || !to || !/^[A-Z]{3}$/.test(from) || !/^[A-Z]{3}$/.test(to)) continue;
    marketed.get(carrier)!.add(`${from}>${to}`);
  }

  const sourceIds = ['bts-marketing-carrier-202606', 'air-routes-current-pair-index-20260908-bts'];
  const routes: Array<{ carrier: string; pair: [string, string]; service: 'nonstop'; status: 'published'; carrierIdentity: 'provider-listed'; sourceIds: string[]; effectiveFrom: string; effectiveUntil: string }> = [];
  const summary: Record<string, { junePairs: number; currentPairs: number; airports: number }> = {};
  for (const carrier of [...TARGET].sort()) {
    const junePairs = marketed.get(carrier)!;
    const retained = [...junePairs].filter((pair) => currentPairs.has(pair)).sort();
    const airports = new Set<string>();
    for (const pair of retained) {
      const [from, to] = pair.split('>');
      if (!from || !to || !knownAirports.has(from) || !knownAirports.has(to)) throw new Error(`Unknown BTS airport ${carrier}:${pair}`);
      airports.add(from); airports.add(to);
      routes.push({ carrier, pair: [from, to], service: 'nonstop', status: 'published', carrierIdentity: 'provider-listed', sourceIds,
        effectiveFrom: checkedOn, effectiveUntil });
    }
    summary[carrier] = { junePairs: junePairs.size, currentPairs: retained.length, airports: airports.size };
  }

  const catalog = RouteNetworkCatalogSchema.parse({
    version: '2026.3',
    coverage: 'curated-not-complete',
    sources: [
      {
        id: 'bts-marketing-carrier-202606',
        url: 'https://transtats.bts.gov/PREZIP/On_Time_Marketing_Carrier_On_Time_Performance_Beginning_January_2018_2026_6.zip',
        checkedOn,
        publishedOn: '2026-08-12',
        note: 'U.S. DOT BTS June 2026 Marketing Carrier On-Time Performance. Routes are attributed by IATA marketing carrier, so branded regional/code-share operations are assigned to AA/AS/DL/UA rather than inferred from the regional operating carrier.',
      },
      {
        id: 'air-routes-current-pair-index-20260908-bts',
        url: 'https://air-routes.com/sitemap.xml',
        checkedOn,
        note: `Public search-index sitemap corroborates that each retained June marketing-carrier physical pair remains in the current scheduled-passenger route index (${currentPairs.size.toLocaleString('en-US')} directional pairs).`,
      },
    ],
    carrierUniverses: [...TARGET].sort().map((carrier) => ({
      carrier, scope: 'partial', asOf: checkedOn, sourceIds,
      note: 'Current-correlated U.S. marketing-carrier route layer. It closes regional-brand attribution gaps but remains partial because BTS covers U.S. reported service and the June→September physical-pair correlation does not establish a complete global airline denominator.',
    })),
    routes,
  });

  writeFileSync(output, `${JSON.stringify(catalog)}\n`);
  console.log(JSON.stringify({ output, rowCount, currentPairUniverse: currentPairs.size,
    inputSha256: inputHash.digest('hex'), routes: catalog.routes.length, carriers: summary }, null, 2));
}

await main();
