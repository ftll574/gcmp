import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseAirportCatalog } from '../src/lib/schemas/airports.ts';
import { AirportBrowseRegionCatalogSchema } from '../src/lib/schemas/airport-browse-region.ts';
import { parseRouteNetworkCatalog } from '../src/lib/schemas/route-network.ts';

const SOURCE_URL = 'https://davidmegginson.github.io/ourairports-data/airports.csv';
const ROOT = resolve(import.meta.dirname, '..');
const AIRPORTS_PATH = resolve(ROOT, 'public', 'data', 'airports.json');
const RUNTIME_PATH = resolve(ROOT, 'public', 'data', 'route-network', 'runtime-current.json');
const OUTPUT_PATH = resolve(ROOT, 'public', 'data', 'geo', 'airport-browse-regions.json');

const TARGET_COUNTRIES = new Set(['US', 'CA', 'AU']);

const REGION_DEFINITIONS = [
  { id: 'us-northeast', country: 'US' },
  { id: 'us-midwest', country: 'US' },
  { id: 'us-south', country: 'US' },
  { id: 'us-west', country: 'US' },
  { id: 'us-alaska', country: 'US' },
  { id: 'us-hawaii', country: 'US' },
  { id: 'canada-pacific', country: 'CA' },
  { id: 'canada-prairies', country: 'CA' },
  { id: 'canada-central', country: 'CA' },
  { id: 'canada-atlantic', country: 'CA' },
  { id: 'canada-north', country: 'CA' },
  { id: 'australia-new-south-wales', country: 'AU' },
  { id: 'australia-victoria', country: 'AU' },
  { id: 'australia-queensland', country: 'AU' },
  { id: 'australia-western-australia', country: 'AU' },
  { id: 'australia-south-australia', country: 'AU' },
  { id: 'australia-tasmania', country: 'AU' },
  { id: 'australia-northern-territory', country: 'AU' },
  { id: 'australia-capital-territory', country: 'AU' },
] as const;

const US_NORTHEAST = new Set(['CT', 'ME', 'MA', 'NH', 'RI', 'VT', 'NJ', 'NY', 'PA']);
const US_MIDWEST = new Set(['IN', 'IL', 'MI', 'OH', 'WI', 'IA', 'KS', 'MN', 'MO', 'NE', 'ND', 'SD']);
const US_SOUTH = new Set(['DE', 'FL', 'GA', 'MD', 'NC', 'SC', 'VA', 'DC', 'WV', 'AL', 'KY', 'MS', 'TN', 'AR', 'LA', 'OK', 'TX']);
const US_WEST = new Set(['AZ', 'CO', 'ID', 'MT', 'NV', 'NM', 'UT', 'WY', 'CA', 'OR', 'WA']);

const CANADA_REGIONS: Readonly<Record<string, string>> = {
  BC: 'canada-pacific',
  AB: 'canada-prairies', SK: 'canada-prairies', MB: 'canada-prairies',
  ON: 'canada-central', QC: 'canada-central',
  NB: 'canada-atlantic', NS: 'canada-atlantic', PE: 'canada-atlantic', NL: 'canada-atlantic',
  YT: 'canada-north', NT: 'canada-north', NU: 'canada-north',
};

const AUSTRALIA_REGIONS: Readonly<Record<string, string>> = {
  NSW: 'australia-new-south-wales',
  VIC: 'australia-victoria',
  QLD: 'australia-queensland',
  WA: 'australia-western-australia',
  SA: 'australia-south-australia',
  TAS: 'australia-tasmania',
  NT: 'australia-northern-territory',
  ACT: 'australia-capital-territory',
};

// OurAirports' daily CSV currently omits PBI while GCMP keeps an explicit
// current-passenger airport override in build-airports.ts.
const SUBDIVISION_OVERRIDES: Readonly<Record<string, string>> = { PBI: 'US-FL' };

function parseCsvLine(line: string): string[] {
  const out: string[] = [];
  let current = '';
  let quoted = false;
  for (let index = 0; index < line.length; index++) {
    const char = line[index];
    if (quoted) {
      if (char === '"' && line[index + 1] === '"') {
        current += '"';
        index++;
      } else if (char === '"') {
        quoted = false;
      } else {
        current += char;
      }
    } else if (char === ',') {
      out.push(current);
      current = '';
    } else if (char === '"') {
      quoted = true;
    } else {
      current += char;
    }
  }
  out.push(current);
  return out;
}

function browseRegion(country: string, subdivision: string): string | undefined {
  const code = subdivision.slice(country.length + 1);
  if (country === 'US') {
    if (code === 'AK') return 'us-alaska';
    if (code === 'HI') return 'us-hawaii';
    if (US_NORTHEAST.has(code)) return 'us-northeast';
    if (US_MIDWEST.has(code)) return 'us-midwest';
    if (US_SOUTH.has(code)) return 'us-south';
    if (US_WEST.has(code)) return 'us-west';
    return undefined;
  }
  if (country === 'CA') return CANADA_REGIONS[code];
  if (country === 'AU') return AUSTRALIA_REGIONS[code];
  return undefined;
}

async function main(): Promise<void> {
  const airports = parseAirportCatalog(JSON.parse(readFileSync(AIRPORTS_PATH, 'utf8')));
  const airportByIata = new Map(airports.map((airport) => [airport.iata, airport] as const));
  const runtime = parseRouteNetworkCatalog(
    JSON.parse(readFileSync(RUNTIME_PATH, 'utf8')),
    new Set(airportByIata.keys()),
  );

  const response = await fetch(SOURCE_URL);
  if (!response.ok) throw new Error(`OurAirports fetch failed: HTTP ${response.status}`);
  const csv = await response.text();
  const lines = csv.split(/\r?\n/).filter(Boolean);
  const header = parseCsvLine(lines.shift() ?? '');
  const column = (name: string): number => {
    const index = header.indexOf(name);
    if (index < 0) throw new Error(`OurAirports CSV missing ${name}`);
    return index;
  };
  const iataColumn = column('iata_code');
  const countryColumn = column('iso_country');
  const subdivisionColumn = column('iso_region');

  const subdivisionByIata = new Map<string, string>();
  for (const line of lines) {
    const cells = parseCsvLine(line);
    const iata = (cells[iataColumn] ?? '').toUpperCase();
    const country = (cells[countryColumn] ?? '').toUpperCase();
    const subdivision = (cells[subdivisionColumn] ?? '').toUpperCase();
    if (!/^[A-Z]{3}$/.test(iata) || !TARGET_COUNTRIES.has(country) || !subdivision.startsWith(`${country}-`)) continue;
    const previous = subdivisionByIata.get(iata);
    if (previous !== undefined && previous !== subdivision) {
      throw new Error(`Conflicting subdivisions for ${iata}: ${previous} vs ${subdivision}`);
    }
    subdivisionByIata.set(iata, subdivision);
  }
  for (const [iata, subdivision] of Object.entries(SUBDIVISION_OVERRIDES)) subdivisionByIata.set(iata, subdivision);

  const usedIata = new Set<string>();
  for (const route of runtime.routes) {
    if (route.status !== 'published') continue;
    for (const iata of route.pair) {
      const airport = airportByIata.get(iata);
      if (airport && TARGET_COUNTRIES.has(airport.country)) usedIata.add(iata);
    }
  }

  const entries = [...usedIata].sort().map((iata) => {
    const airport = airportByIata.get(iata);
    if (!airport) throw new Error(`Runtime route uses unknown airport ${iata}`);
    const subdivision = subdivisionByIata.get(iata);
    if (!subdivision) throw new Error(`No OurAirports subdivision for current ${airport.country} route airport ${iata}`);
    const region = browseRegion(airport.country, subdivision);
    if (!region) throw new Error(`No browse-region mapping for ${iata} ${subdivision}`);
    return { iata, country: airport.country, subdivision, region };
  });

  const catalog = AirportBrowseRegionCatalogSchema.parse({
    version: '2026.1',
    convention: 'ourairports-iso-region-browse-overlay',
    checkedOn: '2026-09-09',
    sourceUrls: [SOURCE_URL],
    note: 'Browse-only airport subdivision overlay for large-country navigation. Not a fare zone, alliance rule region, or ticketing geography.',
    regions: REGION_DEFINITIONS,
    airports: entries,
  });

  writeFileSync(OUTPUT_PATH, `${JSON.stringify(catalog, null, 2)}\n`);
  const counts = new Map<string, number>();
  for (const entry of catalog.airports) counts.set(entry.region, (counts.get(entry.region) ?? 0) + 1);
  console.log(JSON.stringify({ airports: catalog.airports.length, regions: catalog.regions.length, counts: Object.fromEntries([...counts].sort()) }, null, 2));
}

void main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
