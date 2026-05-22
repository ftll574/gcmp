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
 *   Path:       groups separated by `,`, airports within group by `-`
 *   `op`:       groups separated by `;`, legs within group by `,`
 *   `fc`:       per-leg fare class letters, same shape as `op` — optional
 *   `p`:        global crediting programs (AA, AS, ...)
 *   `c`:        global cabin (Y / W / J / F)
 *   `rv`:       global rules version (optional)
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
  type Leg,
  type ProgramId,
  type ProgramShortCode,
  type RoutingGroup,
  type RoutingRequest,
  type UrlParseError,
  type UrlParseResult,
} from './types.ts';
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
  const rvRaw = params.get('rv');
  const projRaw = params.get('proj');

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

    const legs: Leg[] = [];
    for (let i = 0; i < iataCodes.length - 1; i++) {
      const from = iataCodes[i];
      const to = iataCodes[i + 1];
      const operatingCarrier = operatingCarriers[i];
      if (!from || !to || !operatingCarrier) {
        return err('malformed-path', 'Internal: leg construction failed.');
      }
      const fc = fareClasses?.[i];
      legs.push(
        fc !== undefined
          ? { from, to, operatingCarrier, fareClass: fc }
          : { from, to, operatingCarrier },
      );
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

  const request: RoutingRequest = {
    groups,
    cabin,
    programs,
    projection,
    ...(rulesVersion !== undefined ? { rulesVersion } : {}),
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
  if (req.rulesVersion !== undefined) {
    params.set('rv', req.rulesVersion);
  }
  // Always encode the projection so the shared URL pins the recipient to
  // the sender's chosen view. Mercator (the v1.0 historic default) is the
  // only one we still omit for backwards-compat with v1.0 shared URLs.
  if (req.projection !== undefined && req.projection !== 'mercator') {
    params.set('proj', PROJECTION_SHORT[req.projection]);
  }
  return `/r/${SCHEMA_VERSION}/${path}?${params.toString()}`;
}
