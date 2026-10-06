/**
 * Build `public/data/DATA_MANIFEST.json` — the machine-readable catalog of
 * every data file shipped under public/data/.
 *
 *   npx tsx scripts/build-data-manifest.ts
 *
 * The manifest is GENERATED so it can never drift from the tree: sizes and
 * sha256 prefixes are recomputed from the real files every run. Human
 * knowledge goes into the per-file descriptors below (kind, producer,
 * source, license, schema); everything mechanical is derived.
 *
 * Verification is `scripts/verify-data-manifest.ts` (also wired into CI),
 * which re-checks existence, bytes, sha256 and the schema.
 */
import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { isCarrierShardPath } from './lib/runtime-shard-paths.ts';
import { join, relative, resolve } from 'node:path';
import type { DataManifestEntry } from '../src/lib/schemas/data-manifest.ts';

const ROOT = resolve(process.cwd());
const DATA_ROOT = join(ROOT, 'public', 'data');
const OUT_FILE = join(DATA_ROOT, 'DATA_MANIFEST.json');

/** Data files that are HAND-MAINTAINED (no build script produces them). */
const CURATED_INPUTS = new Set([
  // Root layer
  'airlines.json',
  'airports.json',
  'official-schedules.json',
  'world-countries-110m.json',
  'world-countries-50m.json',
  // Catalogs
  'alliances/current.json',
  'award-pricing/current.json',
  'rtw-products/current.json',
  'rtw-seasonal/eva-star-w26.json',
  'markets/tw/current.json',
  'geo/current.json',
  'network-gaps/current.json',
  'schedules/current.json',
  // Route-network input snapshots (hand-collected / one-off sources)
  'route-network/current.json',
  'route-network/recent-current.json',
  'route-network/observed-current.json',
  'route-network/affiliate-current.json',
  'route-network/bts-marketing-current.json',
  'route-network/standing-current.json',
  'route-network/validated-static-current.json',
  'route-network/current-corrections.json',
  'route-network/flight-numbers-current.json',
  'route-network/avinor-osl-public-20261006.json',
  'route-network/avinor-osl-public-20261006.xml',
  'route-network/flightsfrom-flight-numbers-20260909.json',
  'route-network/mrairspace-flight-number-candidates.json',
  'route-network/mrairspace-flight-number-candidates-2026-Q2.json',
  'route-network/adsbiq-recent-route-flight-number-candidates.json',
  'route-network/carrier-specific-flight-number-candidates.json',
]);

/** Producer script for known derived files (relative path from repo root). */
const PRODUCERS: Record<string, string> = {
  'airports.json': 'scripts/build-airports.ts',
  'airlines.meta.json': 'scripts/build-airports.ts',
  'airports.meta.json': 'scripts/build-airports.ts',
  'geo/airport-browse-regions.json': 'scripts/build-airport-browse-regions.ts',
  'geo/ci-zones.json': 'scripts/build-route-library-carrier-shards.ts', // emitted alongside carrier shards
  'site/landing-showcases.json': 'scripts/build-landing-showcases.ts',
  'route-network/runtime-current.json': 'scripts/build-runtime-route-network.ts',
  'route-network/runtime-current.meta.json': 'scripts/build-runtime-route-network.ts',
  'route-network/runtime-carriers.meta.json': 'scripts/build-route-library-carrier-shards.ts',
  'route-network/runtime-generated-2026-09.json': 'scripts/build-runtime-generated.ts',
  'route-network/runtime-generated.meta.json': 'scripts/build-runtime-generated.ts',
  'route-network/mrairspace-flight-number-candidates-2026-Q2.json': 'scripts/ingest-mrairspace.ts',
  'route-network/caa-weekly-schedule-tier-20261006.json': 'scripts/build-caa-weekly-schedule-tier.py',
};

/** License / source descriptor by directory family. */
function describe(path: string): { source: string; license: DataLicense } {
  if (path.startsWith('route-network/')) {
    if (path.startsWith('route-network/avinor-osl-public-20261006.')) {
      return {
        source: 'Avinor XML Public OSL snapshot; one 144-hour response with original bytes and exact source/freshness metadata bundled alongside the accepted rows',
        license: 'site-terms',
      };
    }
    if (path === 'route-network/caa-weekly-schedule-tier-20261006.json') {
      return {
        source: 'Taiwan Civil Aviation Administration 2026 domestic/international published scheduled timetables (datasets 6066 and 9973)',
        license: 'OGDL-Taiwan-1.0',
      };
    }
    if (path.includes('runtime')) {
      return {
        source: 'curated + provider-listed route-network layers and a dated Avinor public snapshot (see THIRD_PARTY_NOTICES.md)',
        license: 'ODbL-1.0',
      };
    }
    if (path.includes('mrairspace')) {
      return {
        source: 'https://github.com/MrAirspace/aircraft-flight-schedules',
        license: 'ODbL-1.0',
      };
    }
    if (path.includes('adsbiq')) {
      return {
        source: 'https://github.com/Sky-Power-Services/adsbiq-data',
        license: 'ODbL-1.0',
      };
    }
    return {
      source: 'curated route-network input snapshot (see THIRD_PARTY_NOTICES.md)',
      license: 'pending-confirmation',
    };
  }
  if (path.startsWith('programs/')) {
    return {
      source: 'official program documents + community transcription (see THIRD_PARTY_NOTICES.md)',
      license: 'pending-confirmation',
    };
  }
  if (path.startsWith('rtw-products/') || path.startsWith('rtw-seasonal/')) {
    return {
      source: 'official RTW product documents (see THIRD_PARTY_NOTICES.md)',
      license: 'pending-confirmation',
    };
  }
  if (path.startsWith('alliances/')) {
    return {
      source: 'official alliance membership lists (see THIRD_PARTY_NOTICES.md)',
      license: 'pending-confirmation',
    };
  }
  if (path.startsWith('award-pricing/')) {
    return {
      source: 'official award charts + community transcription (see THIRD_PARTY_NOTICES.md)',
      license: 'pending-confirmation',
    };
  }
  if (path.startsWith('schedules/')) {
    return {
      source: 'STARLUX API / AeroRoutes / China Airlines official timetables (see THIRD_PARTY_NOTICES.md)',
      license: 'site-terms',
    };
  }
  if (path.startsWith('geo/')) {
    return {
      source: 'derived from airports.json + route runtime (see THIRD_PARTY_NOTICES.md)',
      license: 'pending-confirmation',
    };
  }
  if (path.startsWith('markets/') || path.startsWith('network-gaps/') || path.startsWith('site/')) {
    return {
      source: 'curated project data (see THIRD_PARTY_NOTICES.md)',
      license: 'pending-confirmation',
    };
  }
  if (path === 'world-countries-110m.json' || path === 'world-countries-50m.json') {
    return { source: 'world-atlas (topojson) — public domain', license: 'Public-Domain' };
  }
  if (path === 'official-schedules.json') {
    return {
      source: 'official airline publications (see THIRD_PARTY_NOTICES.md)',
      license: 'site-terms',
    };
  }
  if (path.endsWith('.meta.json') || path === 'VERSION' || path === 'DATA_MANIFEST.json') {
    return { source: 'project metadata', license: 'ODbL-1.0' };
  }
  // airports.json — OurAirports-derived (see scripts/build-airports.ts), public domain
  if (path === 'airports.json') {
    return {
      source: 'OurAirports airport dataset (see scripts/build-airports.ts)',
      license: 'Public-Domain',
    };
  }
  // airlines.json — OpenFlights airlines.dat snapshot, cross-verified by
  // scripts/verify-airlines-provenance.ts (45/45 code pairs), ODbL-1.0.
  return {
    source: 'OpenFlights airlines.dat (see scripts/verify-airlines-provenance.ts), curated alliance-member subset',
    license: 'ODbL-1.0',
  };
}

/** Every file under public/data/, relative paths, sorted. */
function allFiles(): string[] {
  const out: string[] = [];
  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else out.push(relative(DATA_ROOT, full));
    }
  };
  walk(DATA_ROOT);
  return out.sort();
}

/** Shard rule: runtime-origins/A.json … Z.json → kind=shard, no per-file entry. */
const ORIGIN_SHARD_RE = /^route-network\/runtime-origins\/[A-Z]\.json$/;

function build(): void {
  const files = allFiles().filter((p) => p !== 'DATA_MANIFEST.json'); // never list the manifest itself
  const datasets = [];
  const existingManifest = existsSync(OUT_FILE)
    ? JSON.parse(readFileSync(OUT_FILE, 'utf8')) as { datasets?: DataManifestEntry[] }
    : undefined;
  const existingByPath = new Map((existingManifest?.datasets ?? []).map((entry) => [entry.path, entry]));

  for (const path of files) {
    // Rule-based entries for shards (avoid 86 hand-written rows).
    let kind: 'input' | 'derived' | 'shard' | 'meta' = CURATED_INPUTS.has(path)
      ? 'input'
      : PRODUCERS[path]
        ? 'derived'
        : path.endsWith('.meta.json')
          ? 'meta'
          : 'derived';
    if (ORIGIN_SHARD_RE.test(path) || isCarrierShardPath(path)) kind = 'shard';

    const producer = PRODUCERS[path] ?? null;
    const { source, license } = describe(path);
    const abs = join(DATA_ROOT, path);
    const bytes = statSync(abs).size;
    const sha256 = createHash('sha256').update(readFileSync(abs)).digest('hex').slice(0, 16);

    let inputs: string[] = [];
    if (path === 'route-network/caa-weekly-schedule-tier-20261006.json') {
      inputs = [
        'artifacts/flight-evidence-verifier/caa-source-bytes-20261006/GET_SCHE_PUB_DOM_294_104211.csv',
        'artifacts/flight-evidence-verifier/caa-source-bytes-20261006/GET_SCHE_PUBLIC_294_103521.csv',
        'artifacts/flight-evidence-verifier/caa-source-bytes-20261006/manifest.json',
        'public/data/route-network/runtime-current.json',
      ];
    }
    if (path === 'route-network/runtime-current.json' || path === 'route-network/runtime-current.meta.json') {
      inputs = CURATED_INPUTS.size
        ? [...CURATED_INPUTS].filter((p) => p.startsWith('route-network/') && !p.includes('runtime')).sort()
        : [];
    }
    if (path === 'route-network/runtime-generated-2026-09.json') {
      inputs = [
        'route-network/mrairspace-flight-number-candidates-2026-Q2.json',
        'route-network/adsbiq-recent-route-flight-number-candidates.json',
      ];
    }
    if (kind === 'shard') {
      inputs = ['route-network/runtime-current.json'];
    }
    const isCaaWeeklyTier = path === 'route-network/caa-weekly-schedule-tier-20261006.json';
    const isAvinorSnapshot = path === 'route-network/avinor-osl-public-20261006.json';
    const isAvinorXml = path === 'route-network/avinor-osl-public-20261006.xml';
    const isRuntimeNetwork = path === 'route-network/runtime-current.json';
    const isRuntimeMeta = path === 'route-network/runtime-current.meta.json';
    const previous = existingByPath.get(path);
    datasets.push({
      id: path.replace(/\.json$/, '').replace(/\//g, '.'),
      path,
      kind: isCaaWeeklyTier ? kind : previous?.kind ?? kind,
      producer: isCaaWeeklyTier ? producer : previous?.producer ?? producer,
      inputs: isCaaWeeklyTier ? inputs : previous?.inputs ?? inputs,
      source: isCaaWeeklyTier || isAvinorSnapshot || isAvinorXml || isRuntimeNetwork || isRuntimeMeta ? source : previous?.source ?? source,
      license: isCaaWeeklyTier || isAvinorSnapshot || isAvinorXml || isRuntimeNetwork || isRuntimeMeta ? license : previous?.license ?? license,
      attribution: isCaaWeeklyTier
        ? 'Taiwan Civil Aviation Administration (交通部民用航空局)'
        : isAvinorSnapshot || isAvinorXml ? 'Avinor — link visible “Flight data from Avinor” text to https://www.avinor.no/; see terms link in app' : previous?.attribution ?? null,
      schema: isCaaWeeklyTier ? 'src/lib/schemas/caa-weekly-schedule-tier.ts'
        : isAvinorSnapshot ? 'src/lib/schemas/avinor-xml-public.ts'
          : isAvinorXml ? null : previous?.schema ?? null,
      bytes,
      sha256,
      notes: isCaaWeeklyTier
        ? '488 schedule-listed carrier-number-direction associations as of 2026-10-06; operator identity unknown; no actual-operation, bookability, nonstop, selectable-flight or award-eligibility claim. Source SHA-256 values are included in the asset.'
        : isAvinorSnapshot
          ? '412 exact candidate-key matches for 130 directed routes using Avinor OperatingAirlineIata, full FlightId and direction fields. One OSL request retrieved 2026-10-06; six-day scope expires at 2026-10-12T19:47:47Z. Full original XML is bundled; visible linked attribution is required by source terms. Blank via_airport means no intermediate airport was reported; it does not prove physical nonstop service. A schedule row is not actual-operation, recurrence, award-seat or bookability evidence.'
          : isAvinorXml
            ? 'Original 849,172-byte Avinor XML Public response. The full SHA-256 and retrieval timestamp are in the matching JSON provenance asset.'
            : isRuntimeNetwork
              ? 'Runtime route graph includes 412 time-bound Avinor designator/direction associations; freshness is guarded in the UI until 2026-10-12T19:47:47Z. The separate CAA schedule tier remains unchanged.'
              : isRuntimeMeta
                ? 'Build metadata pins the Avinor source JSON, original XML, route-network inputs, and output hash.'
        : previous?.notes ?? '',
    });
  }

  const manifest = {
    version: '2026.3',
    generatedAt: new Date().toISOString().slice(0, 10),
    datasets,
  };
  writeFileSync(OUT_FILE, `${JSON.stringify(manifest, null, 2)}\n`);
  console.log(`Wrote ${OUT_FILE} — ${datasets.length} datasets (${files.length} files)`);
}

build();
