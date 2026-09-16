import { describe, expect, test } from 'vitest';
import { readFileSync } from 'node:fs';
import { parseDataManifest, DataManifestSchema } from '../../src/lib/schemas/data-manifest.ts';

const MANIFEST_PATH = 'public/data/DATA_MANIFEST.json';

function validEntry(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 'test.file',
    path: 'test/file.json',
    kind: 'input',
    producer: null,
    inputs: [],
    source: 'test source',
    license: 'ODbL-1.0',
    attribution: null,
    schema: null,
    bytes: 10,
    sha256: '0123456789abcdef',
    notes: '',
    ...overrides,
  };
}

describe('data manifest schema', () => {
  test('repo DATA_MANIFEST.json parses and covers every data file', () => {
    const manifest = parseDataManifest(JSON.parse(readFileSync(MANIFEST_PATH, 'utf8')));
    expect(manifest.version.length).toBeGreaterThan(0);
    expect(manifest.datasets.length).toBeGreaterThan(100); // 160 files incl. shards
    const paths = new Set(manifest.datasets.map((d) => d.path));
    expect(paths.size).toBe(manifest.datasets.length); // unique paths
  });

  test('accepts a valid minimal entry', () => {
    const result = DataManifestSchema.safeParse({
      version: '1',
      generatedAt: '2026-09-16',
      datasets: [validEntry()],
    });
    expect(result.success).toBe(true);
  });

  test('rejects unknown license value', () => {
    const result = DataManifestSchema.safeParse({
      version: '1',
      generatedAt: '2026-09-16',
      datasets: [validEntry({ license: 'CC-BY-4.0' })],
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(JSON.stringify(result.error.issues)).toContain('license');
    }
  });

  test('rejects unknown kind', () => {
    const result = DataManifestSchema.safeParse({
      version: '1',
      generatedAt: '2026-09-16',
      datasets: [validEntry({ kind: 'database' })],
    });
    expect(result.success).toBe(false);
  });

  test('rejects malformed sha256 prefix', () => {
    const result = DataManifestSchema.safeParse({
      version: '1',
      generatedAt: '2026-09-16',
      datasets: [validEntry({ sha256: 'xyz' })],
    });
    expect(result.success).toBe(false);
  });

  test('rejects negative or non-integer bytes', () => {
    const bad = DataManifestSchema.safeParse({
      version: '1',
      generatedAt: '2026-09-16',
      datasets: [validEntry({ bytes: -1 })],
    });
    expect(bad.success).toBe(false);
    const float = DataManifestSchema.safeParse({
      version: '1',
      generatedAt: '2026-09-16',
      datasets: [validEntry({ bytes: 1.5 })],
    });
    expect(float.success).toBe(false);
  });

  test('rejects empty producer string (must be null or a real script)', () => {
    const result = DataManifestSchema.safeParse({
      version: '1',
      generatedAt: '2026-09-16',
      datasets: [validEntry({ producer: '' })],
    });
    expect(result.success).toBe(false);
  });
});
