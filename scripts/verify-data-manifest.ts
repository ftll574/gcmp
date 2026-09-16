/**
 * Verify `public/data/DATA_MANIFEST.json` against the tree on disk.
 *
 *   npx tsx scripts/verify-data-manifest.ts
 *
 * Checks, per manifest entry:
 *   - file exists at `public/data/<path>`
 *   - `bytes` matches the real file size
 *   - `sha256` matches the real file's sha256 prefix (16 hex chars)
 *   - `path` is unique across the manifest
 *   - `producer` (when non-null) points at an existing file
 *   - `license` ∈ the schema's allowed set (enforced by zod parse)
 *
 * Also warns (does not fail) when a real file under public/data/ is absent
 * from the manifest — the generator should be rerun.
 *
 * Exits non-zero on the first real failure. Invoked from CI.
 */
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { readdirSync } from 'node:fs';
import { parseDataManifest } from '../src/lib/schemas/data-manifest.ts';

const ROOT = resolve(process.cwd());
const DATA_ROOT = join(ROOT, 'public', 'data');
const MANIFEST_PATH = join(DATA_ROOT, 'DATA_MANIFEST.json');

function sha16(abs: string): string {
  return createHash('sha256').update(readFileSync(abs)).digest('hex').slice(0, 16);
}

function allDataFiles(): Set<string> {
  const outRel = new Set<string>();
  const walkRel = (dir: string, rel: string): void => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      const relPath = rel ? `${rel}/${entry.name}` : entry.name;
      if (entry.isDirectory()) walkRel(full, relPath);
      else outRel.add(relPath);
    }
  };
  walkRel(DATA_ROOT, '');
  return outRel;
}

function main(): void {
  if (!existsSync(MANIFEST_PATH)) {
    throw new Error('DATA_MANIFEST.json missing — run `npx tsx scripts/build-data-manifest.ts`');
  }
  const manifest = parseDataManifest(JSON.parse(readFileSync(MANIFEST_PATH, 'utf8')));
  const seen = new Set<string>();

  for (const [idx, entry] of manifest.datasets.entries()) {
    const label = `entry ${idx} (${entry.path})`;
    if (seen.has(entry.path)) throw new Error(`${label}: duplicate path`);
    seen.add(entry.path);

    const abs = join(DATA_ROOT, entry.path);
    if (!existsSync(abs)) throw new Error(`${label}: file missing on disk`);
    const realBytes = readFileSync(abs).length;
    if (realBytes !== entry.bytes) {
      throw new Error(`${label}: bytes mismatch (manifest ${entry.bytes} ≠ disk ${realBytes}) — rerun the generator`);
    }
    if (sha16(abs) !== entry.sha256) {
      throw new Error(`${label}: sha256 mismatch — rerun the generator`);
    }
    if (entry.producer && !existsSync(join(ROOT, entry.producer))) {
      throw new Error(`${label}: producer script missing (${entry.producer})`);
    }
    if (entry.kind === 'meta' && !entry.path.endsWith('.meta.json')) {
      throw new Error(`${label}: kind=meta but path does not end in .meta.json`);
    }
  }

  // Warn (not fail) on files present but not listed — generator drift.
  // The manifest itself is intentionally not listed among datasets.
  const realFiles = allDataFiles();
  const manifestPaths = new Set(manifest.datasets.map((d) => d.path));
  for (const f of realFiles) {
    if (f === 'DATA_MANIFEST.json') continue;
    if (!manifestPaths.has(f)) {
      console.warn(`⚠ file not in manifest (rerun generator): ${f}`);
    }
  }

  console.log(`✓ DATA_MANIFEST verified — ${manifest.datasets.length} datasets, ${seen.size} unique paths, version ${manifest.version}`);
}

main();
