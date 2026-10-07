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
  'route-network/avinor-public-airport-batch-20261006.json',
  ...['aes', 'bdu', 'bgo', 'boo', 'eve', 'krs', 'mol', 'svg', 'tos', 'trd'].map((airport) => `route-network/avinor-xml-public-${airport}-20261006.xml`),
  'route-network/avinor-follow-on-evidence-20261006.jsonl',
  'route-network/avinor-follow-on-release-20261006.json',
  'route-network/avinor-remaining-airports-accepted-20261007.jsonl',
  'route-network/avinor-remaining-airports-release-20261007.json',
  ...['alf', 'anx', 'bjf', 'bnn', 'bvg', 'haa', 'hft', 'hov', 'hvg', 'kkn', 'ksu', 'lkn', 'meh', 'mjf', 'mqn', 'osy', 'ret', 'sdn', 'skn', 'sog', 'ssj', 'svj', 'vaw', 'vds'].map((airport) => `route-network/avinor-remaining-xml-public-${airport}-20261007.xml`),
  'route-network/siros-registered-plan-proposal-20261007.jsonl.gz',
  'route-network/siros-registered-plan-raw-rows-20261007.jsonl.gz',
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
  'route-network/siros-registered-plan-release-20261007.json': 'scripts/build-siros-registered-plan-release.ts',
};

/** License / source descriptor by directory family. */
function describe(path: string): { source: string; license: DataLicense } {
  if (path.startsWith('route-network/')) {
    if (path === 'route-network/siros-registered-plan-proposal-20261007.jsonl.gz') {
      return {
        source: 'Independently reviewed ANAC SIROS registered-schedule handoff; preserves the accepted proposal, exclusions, route identity matches and review report hashes',
        license: 'government-open-data',
      };
    }
    if (path === 'route-network/siros-registered-plan-release-20261007.json') {
      return {
        source: 'ANAC SIROS snapshot release manifest; pins the captured source hash, accepted proposal/raw rows, prior independently reviewed report hashes and evidence-only scope',
        license: 'government-open-data',
      };
    }
    if (path === 'route-network/siros-registered-plan-raw-rows-20261007.jsonl.gz') {
      return {
        source: 'ANAC SIROS captured CSV accepted rows; each retained UTF-8 source row has its exact per-row SHA-256 and points to the pinned captured source-body hash',
        license: 'government-open-data',
      };
    }
    if (path === 'route-network/avinor-follow-on-evidence-20261006.jsonl'
      || path === 'route-network/avinor-follow-on-release-20261006.json') {
      return {
        source: 'Avinor XML Public follow-on review packet; exact accepted occurrence ledger, release hashes and source-window metadata retained alongside the original XML response assets',
        license: 'site-terms',
      };
    }
    if (path === 'route-network/avinor-remaining-airports-accepted-20261007.jsonl'
      || path === 'route-network/avinor-remaining-airports-release-20261007.json'
      || /^route-network\/avinor-remaining-xml-public-[a-z]{3}-20261007\.xml$/.test(path)) {
      return {
        source: 'Independently reviewed Avinor XML Public remaining-airports release; exact accepted identities, dated occurrences, original source bytes and per-airport request/freshness metadata are retained with the release manifest',
        license: 'site-terms',
      };
    }
    if (path.startsWith('route-network/avinor-osl-public-20261006.')) {
      return {
        source: 'Avinor XML Public OSL snapshot; one 144-hour response with original bytes and exact source/freshness metadata bundled alongside the accepted rows',
        license: 'site-terms',
      };
    }
    if (path === 'route-network/avinor-public-airport-batch-20261006.json' || /^route-network\/avinor-xml-public-(aes|bdu|bgo|boo|eve|krs|mol|svg|tos|trd)-20261006\.xml$/.test(path)) {
      return {
        source: 'Avinor XML Public airport snapshots; ten bounded 144-hour responses with original bytes and per-airport retrieval/freshness metadata in the companion provenance asset',
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
        source: 'Curated and provider-listed route-network layers, ODbL route sources, source-specific Avinor and CAA evidence, and the independently reviewed ANAC SIROS registered-schedule snapshot (see THIRD_PARTY_NOTICES.md)',
        license: 'mixed-source-terms',
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
      inputs.push('route-network/siros-registered-plan-release-20261007.json');
    }
    if (path === 'route-network/siros-registered-plan-release-20261007.json') {
      inputs = [
        'route-network/siros-registered-plan-proposal-20261007.jsonl.gz',
        'route-network/siros-registered-plan-raw-rows-20261007.jsonl.gz',
        'scripts/build-siros-registered-plan-release.ts',
        'scripts/lib/siros-registered-plan-input.ts',
        'src/lib/schemas/siros-registered-plan-release.ts',
      ];
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
    const isAvinorBatchSnapshot = path === 'route-network/avinor-public-airport-batch-20261006.json';
    const isAvinorBatchXml = /^route-network\/avinor-xml-public-(aes|bdu|bgo|boo|eve|krs|mol|svg|tos|trd)-20261006\.xml$/.test(path);
    const isAvinorFollowOn = path === 'route-network/avinor-follow-on-evidence-20261006.jsonl'
      || path === 'route-network/avinor-follow-on-release-20261006.json';
    const isSiroArtifact = path === 'route-network/siros-registered-plan-proposal-20261007.jsonl.gz'
      || path === 'route-network/siros-registered-plan-raw-rows-20261007.jsonl.gz'
      || path === 'route-network/siros-registered-plan-release-20261007.json';
    const isSiroRelease = path === 'route-network/siros-registered-plan-release-20261007.json';
    const isRuntimeNetwork = path === 'route-network/runtime-current.json';
    const isRuntimeMeta = path === 'route-network/runtime-current.meta.json';
    const previous = existingByPath.get(path);
    datasets.push({
      id: path.replace(/\.json$/, '').replace(/\//g, '.'),
      path,
      kind: isCaaWeeklyTier || isSiroArtifact ? kind : previous?.kind ?? kind,
      producer: isCaaWeeklyTier || isSiroArtifact ? producer : previous?.producer ?? producer,
      inputs: isCaaWeeklyTier || isSiroArtifact || isRuntimeNetwork || isRuntimeMeta ? inputs : previous?.inputs ?? inputs,
      source: isCaaWeeklyTier || isAvinorSnapshot || isAvinorXml || isAvinorBatchSnapshot || isAvinorBatchXml || isAvinorFollowOn || isSiroArtifact || isRuntimeNetwork || isRuntimeMeta ? source : previous?.source ?? source,
      license: isCaaWeeklyTier || isSiroArtifact || isRuntimeNetwork || isRuntimeMeta ? license : previous?.license ?? license,
      attribution: isSiroArtifact ? 'ANAC — Registro de Serviços Aéreos (SIROS); federal open-data reuse basis with attribution, subject to resource-specific terms'
        : isCaaWeeklyTier
        ? 'Taiwan Civil Aviation Administration (交通部民用航空局)'
        : isAvinorSnapshot || isAvinorXml || isAvinorBatchSnapshot || isAvinorBatchXml || isAvinorFollowOn ? 'Avinor — link visible “Flight data from Avinor” text to https://www.avinor.no/; link the flight-data terms separately' : previous?.attribution ?? null,
      schema: isSiroRelease ? 'src/lib/schemas/siros-registered-plan-release.ts'
        : isCaaWeeklyTier ? 'src/lib/schemas/caa-weekly-schedule-tier.ts'
        : isAvinorSnapshot ? 'src/lib/schemas/avinor-xml-public.ts'
          : isAvinorBatchSnapshot ? 'src/lib/schemas/avinor-xml-public-batch.ts'
            : isAvinorFollowOn ? 'src/lib/schemas/avinor-follow-on.ts'
              : isAvinorXml || isAvinorBatchXml ? null : previous?.schema ?? null,
      bytes,
      sha256,
      notes: path === 'route-network/siros-registered-plan-release-20261007.json'
        ? 'Pins the captured 2026-10-07 SIROS CSV source body and accepted 14,997-row existing-route proposal. The proposal has 57 exact candidate matches and 1,390 designator identities absent from candidate/confirmed layers; it overlaps zero of 2,767 confirmed associations. The archive preserves exact accepted raw source rows. Held, expired, Z-prefixed schema-incompatible and new-route cases are outside this release.'
        : isCaaWeeklyTier
        ? '488 schedule-listed carrier-number-direction associations as of 2026-10-06; operator identity unknown; no actual-operation, bookability, nonstop, selectable-flight or award-eligibility claim. Source SHA-256 values are included in the asset.'
        : isAvinorSnapshot
          ? '412 exact candidate-key matches for 130 directed routes using Avinor OperatingAirlineIata, full FlightId and direction fields. One OSL request retrieved 2026-10-06; six-day scope expires at 2026-10-12T19:47:47Z. Full original XML is bundled; visible linked attribution is required by source terms. Blank via_airport means no intermediate airport was reported; it does not prove physical nonstop service. A schedule row is not actual-operation, recurrence, award-seat or bookability evidence.'
          : isAvinorBatchSnapshot
            ? 'Ten bounded airport-specific XML Public snapshots with exact accepted carrier, full FlightId and direction matches. Per-airport retrieval timestamps, 144-hour freshness deadlines, original response bytes/hashes, exact input packet hashes, and candidate effective windows are retained. Existing candidate dates are not extended; published schedule rows are display-only and do not establish recurring service, actual operation, award seats or bookability.'
          : isAvinorFollowOn
            ? 'The packet ledger preserves 1,373 accepted schedule identities and 5,421 exact occurrences across 11 snapshots; 201 identities/726 occurrences were already promoted by the preceding release. Runtime adds only 1,172 new identities. Each occurrence expires at its scheduled UTC time; no actual-operation, physical nonstop, recurrence, award-seat or bookability claim is made. The route map covers 43 documented airports, not global coverage.'
            : isAvinorBatchXml
              ? 'Original Avinor XML Public response bytes. The full SHA-256, size, retrieval timestamp and freshness deadline are in avinor-public-airport-batch-20261006.json.'
          : isAvinorXml
            ? 'Original 849,172-byte Avinor XML Public response. The full SHA-256 and retrieval timestamp are in the matching JSON provenance asset.'
            : isRuntimeNetwork
              ? 'Runtime preserves the first 412 OSL identities, the prior release’s 201 promoted identities, and the 1,172 net-new follow-on identities with per-occurrence expiry and source-window cutoffs. CAA’s 488 operator-unknown associations remain separate.'
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
