/**
 * Loads + validates loyalty-program JSON files at runtime. Uses zod to
 * surface bad data immediately rather than silently producing wrong PQM.
 *
 *   loadProgram(programId, version?)  →  Promise<Program>
 *
 * Versioning:
 *   - When `version` is undefined, loads `current.json` (a symlink or copy
 *     of the latest snapshot — for v1 we just point to v2026.4.json).
 *   - When `version` is provided, loads `v{version}.json`.
 *   - Missing version files fall back to current + a warning.
 *
 *   public/data/programs/aa/v2026.4.json
 *   public/data/programs/aa/current.json   (alias for the current snapshot)
 */

import { ProgramSchema, type Program } from './schemas/program.ts';
import type { ProgramId } from './types.ts';

export interface ProgramLoadResult {
  program: Program;
  /** True when we asked for a specific historic version but had to fall back. */
  fellBackToCurrent: boolean;
  /** True when the requested version matched what was loaded. */
  versionMatched: boolean;
}

const PROGRAM_DIR_BY_ID: Record<ProgramId, string> = {
  'aa-aadvantage': 'aa',
  'as-mileage-plan': 'as',
};

async function fetchJson(url: string): Promise<unknown | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    return (await res.json()) as unknown;
  } catch {
    return null;
  }
}

export async function loadProgram(
  programId: ProgramId,
  version?: string,
  baseUrl: string = '',
): Promise<ProgramLoadResult> {
  const dir = PROGRAM_DIR_BY_ID[programId];
  const root = `${baseUrl}/data/programs/${dir}`;
  let fellBackToCurrent = false;
  let raw: unknown | null;

  if (version) {
    raw = await fetchJson(`${root}/v${version}.json`);
    if (raw === null) {
      fellBackToCurrent = true;
      raw = await fetchJson(`${root}/current.json`);
    }
  } else {
    raw = await fetchJson(`${root}/current.json`);
  }

  if (raw === null) {
    throw new Error(`Failed to load program rules for "${programId}".`);
  }

  const parsed = ProgramSchema.parse(raw);

  return {
    program: parsed,
    fellBackToCurrent,
    versionMatched: version ? parsed.version === version && !fellBackToCurrent : true,
  };
}
