/**
 * Build the generated route-network overlay from ODbL candidate sources.
 *
 *   npx tsx scripts/build-runtime-generated.ts
 *
 * Reads every `mrairspace-flight-number-candidates-*.json` quarterly file
 * plus the existing ADSBiq direct-route snapshot, applies the §5.3 upgrade
 * rule (≥2 independent sources / ≥2 quarters ⇒ high|medium|candidate), and
 * writes:
 *
 *   public/data/route-network/runtime-generated-YYYY-MM.json
 *
 * The generated overlay lives ALONGSIDE the curated `runtime-current.json`
 * pipeline — nothing here rewrites or deletes curated rows. `meta.json`
 * records `mergeStrategy: "curated + generated"`; on conflict the CURATED
 * layer wins (human-verified), so this build never silently overrides it.
 */

import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname, '..');
const NETWORK_DIR = resolve(ROOT, 'public', 'data', 'route-network');

interface MrAirspaceFile {
  source: string;
  license: 'ODbL-1.0';
  quarter: string;
  generatedAt: string;
  knownGaps: string[];
  candidates: Array<{
    airline_iata: string;
    origin: string;
    destination: string;
    firstSeenUtc: string;
    lastSeenUtc: string;
    observationCount: number;
    flightNumbers: string[];
    quarters: string[];
  }>;
}

interface AdsbIqFile {
  source: string;
  license: 'ODbL-1.0';
  window: { from: string; to: string; missingDates: string[] };
  entries: Array<{
    carrier: string;
    from: string;
    to: string;
    airlineIcao: string;
    flightNumbers: string[];
    observedDates: string[];
    observationRows: number;
  }>;
}

type Confidence = 'high' | 'medium' | 'candidate';

export interface GeneratedRoute {
  airline_iata: string;
  origin: string;
  destination: string;
  confidence: Confidence;
  observationCount: number;
  evidenceSources: string[];
  firstSeenQuarter: string;
  lastSeenQuarter: string;
  flightNumbers: string[];
}

export interface GeneratedOverlay {
  version: 1;
  generatedAt: string;
  source: string;
  license: 'ODbL-1.0';
  mergeStrategy: 'curated + generated';
  evidenceSources: string[];
  routes: GeneratedRoute[];
}

interface RouteFacts {
  observationCount: number;
  firstQuarter: string;
  lastQuarter: string;
  evidenceSources: string[];
  flightNumbers: Set<string>;
}

function collectMrAirspace(dir: string): RouteFacts[] {
  const files = readdirSync(dir)
    .filter((name) => /^mrairspace-flight-number-candidates-\d{4}-Q[1-4]\.json$/.test(name))
    .sort();
  return files.flatMap((file) => {
    const raw = JSON.parse(readFileSync(resolve(dir, file), 'utf8')) as MrAirspaceFile;
    if (raw.source !== 'https://github.com/MrAirspace/aircraft-flight-schedules' || raw.license !== 'ODbL-1.0') {
      throw new Error(`Unexpected provenance in ${file}`);
    }
    return raw.candidates.map((candidate) => ({
      observationCount: candidate.observationCount,
      firstQuarter: candidate.quarters[0] ?? raw.quarter,
      lastQuarter: candidate.quarters[candidate.quarters.length - 1] ?? raw.quarter,
      evidenceSources: [raw.source],
      flightNumbers: new Set(candidate.flightNumbers),
      carrier: candidate.airline_iata,
      from: candidate.origin,
      to: candidate.destination,
    }));
  });
}

function collectAdsbIq(dir: string): RouteFacts[] {
  const file = resolve(dir, 'adsbiq-recent-route-flight-number-candidates.json');
  if (!existsSync(file)) return [];
  const raw = JSON.parse(readFileSync(file, 'utf8')) as AdsbIqFile;
  if (raw.source !== 'https://github.com/Sky-Power-Services/adsbiq-data' || raw.license !== 'ODbL-1.0') {
    throw new Error(`Unexpected provenance in adsbiq-recent-route-flight-number-candidates.json`);
  }
  return raw.entries.map((entry) => ({
    observationCount: entry.observationRows,
    firstQuarter: entry.observedDates[0] ?? raw.window.from,
    lastQuarter: entry.observedDates[entry.observedDates.length - 1] ?? raw.window.to,
    evidenceSources: [raw.source],
    flightNumbers: new Set(entry.flightNumbers),
    carrier: entry.carrier,
    from: entry.from,
    to: entry.to,
  }));
}

function quarterOf(value: string): string {
  const match = /^(\d{4})-(\d{2})/.exec(value);
  if (!match) return value;
  const month = Number(match[2]!);
  const q = month <= 3 ? 1 : month <= 6 ? 2 : month <= 9 ? 3 : 4;
  return `${match[1]}-Q${q}`;
}

function buildOverlay(mrAirspaceFacts: RouteFacts[], adsbIqFacts: RouteFacts[]): GeneratedOverlay {
  const byRoute = new Map<string, RouteFacts & { carrier: string; from: string; to: string }>();
  for (const facts of [...mrAirspaceFacts, ...adsbIqFacts]) {
    const route = facts as RouteFacts & { carrier: string; from: string; to: string };
    const key = `${route.carrier}|${route.from}|${route.to}`;
    const existing = byRoute.get(key);
    if (!existing) {
      byRoute.set(key, { ...route, evidenceSources: [...route.evidenceSources] });
      continue;
    }
    existing.observationCount += route.observationCount;
    existing.flightNumbers = new Set([...existing.flightNumbers, ...route.flightNumbers]);
    existing.evidenceSources = [...new Set([...existing.evidenceSources, ...route.evidenceSources])];
    if (route.firstQuarter < existing.firstQuarter) existing.firstQuarter = route.firstQuarter;
    if (route.lastQuarter > existing.lastQuarter) existing.lastQuarter = route.lastQuarter;
  }

  const routes: GeneratedRoute[] = [];

  for (const [key, route] of byRoute.entries()) {
    const carrier = key.slice(0, key.indexOf('|'));
    const [from, to] = key.slice(key.indexOf('|') + 1).split('|') as [string, string];
    const firstQuarter = quarterOf(route.firstQuarter);
    const lastQuarter = quarterOf(route.lastQuarter);
    const distinctQuarters = new Set([firstQuarter, lastQuarter]).size;
    const sourceCountHere = route.evidenceSources.length;
    const confidence: Confidence =
      sourceCountHere >= 2 && distinctQuarters >= 2
        ? 'high'
        : sourceCountHere >= 2 || distinctQuarters >= 2
          ? 'medium'
          : 'candidate';
    routes.push({
      airline_iata: carrier,
      origin: from,
      destination: to,
      confidence,
      observationCount: route.observationCount,
      evidenceSources: [...route.evidenceSources].sort(),
      firstSeenQuarter: firstQuarter,
      lastSeenQuarter: lastQuarter,
      flightNumbers: [...route.flightNumbers].sort(),
    });
  }

  routes.sort((a, b) => {
    if (a.airline_iata !== b.airline_iata) return a.airline_iata < b.airline_iata ? -1 : 1;
    if (a.origin !== b.origin) return a.origin < b.origin ? -1 : 1;
    return a.destination < b.destination ? -1 : 1;
  });

  const evidenceSources = [...new Set([...mrAirspaceFacts, ...adsbIqFacts].map((f) => f.evidenceSources).flat())].sort();

  return {
    version: 1,
    generatedAt: new Date().toISOString().slice(0, 10),
    source: 'generated from MrAirspace + ADSBiq ODbL candidate layers',
    license: 'ODbL-1.0',
    mergeStrategy: 'curated + generated',
    evidenceSources,
    routes,
  };
}

function main(): void {
  const mrAirspaceFacts = collectMrAirspace(NETWORK_DIR);
  const adsbIqFacts = collectAdsbIq(NETWORK_DIR);
  const overlay = buildOverlay(mrAirspaceFacts, adsbIqFacts);
  const month = new Date().toISOString().slice(0, 7);
  const outFile = resolve(NETWORK_DIR, `runtime-generated-${month}.json`);
  writeFileSync(outFile, `${JSON.stringify(overlay, null, 2)}\n`);
  const metaFile = resolve(NETWORK_DIR, 'runtime-generated.meta.json');
  writeFileSync(metaFile, `${JSON.stringify({
    version: 1,
    builtOn: new Date().toISOString().slice(0, 10),
    mergeStrategy: 'curated + generated',
    source: overlay.source,
    license: 'ODbL-1.0',
    evidenceSources: overlay.evidenceSources,
    routes: overlay.routes.length,
    confidence: {
      high: overlay.routes.filter((r) => r.confidence === 'high').length,
      medium: overlay.routes.filter((r) => r.confidence === 'medium').length,
      candidate: overlay.routes.filter((r) => r.confidence === 'candidate').length,
    },
  }, null, 2)}\n`);
  const digest = createHash('sha256').update(JSON.stringify(overlay)).digest('hex').slice(0, 16);
  console.log(`Wrote ${outFile} — ${overlay.routes.length} routes (${digest})`);
  console.log(`Wrote ${metaFile}`);
}

main();
