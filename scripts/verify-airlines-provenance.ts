/**
 * Verify `public/data/airlines.json` provenance against the OpenFlights
 * `airlines.dat` snapshot (ODbL-1.0).
 *
 *   npx tsx scripts/verify-airlines-provenance.ts
 *
 * The in-repo 45-row alliance-member table is a curated subset. Every IATA +
 * ICAO code pair must be found verbatim in the OpenFlights airlines.dat
 * snapshot; any row that cannot be matched makes the check fail, because the
 * meta file's `source` claim ("OpenFlights airlines.dat, 45/45 matched") must
 * stay honest. Also verifies the meta file carries the ODbL-1.0 license.
 *
 * Needs network access to fetch the snapshot (raw.githubusercontent.com).
 * Exits non-zero on the first real failure. Invoked from CI.
 */
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { parseDataFileMeta } from '../src/lib/schemas/data-file-meta.ts';

const ROOT = resolve(process.cwd());
const AIRLINES_PATH = join(ROOT, 'public', 'data', 'airlines.json');
const META_PATH = join(ROOT, 'public', 'data', 'airlines.meta.json');
const OPENFLIGHTS_URL = 'https://raw.githubusercontent.com/jpatokal/openflights/master/data/airlines.dat';

interface OpenFlightsRow {
  name: string;
  iata: string;
  icao: string;
  callsign: string;
  country: string;
  active: string;
}

function parseAirlinesDat(text: string): OpenFlightsRow[] {
  const rows: OpenFlightsRow[] = [];
  for (const line of text.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    // id,"name",alias,"iata","icao","callsign","country","active"
    const m = trimmed.match(
      /^[^,]*,"(.*?)",[^,]*,"(.*?)","(.*?)","(.*?)","(.*?)","(.*?)"$/,
    );
    if (!m) continue;
    rows.push({ name: m[1], iata: m[2], icao: m[3], callsign: m[4], country: m[5], active: m[6] });
  }
  return rows;
}

async function main(): Promise<void> {
  const airlines = JSON.parse(readFileSync(AIRLINES_PATH, 'utf8')) as Array<{
    iata: string;
    icao: string;
    name: string;
    country: string;
  }>;

  console.log(`Fetching ${OPENFLIGHTS_URL} …`);
  const res = await fetch(OPENFLIGHTS_URL);
  if (!res.ok) {
    throw new Error(`OpenFlights fetch failed: ${res.status} ${res.statusText}`);
  }
  const rows = parseAirlinesDat(await res.text());
  console.log(`OpenFlights snapshot rows: ${rows.length}`);

  const unmatched: string[] = [];
  let exact = 0;
  for (const a of airlines) {
    const hit = rows.some((r) => r.iata === a.iata && r.icao === a.icao);
    if (hit) exact += 1;
    else unmatched.push(`${a.iata}/${a.icao}`);
  }

  console.log(`airlines.json rows: ${airlines.length}`);
  console.log(`exact iata+icao matches: ${exact}`);
  if (unmatched.length > 0) {
    throw new Error(
      `unmatched airlines.json code pairs: ${unmatched.join(', ')} — source claim would be dishonest`,
    );
  }

  const meta = parseDataFileMeta(JSON.parse(readFileSync(META_PATH, 'utf8')));
  if (meta.license !== 'ODbL-1.0') {
    throw new Error(`airlines.meta.json license must be ODbL-1.0, got "${meta.license}"`);
  }
  if (!/OpenFlights/.test(meta.source)) {
    throw new Error(`airlines.meta.json source must cite OpenFlights, got "${meta.source}"`);
  }
  console.log(`✓ airlines.json provenance verified — ${exact}/${airlines.length} matched, meta license ${meta.license}`);
}

main();
