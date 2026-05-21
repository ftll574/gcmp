/**
 * URL schema for shareable routings.
 *
 *   /r/v1/{IATA-IATA-...IATA}?op=AA,JL,...&p=AA,AS&c=J&rv=2026.4
 *
 * The `/v1/` prefix is the schema version — v2 can coexist without breaking
 * shared URLs that already exist in FlyerTalk threads.
 *
 * Path:         hyphen-joined airport IATA codes (≥ 2)
 * `op` query:   per-leg operating carriers (length = airports - 1)
 * `p` query:    crediting program short codes (AA, AS, ...)
 * `c` query:    cabin: Y / W / J / F
 * `rv` query:   rules version (optional; if omitted = current)
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
  type RoutingRequest,
  type UrlParseError,
  type UrlParseResult,
} from './types.ts';

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

function err(kind: UrlParseError['kind'], message: string): UrlParseError {
  return { ok: false, kind, message };
}

/**
 * Parse a share URL into a RoutingRequest. Accepts either the full URL
 * (`https://gcmp.app/r/v1/...`), a path-only string (`/r/v1/...`), or the
 * hash form (`#/r/v1/...`).
 */
export function parseShareUrl(input: string): UrlParseResult {
  let pathAndQuery: string;

  // Strip protocol + host if present.
  try {
    const u = new URL(input);
    pathAndQuery = u.pathname + u.search;
  } catch {
    // Not a full URL — treat as path-or-hash.
    pathAndQuery = input.replace(/^#/, '');
    if (!pathAndQuery.startsWith('/')) {
      pathAndQuery = '/' + pathAndQuery;
    }
  }

  // Split path and query.
  const qIndex = pathAndQuery.indexOf('?');
  const pathPart = qIndex === -1 ? pathAndQuery : pathAndQuery.slice(0, qIndex);
  const queryPart = qIndex === -1 ? '' : pathAndQuery.slice(qIndex + 1);

  // Expect path: /r/v1/{IATA-IATA-...}
  const pathMatch = pathPart.match(/^\/r\/([^/]+)\/([^/?#]+)$/);
  if (!pathMatch) {
    return err('malformed-path', `Path does not match /r/v{N}/IATA-IATA: ${pathPart}`);
  }
  const schemaVer = pathMatch[1];
  const iataChain = pathMatch[2];
  if (schemaVer !== SCHEMA_VERSION) {
    return err(
      'wrong-schema-version',
      `Unsupported share URL schema version "${schemaVer}". This build understands "${SCHEMA_VERSION}".`,
    );
  }
  if (!iataChain) {
    return err('malformed-path', 'Missing airport chain in path.');
  }

  // Parse airport chain.
  const iataCodes = iataChain.split('-').map((s) => s.toUpperCase());
  for (const code of iataCodes) {
    if (!/^[A-Z]{3}$/.test(code)) {
      return err('unknown-airport', `Invalid IATA code in chain: "${code}"`);
    }
  }
  if (iataCodes.length < 2) {
    return err(
      'malformed-path',
      'Routing must have at least 2 airports (one leg).',
    );
  }

  // Parse query params.
  const params = new URLSearchParams(queryPart);
  const opRaw = params.get('op');
  const pRaw = params.get('p');
  const cRaw = params.get('c');
  const rvRaw = params.get('rv');

  if (!opRaw) {
    return err('missing-required-param', 'Missing `op` (operating carriers) in query.');
  }
  if (!pRaw) {
    return err('missing-required-param', 'Missing `p` (programs) in query.');
  }
  if (!cRaw) {
    return err('missing-required-param', 'Missing `c` (cabin) in query.');
  }

  const operatingCarriers = opRaw.split(',').map((s) => s.toUpperCase());
  const expectedOpCount = iataCodes.length - 1;
  if (operatingCarriers.length !== expectedOpCount) {
    return err(
      'mismatched-op-length',
      `Expected ${expectedOpCount} operating carrier(s) for ${iataCodes.length} airports; got ${operatingCarriers.length}.`,
    );
  }
  for (const carrier of operatingCarriers) {
    if (!/^[A-Z0-9]{2,3}$/.test(carrier)) {
      return err('malformed-path', `Invalid operating carrier code: "${carrier}"`);
    }
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
      return err(
        'malformed-path',
        `Invalid rules version "${rvRaw}". Expected YYYY.Q (e.g. 2026.4).`,
      );
    }
    rulesVersion = rvRaw;
  }

  // Build legs.
  const legs: Leg[] = [];
  for (let i = 0; i < iataCodes.length - 1; i++) {
    const from = iataCodes[i];
    const to = iataCodes[i + 1];
    const operatingCarrier = operatingCarriers[i];
    if (!from || !to || !operatingCarrier) {
      return err('malformed-path', 'Internal: leg construction failed.');
    }
    legs.push({ from, to, operatingCarrier });
  }

  const request: RoutingRequest = rulesVersion !== undefined
    ? { legs, cabin, programs, rulesVersion }
    : { legs, cabin, programs };

  return { ok: true, request };
}

/**
 * Encode a RoutingRequest into a share URL path + query.
 *
 *   { legs: [{SFO→NRT on AA}, {NRT→BKK on JL}], cabin: 'business', programs: ['aa-aadvantage', 'as-mileage-plan'] }
 *   →  /r/v1/SFO-NRT-BKK?op=AA,JL&p=AA,AS&c=J
 */
export function encodeShareUrl(req: RoutingRequest): string {
  const iataChain = [
    req.legs[0]?.from,
    ...req.legs.map((leg) => leg.to),
  ]
    .filter((s): s is string => typeof s === 'string')
    .join('-');

  const op = req.legs.map((leg) => leg.operatingCarrier).join(',');
  const p = req.programs.map((id) => {
    const short = Object.entries(PROGRAM_SHORT_CODES).find(
      ([, fullId]) => fullId === id,
    );
    return short ? short[0] : id;
  }).join(',');
  const c = LETTER_BY_CABIN[req.cabin];

  const params = new URLSearchParams();
  params.set('op', op);
  params.set('p', p);
  params.set('c', c);
  if (req.rulesVersion !== undefined) {
    params.set('rv', req.rulesVersion);
  }
  return `/r/${SCHEMA_VERSION}/${iataChain}?${params.toString()}`;
}
