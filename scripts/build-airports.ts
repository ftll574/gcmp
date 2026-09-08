/**
 * Build-time script: download the Our Airports CSV plus the public current
 * passenger-airport sitemap, then emit `public/data/airports.json`.
 *
 * Usage:
 *   npx tsx scripts/build-airports.ts
 *
 * Output schema (sorted by IATA code):
 *   [{ iata, icao, name, city, country, lat, lon }, ...]
 *
 * Filter: iata_code is non-empty AND either:
 *   - type ∈ {large_airport, medium_airport}; or
 *   - the IATA code appears in the current scheduled-passenger airport
 *     sitemap.
 *
 * The second clause is intentional. Many alliance partners serve legitimate
 * small airports; a size-only filter made live route discovery silently drop
 * those destinations even when a current passenger route provider listed
 * them. The sitemap is used only as an airport-universe inclusion list — no
 * route or carrier data is bulk-extracted here.
 */

import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

const SOURCE_URL = 'https://davidmegginson.github.io/ourairports-data/airports.csv';
const CURRENT_PASSENGER_AIRPORT_SITEMAP = 'https://air-routes.com/sitemap-airports.xml';
const OUTPUT = resolve(import.meta.dirname, '..', 'public', 'data', 'airports.json');

interface Airport {
  iata: string;
  icao?: string;
  name: string;
  city: string;
  country: string;
  lat: number;
  lon: number;
}

// OurAirports' 2026-09-08 daily CSV unexpectedly omits Palm Beach
// International even though it is a current scheduled-passenger airport.
// Keep the exception explicit and narrow. Coordinates are the FAA AIP
// aerodrome reference point for KPBI (26-40-59.382N / 80-05-44.131W).
const CURRENT_PASSENGER_OVERRIDES: Readonly<Record<string, Airport>> = {
  PBI: {
    iata: 'PBI',
    icao: 'KPBI',
    name: 'Palm Beach International Airport',
    city: 'West Palm Beach',
    country: 'US',
    lat: 26.683161666666667,
    lon: -80.09559194444444,
  },
};

function parseCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (inQuotes) {
      if (c === '"' && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else if (c === '"') {
        inQuotes = false;
      } else {
        cur += c;
      }
    } else {
      if (c === ',') {
        out.push(cur);
        cur = '';
      } else if (c === '"') {
        inQuotes = true;
      } else {
        cur += c;
      }
    }
  }
  out.push(cur);
  return out;
}

async function main(): Promise<void> {
  console.log(`Fetching ${SOURCE_URL}…`);
  console.log(`Fetching ${CURRENT_PASSENGER_AIRPORT_SITEMAP}…`);
  const [res, passengerRes] = await Promise.all([
    fetch(SOURCE_URL),
    fetch(CURRENT_PASSENGER_AIRPORT_SITEMAP),
  ]);
  if (!res.ok) throw new Error(`OurAirports fetch failed: ${res.status} ${res.statusText}`);
  if (!passengerRes.ok) throw new Error(`Passenger-airport sitemap fetch failed: ${passengerRes.status} ${passengerRes.statusText}`);
  const [csv, passengerXml] = await Promise.all([res.text(), passengerRes.text()]);
  const currentPassengerIata = new Set(
    [...passengerXml.matchAll(/<loc>https:\/\/air-routes\.com\/airport-routes-[^<]*-([A-Z]{3})<\/loc>/g)]
      .map((match) => match[1] as string),
  );
  if (currentPassengerIata.size < 2_500) {
    throw new Error(`Passenger-airport sitemap unexpectedly small: ${currentPassengerIata.size}`);
  }
  const lines = csv.split('\n').filter((l) => l.length > 0);
  const headerLine = lines.shift();
  if (!headerLine) throw new Error('Empty CSV');
  const header = parseCsvLine(headerLine).map((h) => h.trim().replace(/^"|"$/g, ''));

  const col = (name: string): number => {
    const idx = header.indexOf(name);
    if (idx === -1) throw new Error(`Missing column "${name}"`);
    return idx;
  };

  const idxType = col('type');
  const idxIata = col('iata_code');
  const idxIcao = col('ident'); // Our Airports uses `ident` for ICAO-style identifiers
  const idxName = col('name');
  const idxCity = col('municipality');
  const idxCountry = col('iso_country');
  const idxLat = col('latitude_deg');
  const idxLon = col('longitude_deg');

  const out: Airport[] = [];
  const ALLOW_TYPES = new Set(['large_airport', 'medium_airport']);

  for (const line of lines) {
    const cells = parseCsvLine(line);
    const type = cells[idxType];
    const iataRaw = cells[idxIata];
    if (!iataRaw || iataRaw.length !== 3) continue;
    const iata = iataRaw.toUpperCase();
    if (!type || (!ALLOW_TYPES.has(type) && !currentPassengerIata.has(iata))) continue;
    const lat = Number(cells[idxLat]);
    const lon = Number(cells[idxLon]);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;

    const airport: Airport = {
      iata,
      name: cells[idxName] ?? '',
      city: cells[idxCity] ?? '',
      country: cells[idxCountry] ?? '',
      lat,
      lon,
    };
    const icao = cells[idxIcao];
    if (icao && icao.length === 4) {
      airport.icao = icao.toUpperCase();
    }
    out.push(airport);
  }

  const existingIata = new Set(out.map((airport) => airport.iata));
  for (const [iata, airport] of Object.entries(CURRENT_PASSENGER_OVERRIDES)) {
    if (currentPassengerIata.has(iata) && !existingIata.has(iata)) {
      out.push(airport);
      existingIata.add(iata);
    }
  }

  out.sort((a, b) => a.iata.localeCompare(b.iata));

  const coveredPassengerAirports = new Set(out.map((airport) => airport.iata));
  const missingPassengerAirports = [...currentPassengerIata].filter((iata) => !coveredPassengerAirports.has(iata));
  if (missingPassengerAirports.length > 0) {
    throw new Error(`OurAirports is missing ${missingPassengerAirports.length} current passenger IATA codes: ${missingPassengerAirports.slice(0, 20).join(', ')}`);
  }
  mkdirSync(dirname(OUTPUT), { recursive: true });
  writeFileSync(OUTPUT, JSON.stringify(out));
  console.log(`Wrote ${out.length} airports (${currentPassengerIata.size} current passenger airports covered) → ${OUTPUT}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
