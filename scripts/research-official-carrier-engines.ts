import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import allianceRaw from '../public/data/alliances/current.json' with { type: 'json' };
import seedsRaw from './data/official-carrier-source-seeds.json' with { type: 'json' };
import { fingerprintOfficialSource, type OfficialSourceProbe } from '../src/lib/rtw/official-source-fingerprint.ts';

const DEFAULT_ROOT = 'E:/workspace/.gcmp-route-work/official-carrier-engines';
const MAX_HTML_BYTES = 2_000_000;

interface Seed {
  carrier: string;
  name: string;
  entryUrls: string[];
  groupHint?: string;
}

function argValue(name: string): string | undefined {
  const prefix = `--${name}=`;
  return process.argv.find((arg) => arg.startsWith(prefix))?.slice(prefix.length);
}

function selectedCarriers(): Set<string> | null {
  const raw = argValue('carriers');
  if (!raw) return null;
  return new Set(raw.split(',').map((value) => value.trim().toUpperCase()).filter(Boolean));
}

function validateSeeds(seeds: Seed[], memberCodes: ReadonlySet<string>): void {
  const seen = new Set<string>();
  for (const seed of seeds) {
    if (!memberCodes.has(seed.carrier)) throw new Error(`Official source seed is not an active alliance member: ${seed.carrier}`);
    if (seen.has(seed.carrier)) throw new Error(`Duplicate official source seed: ${seed.carrier}`);
    seen.add(seed.carrier);
    if (!seed.entryUrls.length) throw new Error(`Official source seed has no entry URLs: ${seed.carrier}`);
    for (const url of seed.entryUrls) {
      const parsed = new URL(url);
      if (parsed.protocol !== 'https:') throw new Error(`Official source entry must use HTTPS: ${url}`);
    }
  }
}

function cacheName(carrier: string, index: number): string {
  return `${carrier.toLowerCase()}-${index + 1}.json`;
}

async function readBoundedHtml(response: Response): Promise<string> {
  const reader = response.body?.getReader();
  if (!reader) return '';
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const part = await reader.read();
    if (part.done) break;
    const remaining = MAX_HTML_BYTES - size;
    if (remaining <= 0) { await reader.cancel(); break; }
    const chunk = part.value.byteLength > remaining ? part.value.slice(0, remaining) : part.value;
    chunks.push(chunk);
    size += chunk.byteLength;
    if (size >= MAX_HTML_BYTES) { await reader.cancel(); break; }
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  return new TextDecoder().decode(bytes);
}

async function fetchProbe(url: string): Promise<OfficialSourceProbe> {
  try {
    const response = await fetch(url, {
      redirect: 'follow',
      signal: AbortSignal.timeout(20_000),
      headers: {
        Accept: 'text/html,application/xhtml+xml',
        'User-Agent': 'GCMP-OfficialSourceResearch/1.0 (+local research; no booking actions)',
      },
    });
    const headers = Object.fromEntries([...response.headers.entries()].filter(([name]) =>
      ['server', 'via', 'x-cache', 'x-akamai-transformed', 'cf-ray', 'set-cookie', 'x-cdn'].includes(name.toLowerCase())));
    return { requestedUrl: url, finalUrl: response.url, status: response.status, headers, html: await readBoundedHtml(response) };
  } catch (error) {
    return {
      requestedUrl: url,
      finalUrl: url,
      status: 0,
      headers: {},
      html: '',
      error: error instanceof Error ? error.message : String(error),
    } as OfficialSourceProbe & { error: string };
  }
}

async function main(): Promise<void> {
  const root = resolve(argValue('work-root') ?? DEFAULT_ROOT);
  const reportPath = resolve(argValue('report') ?? `${root}/report.json`);
  const cacheRoot = resolve(argValue('cache-root') ?? `${root}/cache`);
  const refresh = process.argv.includes('--refresh');
  const delayMs = Math.max(0, Number(argValue('delay-ms') ?? 750));
  const selection = selectedCarriers();
  mkdirSync(cacheRoot, { recursive: true });
  mkdirSync(dirname(reportPath), { recursive: true });

  const members = allianceRaw.memberships.filter((membership) => membership.status === 'member');
  const memberCodes = new Set(members.map((membership) => membership.airline));
  validateSeeds(seedsRaw as Seed[], memberCodes);
  if (selection) {
    const seeded = new Set((seedsRaw as Seed[]).map((seed) => seed.carrier));
    const missing = [...selection].filter((carrier) => !seeded.has(carrier));
    if (missing.length) throw new Error(`No official source seed for requested carrier(s): ${missing.join(', ')}`);
  }
  const seeds = (seedsRaw as Seed[]).filter((seed) => !selection || selection.has(seed.carrier));
  const scans = [];

  for (const seed of seeds) {
    const entries = [];
    for (const [index, url] of seed.entryUrls.entries()) {
      const cachePath = resolve(cacheRoot, cacheName(seed.carrier, index));
      let probe: OfficialSourceProbe;
      if (!refresh && existsSync(cachePath)) {
        probe = JSON.parse(readFileSync(cachePath, 'utf8')) as OfficialSourceProbe;
      } else {
        probe = await fetchProbe(url);
        writeFileSync(cachePath, `${JSON.stringify(probe, null, 2)}\n`);
        if (delayMs) await new Promise((done) => setTimeout(done, delayMs));
      }
      entries.push({
        requestedUrl: probe.requestedUrl,
        finalUrl: probe.finalUrl,
        status: probe.status,
        headers: probe.headers,
        htmlBytes: Buffer.byteLength(probe.html),
        fingerprint: fingerprintOfficialSource(probe),
      });
    }
    scans.push({ carrier: seed.carrier, name: seed.name, groupHint: seed.groupHint ?? null, entries });
  }

  const familyCounts = new Map<string, number>();
  for (const scan of scans) {
    const families = new Set(scan.entries.map((entry) => entry.fingerprint.engineFamily));
    for (const family of families) familyCounts.set(family, (familyCounts.get(family) ?? 0) + 1);
  }
  const seeded = new Set((seedsRaw as Seed[]).map((seed) => seed.carrier));
  const report = {
    generatedAt: new Date().toISOString(),
    catalogMemberCount: members.length,
    seededCarrierCount: [...seeded].filter((carrier) => memberCodes.has(carrier)).length,
    unseededCarriers: members.map((membership) => membership.airline).filter((carrier) => !seeded.has(carrier)).sort(),
    scannedCarriers: scans.length,
    engineFamilyCounts: Object.fromEntries([...familyCounts.entries()].sort()),
    scans,
  };
  writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify(report, null, 2));
}

await main();
