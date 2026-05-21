/**
 * gcmap.com URL compatibility shim.
 *
 *   parseGcmapUrl('http://www.gcmap.com/mapui?P=SFO-NRT-BKK,JFK-LHR-CDG')
 *     → { groups: [...], cabin: 'business', programs: ['aa-aadvantage', 'as-mileage-plan'] }
 *
 *   parseGcmapPath('SFO-NRT,JFK-LHR')  → same shape
 *
 * gcmap doesn't carry cabin / fare / operating-carrier metadata in the URL —
 * it's just the airports. We fill in sensible defaults (business cabin, AA
 * as operating carrier per leg) and let the user adjust after import.
 *
 * Detection patterns:
 *   - host contains 'gcmap.com' or 'gc.kls2.com' → parse `?P=` query param
 *   - bare path-like text matching `^[A-Z]{3}(-[A-Z]{3})+(,[A-Z]{3}(-[A-Z]{3})+)*$` → treat as paths string
 *
 * On parse failure: returns null. Caller decides what to do.
 */

import type { AirlineIata, Leg, RoutingGroup, RoutingRequest } from './types.ts';

const GCMAP_HOSTS = ['gcmap.com', 'gc.kls2.com', 'www.gcmap.com'];

/** Recognizes "SFO-NRT-BKK,JFK-LHR" — bare paths string. */
const BARE_PATHS_RE = /^[A-Z0-9]{3}(?:-[A-Z0-9]{3})+(?:,[A-Z0-9]{3}(?:-[A-Z0-9]{3})+)*$/;

export function isGcmapUrl(input: string): boolean {
  const trimmed = input.trim();
  try {
    const u = new URL(trimmed);
    if (GCMAP_HOSTS.some((h) => u.hostname.endsWith(h))) return true;
  } catch {
    // fallthrough
  }
  return BARE_PATHS_RE.test(trimmed.toUpperCase());
}

/**
 * Parse a gcmap URL (or bare paths string) into a RoutingRequest. Returns null
 * on failure. Defaults: business cabin, both loyalty programs, AA per leg.
 */
export function parseGcmapUrl(
  input: string,
  defaults: {
    cabin?: RoutingRequest['cabin'];
    programs?: RoutingRequest['programs'];
    operatingCarrier?: AirlineIata;
  } = {},
): RoutingRequest | null {
  const trimmed = input.trim();
  let pathsStr: string | null = null;

  // Try URL form.
  try {
    const u = new URL(trimmed);
    if (GCMAP_HOSTS.some((h) => u.hostname.endsWith(h))) {
      pathsStr = u.searchParams.get('P') ?? u.searchParams.get('p');
    }
  } catch {
    // not a URL
  }

  // Try bare-paths form.
  if (pathsStr === null && BARE_PATHS_RE.test(trimmed.toUpperCase())) {
    pathsStr = trimmed.toUpperCase();
  }

  if (pathsStr === null) return null;

  // gcmap also accepts space-separated groups; normalize.
  pathsStr = pathsStr.replace(/\s+/g, ',').toUpperCase();

  const groupStrs = pathsStr.split(',').filter((s) => s.length > 0);
  if (groupStrs.length === 0) return null;

  const operatingCarrier = defaults.operatingCarrier ?? 'AA';
  const cabin = defaults.cabin ?? 'business';
  const programs = defaults.programs ?? ['aa-aadvantage', 'as-mileage-plan'];

  const groups: RoutingGroup[] = [];
  for (const groupStr of groupStrs) {
    const codes = groupStr.split('-').filter((s) => s.length > 0);
    if (codes.length < 2) return null;
    for (const code of codes) {
      if (!/^[A-Z]{3}$/.test(code)) return null;
    }
    const legs: Leg[] = [];
    for (let i = 0; i < codes.length - 1; i++) {
      const from = codes[i];
      const to = codes[i + 1];
      if (!from || !to) return null;
      legs.push({ from, to, operatingCarrier });
    }
    groups.push({ legs });
  }

  return { groups, cabin, programs };
}
