/**
 * URL schema for shareable routings (v1 + multi-group + fare-class extension).
 *
 *   Single-group (v0.1-v0.3 backwards compat):
 *     /r/v1/SFO-NRT-BKK?op=AA,JL&p=AA,AS&c=J&rv=2026.4&proj=a
 *
 *   Multi-group (v0.4):
 *     /r/v1/SFO-NRT-BKK,JFK-LHR-CDG?op=AA,JL;BA,BA&p=AA,AS&c=J
 *
 *   Per-leg fare class (v1.5):
 *     /r/v1/SFO-NRT-BKK?op=AA,JL&p=AA,AS&c=J&fc=J,C
 *     → per-leg single-letter A-Z; format mirrors `op` (semicolon per group,
 *       comma per leg). Optional — when absent, engine falls back to the
 *       carrier's defaultLetterByCabin[cabin].
 *
 *   Per-leg departure dates (v1.10, docs/decisions/flight-schedule-model.md S1):
 *     /r/v1/TPE-NRT-KIX?op=BR,BR&p=BR&c=J&d=2026-09-01,,2026-09-05
 *     → per-leg ISO YYYY-MM-DD; same shape as `op` (semicolon per group,
 *       comma per leg). Empty segment = undated leg (`2026-09-01,,`).
 *       When present, segment count MUST equal the flattened leg count
 *       (typed parse error otherwise); when absent every leg is undated.
 *
 *   Path:       groups separated by `,`, airports within group by `-`
 *   `op`:       groups separated by `;`, legs within group by `,`
 *   `fc`:       per-leg fare class letters, same shape as `op` — optional
 *   `d`:        per-leg departure dates (ISO YYYY-MM-DD), same shape as
 *               `op` with empty segments for undated legs — optional
 *   `p`:        global crediting programs (AA, AS, ...)
 *   `c`:        global cabin (Y / W / J / F)
 *   `rv`:       global rules version (optional)
 *   `rtw`:      selected RTW fare/award product id (optional)
 *   `proj`:     global projection short code (m / e / a / o)
 *
 *   parseShareUrl(url)   →  RoutingRequest | UrlParseError
 *   encodeShareUrl(req)  →  path + query string
 *
 * Engine purity: this module returns typed errors and NEVER throws.
 */

import {
  PROGRAM_SHORT_CODES,
  type CabinId,
  type EliteTier,
  type Leg,
  type ProgramId,
  type ProgramShortCode,
  type RoutingGroup,
  type RoutingRequest,
  type UrlParseError,
  type UrlParseResult,
} from './types.ts';

const TIER_BY_LETTER: Record<string, EliteTier> = {
  n: 'none',
  m: 'mid',
  h: 'high',
  t: 'top',
};
const LETTER_BY_TIER: Record<EliteTier, string> = {
  none: 'n',
  mid: 'm',
  high: 'h',
  top: 't',
};
import type { ProjectionId } from './calc/projections.ts';

const SCHEMA_VERSION = 'v1';

const CABIN_BY_LETTER: Record<string, CabinId> = {
  Y: 'economy',
  W: 'premium-economy',
  J: 'business',
  F: 'first',
};

const LETTER_BY_CABIN: Record<CabinId, string> = {
  economy: 'Y',
  'premium-economy': 'W',
  business: 'J',
  first: 'F',
};

const RULES_VERSION_PATTERN = /^\d{4}\.[1-4]$/;
const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const RTW_PRODUCT_ID_PATTERN = /^[a-z0-9][a-z0-9-]*$/;

const PROJECTION_BY_SHORT: Record<string, ProjectionId> = {
  m: 'mercator',
  e: 'equirectangular',
  a: 'azimuthal-equidistant',
  o: 'orthographic',
};

const PROJECTION_SHORT: Record<ProjectionId, string> = {
  mercator: 'm',
  equirectangular: 'e',
  'azimuthal-equidistant': 'a',
  orthographic: 'o',
};

function err(kind: UrlParseError['kind'], message: string): UrlParseError {
  return { ok: false, kind, message };
}

export function parseShareUrl(input: string): UrlParseResult {
  let pathAndQuery: string;
  try {
    const u = new URL(input);
    pathAndQuery = u.pathname + u.search;
  } catch {
    pathAndQuery = input.replace(/^#/, '');
    if (!pathAndQuery.startsWith('/')) {
      pathAndQuery = '/' + pathAndQuery;
    }
  }

  const qIndex = pathAndQuery.indexOf('?');
  const pathPart = qIndex === -1 ? pathAndQuery : pathAndQuery.slice(0, qIndex);
  const queryPart = qIndex === -1 ? '' : pathAndQuery.slice(qIndex + 1);

  const pathMatch = pathPart.match(/^\/r\/([^/]+)\/([^/?#]+)$/);
  if (!pathMatch) {
    return err('malformed-path', `Path does not match /r/v{N}/IATA-IATA: ${pathPart}`);
  }
  const schemaVer = pathMatch[1];
  const groupsStr = pathMatch[2];
  if (schemaVer !== SCHEMA_VERSION) {
    return err(
      'wrong-schema-version',
      `Unsupported share URL schema version "${schemaVer}". This build understands "${SCHEMA_VERSION}".`,
    );
  }
  if (!groupsStr) {
    return err('malformed-path', 'Missing airport chain in path.');
  }

  // Split groups by `,`. A single-group URL (no `,`) yields 1 chain.
  const groupChains = groupsStr.split(',');
  if (groupChains.length === 0 || groupChains.some((c) => c.length === 0)) {
    return err('malformed-path', 'Empty group in path.');
  }

  // Validate IATA codes inside every chain.
  const iataByGroup: string[][] = [];
  for (const chain of groupChains) {
    const codes = chain.split('-').map((s) => s.toUpperCase());
    if (codes.length < 2) {
      return err('malformed-path', `Group "${chain}" must have at least 2 airports.`);
    }
    for (const code of codes) {
      if (!/^[A-Z]{3}$/.test(code)) {
        return err('unknown-airport', `Invalid IATA code in chain: "${code}"`);
      }
    }
    iataByGroup.push(codes);
  }

  const params = new URLSearchParams(queryPart);
  const opRaw = params.get('op');
  const pRaw = params.get('p');
  const cRaw = params.get('c');
  const fcRaw = params.get('fc');
  const dRaw = params.get('d');
  const stopoverRaw = params.get('stp');
  const surfaceRaw = params.get('surf');
  const rvRaw = params.get('rv');
  const sdRaw = params.get('sd');
  const edRaw = params.get('ed');
  const rtwRaw = params.get('rtw');
  const projRaw = params.get('proj');
  const stRaw = params.get('st');

  if (!opRaw) return err('missing-required-param', 'Missing `op` (operating carriers) in query.');
  if (!pRaw) return err('missing-required-param', 'Missing `p` (programs) in query.');
  if (!cRaw) return err('missing-required-param', 'Missing `c` (cabin) in query.');

  // Split op by `;` per group.
  const opByGroupStr = opRaw.split(';');
  if (opByGroupStr.length !== iataByGroup.length) {
    return err(
      'mismatched-op-length',
      `Expected ${iataByGroup.length} group(s) in op (semicolon-separated); got ${opByGroupStr.length}.`,
    );
  }

  // Per-leg fare classes. Optional. Same shape as op: `;`-separated groups,
  // `,`-separated legs. An empty entry (e.g. "J,,Y") means "use cabin default
  // for this leg" — we don't require fare classes for every leg.
  let fcByGroupStr: string[] | null = null;
  if (fcRaw) {
    fcByGroupStr = fcRaw.split(';');
    if (fcByGroupStr.length !== iataByGroup.length) {
      return err(
        'mismatched-op-length',
        `Expected ${iataByGroup.length} group(s) in fc (semicolon-separated); got ${fcByGroupStr.length}.`,
      );
    }
  }

  // Per-leg departure dates. Optional. Same shape as op: `;`-separated
  // groups, `,`-separated legs; an empty cell means "this leg is undated"
  // (docs/decisions/flight-schedule-model.md S1 — partial dating inside a
  // present `d=` is allowed). When present the segment counts must line up
  // with the path exactly; when absent every leg stays undated.
  let datesByGroupStr: string[] | null = null;
  if (dRaw) {
    datesByGroupStr = dRaw.split(';');
    if (datesByGroupStr.length !== iataByGroup.length) {
      return err(
        'mismatched-op-length',
        `Expected ${iataByGroup.length} group(s) in d (semicolon-separated); got ${datesByGroupStr.length}.`,
      );
    }
  }

  function parseBooleanShape(raw: string | null, param: 'stp' | 'surf'): string[] | null {
    if (!raw) return null;
    const byGroup = raw.split(';');
    if (byGroup.length !== iataByGroup.length) {
      throw new Error(
        `Expected ${iataByGroup.length} group(s) in ${param} (semicolon-separated); got ${byGroup.length}.`,
      );
    }
    return byGroup;
  }

  let stopoverByGroupStr: string[] | null;
  let surfaceByGroupStr: string[] | null;
  try {
    stopoverByGroupStr = parseBooleanShape(stopoverRaw, 'stp');
    surfaceByGroupStr = parseBooleanShape(surfaceRaw, 'surf');
  } catch (e) {
    return err('mismatched-op-length', e instanceof Error ? e.message : String(e));
  }

  function decodeBooleanCells(
    rawGroup: string,
    expectedCount: number,
    groupIndex: number,
    param: 'stp' | 'surf',
  ): Array<boolean | undefined> | UrlParseError {
    const rawCells = rawGroup === '' ? [] : rawGroup.split(',');
    if (rawCells.length > 0 && rawCells.length !== expectedCount) {
      return err(
        'mismatched-op-length',
        `Group ${groupIndex + 1}: expected ${expectedCount} value(s) in ${param}; got ${rawCells.length}.`,
      );
    }
    const padded = rawCells.length === 0 ? new Array<string>(expectedCount).fill('') : rawCells;
    const out: Array<boolean | undefined> = [];
    for (const cell of padded) {
      const cleaned = (cell ?? '').toLowerCase().trim();
      if (cleaned === '') out.push(undefined);
      else if (cleaned === '1' || cleaned === 'y' || cleaned === 'true') out.push(true);
      else if (cleaned === '0' || cleaned === 'n' || cleaned === 'false') out.push(false);
      else return err('malformed-path', `Invalid ${param} value: "${cell}". Expected 1 / 0.`);
    }
    return out;
  }

  const groups: RoutingGroup[] = [];
  for (let gi = 0; gi < iataByGroup.length; gi++) {
    const iataCodes = iataByGroup[gi];
    const opStr = opByGroupStr[gi];
    if (!iataCodes || opStr === undefined) {
      return err('malformed-path', 'Internal: group construction failed.');
    }
    const operatingCarriers = opStr.split(',').map((s) => s.toUpperCase());
    const expectedOpCount = iataCodes.length - 1;
    if (operatingCarriers.length !== expectedOpCount) {
      return err(
        'mismatched-op-length',
        `Group ${gi + 1}: expected ${expectedOpCount} operating carrier(s) for ${iataCodes.length} airports; got ${operatingCarriers.length}.`,
      );
    }
    for (const carrier of operatingCarriers) {
      if (!/^[A-Z0-9]{2,3}$/.test(carrier)) {
        return err('malformed-path', `Invalid operating carrier code: "${carrier}"`);
      }
    }

    // Decode fare-class letters for this group, if present.
    let fareClasses: ReadonlyArray<string | undefined> | null = null;
    if (fcByGroupStr) {
      const groupFcStr = fcByGroupStr[gi] ?? '';
      const rawFc = groupFcStr === '' ? [] : groupFcStr.split(',');
      if (rawFc.length > 0 && rawFc.length !== expectedOpCount) {
        return err(
          'mismatched-op-length',
          `Group ${gi + 1}: expected ${expectedOpCount} fare class(es) in fc; got ${rawFc.length}.`,
        );
      }
      const padded = rawFc.length === 0
        ? new Array<string>(expectedOpCount).fill('')
        : rawFc;
      const out: Array<string | undefined> = [];
      for (const cell of padded) {
        const cleaned = (cell ?? '').toUpperCase().trim();
        if (cleaned === '') {
          out.push(undefined);
        } else if (/^[A-Z]$/.test(cleaned)) {
          out.push(cleaned);
        } else {
          return err('malformed-path', `Invalid fare-class letter: "${cell}". Expected single A-Z.`);
        }
      }
      fareClasses = out;
    }

    // Decode departure dates for this group, if present. Empty cell =
    // undated leg; non-empty must be ISO YYYY-MM-DD.
    let departures: ReadonlyArray<string | undefined> | null = null;
    if (datesByGroupStr) {
      const groupDStr = datesByGroupStr[gi] ?? '';
      const rawDates = groupDStr === '' ? [] : groupDStr.split(',');
      if (rawDates.length > 0 && rawDates.length !== expectedOpCount) {
        return err(
          'mismatched-op-length',
          `Group ${gi + 1}: expected ${expectedOpCount} date(s) in d; got ${rawDates.length}.`,
        );
      }
      const paddedDates = rawDates.length === 0
        ? new Array<string>(expectedOpCount).fill('')
        : rawDates;
      const decodedDates: Array<string | undefined> = [];
      for (const cell of paddedDates) {
        const cleaned = (cell ?? '').trim();
        if (cleaned === '') {
          decodedDates.push(undefined);
        } else if (ISO_DATE_PATTERN.test(cleaned)) {
          decodedDates.push(cleaned);
        } else {
          return err('malformed-path', `Invalid departure date: "${cell}". Expected YYYY-MM-DD.`);
        }
      }
      departures = decodedDates;
    }

    let stopovers: ReadonlyArray<boolean | undefined> | null = null;
    if (stopoverByGroupStr) {
      const decoded = decodeBooleanCells(stopoverByGroupStr[gi] ?? '', expectedOpCount, gi, 'stp');
      if (!Array.isArray(decoded)) return decoded;
      stopovers = decoded;
    }

    let surfaces: ReadonlyArray<boolean | undefined> | null = null;
    if (surfaceByGroupStr) {
      const decoded = decodeBooleanCells(surfaceByGroupStr[gi] ?? '', expectedOpCount, gi, 'surf');
      if (!Array.isArray(decoded)) return decoded;
      surfaces = decoded;
    }

    const legs: Leg[] = [];
    for (let i = 0; i < iataCodes.length - 1; i++) {
      const from = iataCodes[i];
      const to = iataCodes[i + 1];
      const operatingCarrier = operatingCarriers[i];
      if (!from || !to || !operatingCarrier) {
        return err('malformed-path', 'Internal: leg construction failed.');
      }
      const fc = fareClasses?.[i];
      const stopover = stopovers?.[i];
      const surface = surfaces?.[i];
      const departsOn = departures?.[i];
      legs.push({
        from,
        to,
        operatingCarrier,
        ...(fc !== undefined ? { fareClass: fc } : {}),
        ...(stopover !== undefined ? { stopover } : {}),
        ...(surface !== undefined ? { surface } : {}),
        ...(departsOn !== undefined ? { departsOn } : {}),
      });
    }
    groups.push({ legs });
  }

  const programShortCodes = pRaw.split(',').map((s) => s.toUpperCase()) as ProgramShortCode[];
  const programs: ProgramId[] = [];
  for (const code of programShortCodes) {
    const programId = PROGRAM_SHORT_CODES[code];
    if (!programId) {
      return err('unknown-program', `Unknown program short code: "${code}"`);
    }
    programs.push(programId);
  }
  if (programs.length === 0) {
    return err('missing-required-param', 'At least one program required in `p`.');
  }

  const cabinLetter = cRaw.toUpperCase();
  const cabin = CABIN_BY_LETTER[cabinLetter];
  if (!cabin) {
    return err('unknown-cabin', `Unknown cabin code "${cRaw}". Expected Y/W/J/F.`);
  }

  let rulesVersion: string | undefined;
  if (rvRaw) {
    if (!RULES_VERSION_PATTERN.test(rvRaw)) {
      return err('malformed-path', `Invalid rules version "${rvRaw}". Expected YYYY.Q.`);
    }
    rulesVersion = rvRaw;
  }

  let startDate: string | undefined;
  if (sdRaw) {
    if (!ISO_DATE_PATTERN.test(sdRaw)) {
      return err('malformed-path', `Invalid start date "${sdRaw}". Expected YYYY-MM-DD.`);
    }
    startDate = sdRaw;
  }

  let endDate: string | undefined;
  if (edRaw) {
    if (!ISO_DATE_PATTERN.test(edRaw)) {
      return err('malformed-path', `Invalid end date "${edRaw}". Expected YYYY-MM-DD.`);
    }
    endDate = edRaw;
  }

  let rtwProductId: string | undefined;
  if (rtwRaw) {
    if (!RTW_PRODUCT_ID_PATTERN.test(rtwRaw)) {
      return err('malformed-path', `Invalid RTW product id "${rtwRaw}".`);
    }
    rtwProductId = rtwRaw;
  }

  // Backwards compat: a URL with no `proj=` was created before v1.1 when the
  // runtime default was Mercator. Such URLs must continue to render as
  // Mercator regardless of the current runtime default, otherwise every
  // shared v1.0 link silently changes appearance.
  let projection: ProjectionId = 'mercator';
  if (projRaw) {
    const resolved = PROJECTION_BY_SHORT[projRaw.toLowerCase()];
    if (!resolved) {
      return err('malformed-path', `Invalid projection "${projRaw}". Expected m / e / a / o.`);
    }
    projection = resolved;
  }

  let tier: EliteTier | undefined;
  if (stRaw) {
    const resolved = TIER_BY_LETTER[stRaw.toLowerCase()];
    if (!resolved) {
      return err('malformed-path', `Invalid status tier "${stRaw}". Expected n / m / h / t.`);
    }
    if (resolved !== 'none') tier = resolved;
  }

  const request: RoutingRequest = {
    groups,
    cabin,
    programs,
    projection,
    ...(rulesVersion !== undefined ? { rulesVersion } : {}),
    ...(startDate !== undefined ? { startDate } : {}),
    ...(endDate !== undefined ? { endDate } : {}),
    ...(rtwProductId !== undefined ? { rtwProductId } : {}),
    ...(tier !== undefined ? { tier } : {}),
  };

  return { ok: true, request };
}

/**
 * Encode a RoutingRequest into a share URL path + query.
 *
 *   { groups: [{legs: [SFO→NRT/AA, NRT→BKK/JL]}, {legs: [JFK→LHR/BA, LHR→CDG/BA]}], cabin: 'business', programs: ['aa-aadvantage'] }
 *   →  /r/v1/SFO-NRT-BKK,JFK-LHR-CDG?op=AA,JL;BA,BA&p=AA&c=J
 */
export function encodeShareUrl(req: RoutingRequest): string {
  const groupChains = req.groups.map((group) => {
    const codes = [
      group.legs[0]?.from,
      ...group.legs.map((leg) => leg.to),
    ].filter((s): s is string => typeof s === 'string');
    return codes.join('-');
  });

  const opByGroup = req.groups.map((group) =>
    group.legs.map((leg) => leg.operatingCarrier).join(','),
  );

  // Per-leg fare classes. Encode as `fc=J,C;F,F` mirroring `op` shape.
  // Empty cell `""` for legs without an override. Skip the whole param when
  // no leg in any group has a fare class — preserves URL compatibility with
  // every v0.x–v1.4 link.
  const anyFc = req.groups.some((g) => g.legs.some((l) => l.fareClass !== undefined));
  const fcByGroup = anyFc
    ? req.groups.map((group) => group.legs.map((leg) => leg.fareClass ?? '').join(','))
    : null;
  const anyStopover = req.groups.some((g) => g.legs.some((l) => l.stopover !== undefined));
  const stopoverByGroup = anyStopover
    ? req.groups.map((group) => group.legs.map((leg) => leg.stopover === undefined ? '' : leg.stopover ? '1' : '0').join(','))
    : null;
  const anySurface = req.groups.some((g) => g.legs.some((l) => l.surface !== undefined));
  const surfaceByGroup = anySurface
    ? req.groups.map((group) => group.legs.map((leg) => leg.surface === undefined ? '' : leg.surface ? '1' : '0').join(','))
    : null;
  // Per-leg departure dates. Encode as `d=2026-09-01,,2026-09-05` mirroring
  // `op` shape. Empty cell for undated legs. Skip the whole param when no
  // leg is dated — preserves URL compatibility with every pre-dating link.
  const anyDated = req.groups.some((g) => g.legs.some((l) => l.departsOn !== undefined));
  const datesByGroup = anyDated
    ? req.groups.map((group) => group.legs.map((leg) => leg.departsOn ?? '').join(','))
    : null;

  const path = groupChains.join(',');
  const op = opByGroup.join(';');
  const p = req.programs.map((id) => {
    const short = Object.entries(PROGRAM_SHORT_CODES).find(([, fullId]) => fullId === id);
    return short ? short[0] : id;
  }).join(',');
  const c = LETTER_BY_CABIN[req.cabin];

  const params = new URLSearchParams();
  params.set('op', op);
  params.set('p', p);
  params.set('c', c);
  if (fcByGroup) {
    params.set('fc', fcByGroup.join(';'));
  }
  if (stopoverByGroup) {
    params.set('stp', stopoverByGroup.join(';'));
  }
  if (surfaceByGroup) {
    params.set('surf', surfaceByGroup.join(';'));
  }
  if (datesByGroup) {
    params.set('d', datesByGroup.join(';'));
  }
  if (req.rulesVersion !== undefined) {
    params.set('rv', req.rulesVersion);
  }
  if (req.startDate !== undefined) {
    params.set('sd', req.startDate);
  }
  if (req.endDate !== undefined) {
    params.set('ed', req.endDate);
  }
  if (req.rtwProductId !== undefined) {
    params.set('rtw', req.rtwProductId);
  }
  // Always encode the projection so the shared URL pins the recipient to
  // the sender's chosen view. Mercator (the v1.0 historic default) is the
  // only one we still omit for backwards-compat with v1.0 shared URLs.
  if (req.projection !== undefined && req.projection !== 'mercator') {
    params.set('proj', PROJECTION_SHORT[req.projection]);
  }
  // Status tier (v1.9). Omit when 'none' — keeps URL clean and preserves
  // every v0-v1.8 URL exactly.
  if (req.tier !== undefined && req.tier !== 'none') {
    params.set('st', LETTER_BY_TIER[req.tier]);
  }
  return `/r/${SCHEMA_VERSION}/${path}?${params.toString()}`;
}
