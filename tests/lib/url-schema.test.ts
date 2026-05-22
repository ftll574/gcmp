/**
 * URL schema tests. The Iron Rule for shareability:
 *
 *   parseShareUrl(encodeShareUrl(req)) === req   (modulo defaults)
 *
 * If this ever fails, every FlyerTalk-posted gcmp link becomes lossy.
 */

import { describe, expect, test } from 'vitest';
import { encodeShareUrl, parseShareUrl } from '../../src/lib/url-schema.ts';
import type { RoutingRequest } from '../../src/lib/types.ts';

const SINGLE_GROUP: RoutingRequest = {
  groups: [
    {
      legs: [
        { from: 'SFO', to: 'NRT', operatingCarrier: 'AA' },
        { from: 'NRT', to: 'BKK', operatingCarrier: 'JL' },
        { from: 'BKK', to: 'HKG', operatingCarrier: 'CX' },
      ],
    },
  ],
  cabin: 'business',
  programs: ['aa-aadvantage', 'as-mileage-plan'],
  rulesVersion: '2026.4',
};

const MULTI_GROUP: RoutingRequest = {
  groups: [
    {
      legs: [
        { from: 'SFO', to: 'NRT', operatingCarrier: 'AA' },
        { from: 'NRT', to: 'BKK', operatingCarrier: 'JL' },
      ],
    },
    {
      legs: [
        { from: 'JFK', to: 'LHR', operatingCarrier: 'BA' },
        { from: 'LHR', to: 'CDG', operatingCarrier: 'BA' },
      ],
    },
  ],
  cabin: 'business',
  programs: ['aa-aadvantage', 'as-mileage-plan'],
};

describe('encodeShareUrl (single-group)', () => {
  test('produces /r/v1/IATA-IATA-... path', () => {
    const url = encodeShareUrl(SINGLE_GROUP);
    expect(url).toMatch(/^\/r\/v1\/SFO-NRT-BKK-HKG\?/);
  });

  test('includes op, p, c, rv query params', () => {
    const url = encodeShareUrl(SINGLE_GROUP);
    expect(url).toContain('op=AA%2CJL%2CCX');
    expect(url).toContain('p=AA%2CAS');
    expect(url).toContain('c=J');
    expect(url).toContain('rv=2026.4');
  });
});

describe('encodeShareUrl (multi-group)', () => {
  test('joins groups with `,` in path', () => {
    const url = encodeShareUrl(MULTI_GROUP);
    expect(url).toContain('/r/v1/SFO-NRT-BKK,JFK-LHR-CDG');
  });

  test('joins op groups with `;`', () => {
    const url = encodeShareUrl(MULTI_GROUP);
    // ';' URL-encodes to %3B; ',' URL-encodes to %2C
    expect(url).toContain('op=AA%2CJL%3BBA%2CBA');
  });
});

describe('parseShareUrl (single-group)', () => {
  test('round-trips the fixture exactly', () => {
    const encoded = encodeShareUrl(SINGLE_GROUP);
    const parsed = parseShareUrl(encoded);
    expect(parsed.ok).toBe(true);
    if (parsed.ok) {
      expect(parsed.request.groups).toEqual(SINGLE_GROUP.groups);
      expect(parsed.request.cabin).toBe('business');
      expect(parsed.request.programs).toEqual(['aa-aadvantage', 'as-mileage-plan']);
      expect(parsed.request.rulesVersion).toBe('2026.4');
    }
  });

  test('parses full URL with origin', () => {
    const encoded = encodeShareUrl(SINGLE_GROUP);
    const parsed = parseShareUrl(`https://gcmp.example.com${encoded}`);
    expect(parsed.ok).toBe(true);
  });

  test('rejects wrong schema version', () => {
    const parsed = parseShareUrl('/r/v2/SFO-NRT?op=AA&p=AA&c=J');
    expect(parsed.ok).toBe(false);
    if (!parsed.ok) {
      expect(parsed.kind).toBe('wrong-schema-version');
    }
  });

  test('rejects malformed path', () => {
    const parsed = parseShareUrl('/not-routing');
    expect(parsed.ok).toBe(false);
    if (!parsed.ok) {
      expect(parsed.kind).toBe('malformed-path');
    }
  });

  test('rejects mismatched op count', () => {
    const parsed = parseShareUrl('/r/v1/SFO-NRT-BKK?op=AA&p=AA&c=J');
    expect(parsed.ok).toBe(false);
    if (!parsed.ok) {
      expect(parsed.kind).toBe('mismatched-op-length');
    }
  });

  test('rejects unknown program short code', () => {
    const parsed = parseShareUrl('/r/v1/SFO-NRT?op=AA&p=XX&c=J');
    expect(parsed.ok).toBe(false);
    if (!parsed.ok) {
      expect(parsed.kind).toBe('unknown-program');
    }
  });

  test('parses all v1.3 program short codes (UA, DL, AC, BA, AF, SQ, NH, BR, CX, EK)', () => {
    const codes = ['UA', 'DL', 'AC', 'BA', 'AF', 'SQ', 'NH', 'BR', 'CX', 'EK'];
    const expectedIds = [
      'ua-mileageplus',
      'dl-skymiles',
      'ac-aeroplan',
      'ba-executive-club',
      'af-flying-blue',
      'sq-krisflyer',
      'nh-mileage-club',
      'br-infinity',
      'cx-asia-miles',
      'ek-skywards',
    ];
    const parsed = parseShareUrl(`/r/v1/SFO-NRT?op=AA&p=${codes.join(',')}&c=J`);
    expect(parsed.ok).toBe(true);
    if (parsed.ok) {
      expect(parsed.request.programs).toEqual(expectedIds);
    }
  });

  test('rejects unknown cabin', () => {
    const parsed = parseShareUrl('/r/v1/SFO-NRT?op=AA&p=AA&c=Z');
    expect(parsed.ok).toBe(false);
    if (!parsed.ok) {
      expect(parsed.kind).toBe('unknown-cabin');
    }
  });

  test('rejects invalid IATA in chain', () => {
    const parsed = parseShareUrl('/r/v1/SFO-12-NRT?op=AA,AA&p=AA&c=J');
    expect(parsed.ok).toBe(false);
    if (!parsed.ok) {
      expect(parsed.kind).toBe('unknown-airport');
    }
  });

  test('rejects single-airport routing', () => {
    const parsed = parseShareUrl('/r/v1/SFO?op=&p=AA&c=J');
    expect(parsed.ok).toBe(false);
  });

  test('rejects bad rules version format', () => {
    const parsed = parseShareUrl('/r/v1/SFO-NRT?op=AA&p=AA&c=J&rv=2026-Q4');
    expect(parsed.ok).toBe(false);
    if (!parsed.ok) {
      expect(parsed.kind).toBe('malformed-path');
    }
  });

  test('parses projection short code (proj=a)', () => {
    const parsed = parseShareUrl('/r/v1/SFO-NRT?op=AA&p=AA&c=J&proj=a');
    expect(parsed.ok).toBe(true);
    if (parsed.ok) {
      expect(parsed.request.projection).toBe('azimuthal-equidistant');
    }
  });

  test('parses projection short code (proj=o)', () => {
    const parsed = parseShareUrl('/r/v1/SFO-NRT?op=AA&p=AA&c=J&proj=o');
    expect(parsed.ok).toBe(true);
    if (parsed.ok) {
      expect(parsed.request.projection).toBe('orthographic');
    }
  });

  test('rejects unknown projection short code', () => {
    const parsed = parseShareUrl('/r/v1/SFO-NRT?op=AA&p=AA&c=J&proj=z');
    expect(parsed.ok).toBe(false);
  });

  test('backwards-compat: URL with no proj= defaults to mercator (v1.0 behavior)', () => {
    const parsed = parseShareUrl('/r/v1/SFO-NRT?op=AA&p=AA&c=J');
    expect(parsed.ok).toBe(true);
    if (parsed.ok) {
      expect(parsed.request.projection).toBe('mercator');
    }
  });

  test('encode omits proj=m (mercator is the historic default)', () => {
    const req = {
      groups: [{ legs: [{ from: 'SFO', to: 'NRT', operatingCarrier: 'AA' }] }],
      cabin: 'business' as const,
      programs: ['aa-aadvantage' as const],
      projection: 'mercator' as const,
    };
    expect(encodeShareUrl(req)).not.toContain('proj=');
  });

  test('encode includes proj=o for orthographic', () => {
    const req = {
      groups: [{ legs: [{ from: 'SFO', to: 'NRT', operatingCarrier: 'AA' }] }],
      cabin: 'business' as const,
      programs: ['aa-aadvantage' as const],
      projection: 'orthographic' as const,
    };
    expect(encodeShareUrl(req)).toContain('proj=o');
  });
});

describe('parseShareUrl (multi-group)', () => {
  test('round-trips multi-group fixture', () => {
    const encoded = encodeShareUrl(MULTI_GROUP);
    const parsed = parseShareUrl(encoded);
    expect(parsed.ok).toBe(true);
    if (parsed.ok) {
      expect(parsed.request.groups.length).toBe(2);
      expect(parsed.request.groups[0]?.legs.length).toBe(2);
      expect(parsed.request.groups[1]?.legs.length).toBe(2);
      expect(parsed.request.groups[1]?.legs[0]?.from).toBe('JFK');
      expect(parsed.request.groups[1]?.legs[1]?.to).toBe('CDG');
    }
  });

  test('parses 3 groups', () => {
    const parsed = parseShareUrl('/r/v1/SFO-NRT,LAX-HKG,JFK-LHR?op=AA;AS;BA&p=AA&c=J');
    expect(parsed.ok).toBe(true);
    if (parsed.ok) {
      expect(parsed.request.groups.length).toBe(3);
    }
  });

  test('rejects mismatched group count (path vs op)', () => {
    const parsed = parseShareUrl('/r/v1/SFO-NRT,LAX-HKG?op=AA&p=AA&c=J');
    expect(parsed.ok).toBe(false);
    if (!parsed.ok) {
      expect(parsed.kind).toBe('mismatched-op-length');
    }
  });

  test('rejects empty group in path', () => {
    const parsed = parseShareUrl('/r/v1/SFO-NRT,?op=AA;&p=AA&c=J');
    expect(parsed.ok).toBe(false);
  });

  test('emits encode-roundtrip for projection in multi-group', () => {
    const req: RoutingRequest = {
      ...MULTI_GROUP,
      projection: 'azimuthal-equidistant',
    };
    const parsed = parseShareUrl(encodeShareUrl(req));
    expect(parsed.ok).toBe(true);
    if (parsed.ok) {
      expect(parsed.request.projection).toBe('azimuthal-equidistant');
      expect(parsed.request.groups.length).toBe(2);
    }
  });
});

describe('per-leg fare class (v1.5)', () => {
  test('encode omits fc when no leg has a fare class — preserves v0-v1.4 URLs', () => {
    const url = encodeShareUrl(SINGLE_GROUP);
    expect(url).not.toContain('fc=');
  });

  test('encode includes fc when at least one leg has a fare class', () => {
    const req: RoutingRequest = {
      ...SINGLE_GROUP,
      groups: [
        {
          legs: [
            { from: 'SFO', to: 'NRT', operatingCarrier: 'AA', fareClass: 'J' },
            { from: 'NRT', to: 'BKK', operatingCarrier: 'JL', fareClass: 'D' },
            { from: 'BKK', to: 'HKG', operatingCarrier: 'CX', fareClass: 'I' },
          ],
        },
      ],
    };
    const url = encodeShareUrl(req);
    // %2C is `,`
    expect(url).toContain('fc=J%2CD%2CI');
  });

  test('encode keeps empty cells for legs without fare class', () => {
    const req: RoutingRequest = {
      ...SINGLE_GROUP,
      groups: [
        {
          legs: [
            { from: 'SFO', to: 'NRT', operatingCarrier: 'AA', fareClass: 'J' },
            { from: 'NRT', to: 'BKK', operatingCarrier: 'JL' },
            { from: 'BKK', to: 'HKG', operatingCarrier: 'CX', fareClass: 'I' },
          ],
        },
      ],
    };
    const url = encodeShareUrl(req);
    // `,` → %2C; expect "fc=J,,I" → fc=J%2C%2CI
    expect(url).toContain('fc=J%2C%2CI');
  });

  test('parse round-trips per-leg fare class', () => {
    const req: RoutingRequest = {
      ...SINGLE_GROUP,
      groups: [
        {
          legs: [
            { from: 'SFO', to: 'NRT', operatingCarrier: 'AA', fareClass: 'J' },
            { from: 'NRT', to: 'BKK', operatingCarrier: 'JL', fareClass: 'D' },
            { from: 'BKK', to: 'HKG', operatingCarrier: 'CX', fareClass: 'I' },
          ],
        },
      ],
    };
    const parsed = parseShareUrl(encodeShareUrl(req));
    expect(parsed.ok).toBe(true);
    if (parsed.ok) {
      expect(parsed.request.groups[0]?.legs[0]?.fareClass).toBe('J');
      expect(parsed.request.groups[0]?.legs[1]?.fareClass).toBe('D');
      expect(parsed.request.groups[0]?.legs[2]?.fareClass).toBe('I');
    }
  });

  test('parse handles per-leg empty cells', () => {
    // 4 airports → 3 legs → fc has 3 cells; the middle one is empty.
    const parsed = parseShareUrl('/r/v1/SFO-NRT-BKK-HKG?op=AA,JL,CX&p=AA&c=J&fc=J,,Y');
    expect(parsed.ok).toBe(true);
    if (parsed.ok) {
      expect(parsed.request.groups[0]?.legs[0]?.fareClass).toBe('J');
      expect(parsed.request.groups[0]?.legs[1]?.fareClass).toBeUndefined();
      expect(parsed.request.groups[0]?.legs[2]?.fareClass).toBe('Y');
    }
  });

  test('parse handles multi-group fc semicolons', () => {
    const parsed = parseShareUrl(
      '/r/v1/SFO-NRT,JFK-LHR-CDG?op=AA;BA,BA&p=AA&c=J&fc=J;C,C',
    );
    expect(parsed.ok).toBe(true);
    if (parsed.ok) {
      expect(parsed.request.groups[0]?.legs[0]?.fareClass).toBe('J');
      expect(parsed.request.groups[1]?.legs[0]?.fareClass).toBe('C');
      expect(parsed.request.groups[1]?.legs[1]?.fareClass).toBe('C');
    }
  });

  test('parse rejects malformed fare-class letter', () => {
    const parsed = parseShareUrl('/r/v1/SFO-NRT?op=AA&p=AA&c=J&fc=JJ');
    expect(parsed.ok).toBe(false);
    if (!parsed.ok) {
      expect(parsed.kind).toBe('malformed-path');
    }
  });

  test('parse rejects fc group count mismatch with path', () => {
    const parsed = parseShareUrl('/r/v1/SFO-NRT,JFK-LHR?op=AA;BA&p=AA&c=J&fc=J');
    expect(parsed.ok).toBe(false);
    if (!parsed.ok) {
      expect(parsed.kind).toBe('mismatched-op-length');
    }
  });

  test('parse rejects fc leg count mismatch within group', () => {
    const parsed = parseShareUrl('/r/v1/SFO-NRT-BKK?op=AA,JL&p=AA&c=J&fc=J');
    expect(parsed.ok).toBe(false);
    if (!parsed.ok) {
      expect(parsed.kind).toBe('mismatched-op-length');
    }
  });

  test('every v0-v1.4 URL without fc still parses identically', () => {
    // The exact format of pre-fc URLs.
    const parsed = parseShareUrl('/r/v1/SFO-NRT-BKK?op=AA,JL&p=AA,AS&c=J');
    expect(parsed.ok).toBe(true);
    if (parsed.ok) {
      for (const leg of parsed.request.groups[0]?.legs ?? []) {
        expect(leg.fareClass).toBeUndefined();
      }
    }
  });
});

describe('status tier (v1.9)', () => {
  test('encode omits st when tier is none or undefined', () => {
    expect(encodeShareUrl(SINGLE_GROUP)).not.toContain('st=');
    const noneReq: RoutingRequest = { ...SINGLE_GROUP, tier: 'none' };
    expect(encodeShareUrl(noneReq)).not.toContain('st=');
  });

  test('encode includes st=t for top tier', () => {
    const req: RoutingRequest = { ...SINGLE_GROUP, tier: 'top' };
    expect(encodeShareUrl(req)).toContain('st=t');
  });

  test('parse round-trips tier=high', () => {
    const req: RoutingRequest = { ...SINGLE_GROUP, tier: 'high' };
    const parsed = parseShareUrl(encodeShareUrl(req));
    expect(parsed.ok).toBe(true);
    if (parsed.ok) {
      expect(parsed.request.tier).toBe('high');
    }
  });

  test('parse rejects invalid tier letter', () => {
    const parsed = parseShareUrl('/r/v1/SFO-NRT?op=AA&p=AA&c=J&st=z');
    expect(parsed.ok).toBe(false);
    if (!parsed.ok) {
      expect(parsed.kind).toBe('malformed-path');
    }
  });

  test('every v0-v1.8 URL without st still parses identically', () => {
    const parsed = parseShareUrl('/r/v1/SFO-NRT-BKK?op=AA,JL&p=AA,AS&c=J');
    expect(parsed.ok).toBe(true);
    if (parsed.ok) {
      expect(parsed.request.tier).toBeUndefined();
    }
  });
});
