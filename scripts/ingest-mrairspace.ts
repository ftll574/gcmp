/**
 * Ingest MrAirspace aircraft-flight-schedules quarterly parquet release into
 * a standardized ODbL-licensed flight-number candidate file.
 *
 *   npx tsx scripts/ingest-mrairspace.ts [--quarter 2026-Q2] [--parquet <path>] [--limit N]
 *
 * Default behaviour:
 *   1. `GET https://api.github.com/repos/MrAirspace/aircraft-flight-schedules/releases/latest`
 *      (NOT the README's Releases link — that points at the wrong repo,
 *      `aircraft-flight-logs`).
 *   2. Download the `YYYY_Q{n}_detailed_github.parquet` asset (~870MB).
 *   3. Parse the parquet with duckdb (optional peer dependency — see below).
 *   4. Filter/normalize with `scripts/lib/mrairspace-core.ts` and write
 *      `public/data/route-network/mrairspace-flight-number-candidates-<quarter>.json`.
 *
 * Parquet parsing uses duckdb through a dynamic `import()` so the script can
 * still be type-checked without the package installed. Install it once for a
 * real ingestion run:
 *
 *   npm i -D duckdb
 *
 * `--parquet` points at a locally downloaded file (skips the GitHub fetch)
 * and `--limit` caps the rows read for smoke tests.
 */

import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import {
  buildCandidateEntries,
  quarterMonths,
  type MrAirspaceRow,
} from './lib/mrairspace-core.ts';

// `import.meta.dirname` is undefined under tsx and `import.meta.url` can be
// a synthetic empty/relative URL in eval-style runs, so anchor the repo root
// to the process working directory instead. The ingest script is always
// invoked from the repo root (`npx tsx scripts/ingest-mrairspace.ts`), and
// relative `--parquet` paths resolve against the same cwd.
const ROOT = resolve(process.cwd());
const OUTPUT_DIR = resolve(ROOT, 'public', 'data', 'route-network');
const RELEASE_API = 'https://api.github.com/repos/MrAirspace/aircraft-flight-schedules/releases/latest';
/** CJS-only packages (parquetjs) are loaded through require, not import(). */
const require = createRequire(import.meta.url);

interface Args {
  quarter: string;
  parquet?: string;
  limit?: number;
}

function parseArgs(argv: readonly string[]): Args {
  const args: Args = { quarter: '2026-Q2' };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]!;
    if (arg === '--quarter') {
      const next = argv[++i];
      if (!next || !/^\d{4}-Q[1-4]$/.test(next)) throw new Error('--quarter must look like 2026-Q2');
      args.quarter = next;
    } else if (arg === '--parquet') {
      const next = argv[++i];
      if (!next) throw new Error('--parquet needs a path');
      args.parquet = next;
    } else if (arg === '--limit') {
      const next = Number(argv[++i]);
      if (!Number.isInteger(next) || next < 1) throw new Error('--limit needs a positive integer');
      args.limit = next;
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }
  return args;
}

interface ReleaseAsset {
  name: string;
  browser_download_url: string;
}

interface ReleaseInfo {
  tag_name: string;
  assets: ReleaseAsset[];
}

/** Which asset in a release is the quarterly detailed parquet. */
export function pickQuarterAsset(release: ReleaseInfo, quarter: string): ReleaseAsset | null {
  const quarterPattern = new RegExp(`^\\d{4}_Q[1-4]_detailed_github\\.parquet$`);
  const quarterMatch = release.assets.find(
    (asset) => quarterPattern.test(asset.name)
      && asset.name.startsWith(quarter.replace('-', '_')),
  );
  if (quarterMatch) return quarterMatch;
  const fallback = release.assets.find((asset) => quarterPattern.test(asset.name));
  if (fallback) return fallback;
  return release.assets.find((asset) => asset.name.includes('detailed') && asset.name.endsWith('.parquet')) ?? null;
}

async function fetchLatestRelease(): Promise<ReleaseInfo> {
  const response = await fetch(RELEASE_API, { headers: { 'User-Agent': 'gcmp-data-pipeline' } });
  if (!response.ok) throw new Error(`GitHub release fetch failed: ${response.status} ${response.statusText}`);
  return (await response.json()) as ReleaseInfo;
}

/**
 * Parse the parquet into rows.
 *
 * Preferred engine is duckdb (`npm i -D duckdb`), which loads the whole
 * file in one SQL pass. On machines where duckdb's native build is not
 * available (slow/failing compile), we fall back to `parquetjs`
 * (`npm i -D parquetjs`) via `ParquetReader.openFile` + `getCursor()`.
 * Both engines are optional peer dependencies, resolved with dynamic
 * `import()` so type-checking and CI still work without either installed.
 */
async function readParquetRows(
  path: string,
  limit?: number,
): Promise<MrAirspaceRow[]> {
  // Engine 1: duckdb (fast, whole-file SQL).
  try {
    const duckdb = await import('duckdb');
    const sql = limit !== undefined
      ? `SELECT * FROM read_parquet('${path}') LIMIT ${limit}`
      : `SELECT * FROM read_parquet('${path}')`;
    const rows = await new Promise<MrAirspaceRow[]>((resolvePromise, rejectPromise) => {
      const db = new duckdb.Database(':memory:');
      db.all(sql, (err: unknown, result: unknown) => {
        db.close();
        if (err) rejectPromise(err instanceof Error ? err : new Error(String(err)));
        else resolvePromise(result as MrAirspaceRow[]);
      });
    });
    return rows;
  } catch (duckdbError) {
    // duckdb is a peer dependency: when it is missing (module-not-found)
    // or its native binding fails, record it and fall through to parquetjs.
    console.warn(
      `duckdb unavailable (${duckdbError instanceof Error ? duckdbError.message : String(duckdbError)}); falling back to parquetjs`,
    );
  }

  // Engine 2: parquetjs (pure-JS fallback; slower but no native compile).
  // parquetjs ships as CommonJS; dynamic import() of CJS under tsx does not
  // reliably expose its named exports, so load it through createRequire.
  try {
    const parquet = require('parquetjs') as {
      ParquetReader: {
        openFile: (file: string) => Promise<{
          getCursor: () => { next: () => Promise<unknown> };
          close: () => Promise<void>;
        }>;
      };
    };
    const reader = await parquet.ParquetReader.openFile(path);
    try {
      const cursor = reader.getCursor();
      const rows: MrAirspaceRow[] = [];
      let record: unknown;
      while ((record = await cursor.next()) !== null) {
        rows.push(record as MrAirspaceRow);
        if (limit !== undefined && rows.length >= limit) break;
      }
      return rows;
    } finally {
      await reader.close();
    }
  } catch {
    throw new Error(
      'Neither duckdb nor parquetjs is usable. Install one of them — `npm i -D duckdb` '
      + '(preferred; native build) or `npm i -D parquetjs` (pure-JS fallback) — '
      + 'before a real ingestion run.',
    );
  }
}

function loadAirlineMap(): Map<string, string> {
  const raw = JSON.parse(readFileSync(resolve(ROOT, 'public', 'data', 'airlines.json'), 'utf8')) as Array<{
    iata: string;
    icao?: string;
  }>;
  const map = new Map<string, string>();
  for (const airline of raw) {
    if (airline.icao) map.set(airline.icao.toUpperCase(), airline.iata.toUpperCase());
  }
  return map;
}

function loadAirportMap(): Map<string, string> {
  const raw = JSON.parse(readFileSync(resolve(ROOT, 'public', 'data', 'airports.json'), 'utf8')) as Array<{
    iata: string;
    icao?: string;
  }>;
  const map = new Map<string, string>();
  for (const airport of raw) {
    if (airport.icao) map.set(airport.icao.toUpperCase(), airport.iata.toUpperCase());
  }
  return map;
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const months = quarterMonths(args.quarter);
  if (!months) throw new Error(`Malformed quarter: ${args.quarter}`);
  console.log(`Quarter: ${args.quarter} (rows must fall inside ${months.join(', ')})`);

  let release: ReleaseInfo | null = null;
  let parquetPath = args.parquet;
  if (!parquetPath) {
    console.log('Fetching latest MrAirspace release metadata…');
    release = await fetchLatestRelease();
    const asset = pickQuarterAsset(release, args.quarter);
    if (!asset) throw new Error(`No quarterly detailed parquet asset found in ${release.tag_name}`);
    parquetPath = resolve(ROOT, '.tmp', asset.name);
    mkdirSync(resolve(ROOT, '.tmp'), { recursive: true });
    console.log(`Downloading ${asset.browser_download_url} (${asset.name})…`);
    const response = await fetch(asset.browser_download_url);
    if (!response.ok) throw new Error(`Download failed: ${response.status}`);
    const buffer = Buffer.from(await response.arrayBuffer());
    writeFileSync(parquetPath, buffer);
    console.log(`Saved ${parquetPath} (${buffer.length} bytes)`);
  } else {
    parquetPath = resolve(ROOT, parquetPath);
    if (!existsSync(parquetPath)) throw new Error(`--parquet file not found: ${parquetPath}`);
  }

  console.log(`Reading parquet…${args.limit ? ` (limit ${args.limit})` : ''}`);
  const rows = await readParquetRows(parquetPath, args.limit);
  console.log(`Read ${rows.length} rows`);

  const entries = buildCandidateEntries(rows, {
    quarter: args.quarter,
    airlineIcaoToIata: loadAirlineMap(),
    airportIcaoToIata: loadAirportMap(),
    quarterMonths: months,
  });
  console.log(`Produced ${entries.length} candidate routes (≥2 observations)`);

  const tag = release?.tag_name ?? args.quarter;
  const sourceUrl = release
    ? `https://github.com/MrAirspace/aircraft-flight-schedules/releases/tag/${tag}`
    : 'https://github.com/MrAirspace/aircraft-flight-schedules';

  const output = {
    source: 'https://github.com/MrAirspace/aircraft-flight-schedules',
    license: 'ODbL-1.0',
    quarter: args.quarter,
    generatedAt: new Date().toISOString(),
    knownGaps: [],
    candidates: entries,
  };
  const outFile = resolve(
    OUTPUT_DIR,
    `mrairspace-flight-number-candidates-${args.quarter}.json`,
  );
  writeFileSync(outFile, `${JSON.stringify(output, null, 2)}\n`);
  console.log(`Wrote ${outFile} (${Buffer.byteLength(JSON.stringify(output))} bytes)`);

  // Digest for regression logging (not part of the artifact contract).
  const digest = createHash('sha256').update(JSON.stringify(output)).digest('hex').slice(0, 16);
  console.log(`sha256(prefix) ${digest} · source ${sourceUrl}`);
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
