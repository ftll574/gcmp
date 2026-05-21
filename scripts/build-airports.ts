/**
 * Build-time script: download the Our Airports CSV, filter to commercial
 * IATA airports, emit `public/data/airports.json`.
 *
 * Usage:
 *   npx tsx scripts/build-airports.ts
 *
 * Output schema (sorted by IATA code):
 *   [{ iata, icao, name, city, country, lat, lon }, ...]
 *
 * Filter: type ∈ {large_airport, medium_airport} AND iata_code is non-empty.
 * This yields ~5-6k airports — every commercial airport you'll ever route
 * through. Re-run quarterly to pick up new airports / renamed cities.
 */

import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

const SOURCE_URL = 'https://davidmegginson.github.io/ourairports-data/airports.csv';
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
  const res = await fetch(SOURCE_URL);
  if (!res.ok) {
    throw new Error(`Fetch failed: ${res.status} ${res.statusText}`);
  }
  const csv = await res.text();
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
    if (!type || !ALLOW_TYPES.has(type)) continue;
    const iataRaw = cells[idxIata];
    if (!iataRaw || iataRaw.length !== 3) continue;
    const lat = Number(cells[idxLat]);
    const lon = Number(cells[idxLon]);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;

    const airport: Airport = {
      iata: iataRaw.toUpperCase(),
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

  out.sort((a, b) => a.iata.localeCompare(b.iata));

  mkdirSync(dirname(OUTPUT), { recursive: true });
  writeFileSync(OUTPUT, JSON.stringify(out));
  console.log(`Wrote ${out.length} airports → ${OUTPUT}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
