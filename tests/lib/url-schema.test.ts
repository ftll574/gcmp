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

const FIXTURE: RoutingRequest = {
  legs: [
    { from: 'SFO', to: 'NRT', operatingCarrier: 'AA' },
    { from: 'NRT', to: 'BKK', operatingCarrier: 'JL' },
    { from: 'BKK', to: 'HKG', operatingCarrier: 'CX' },
  ],
  cabin: 'business',
  programs: ['aa-aadvantage', 'as-mileage-plan'],
  rulesVersion: '2026.4',
};

describe('encodeShareUrl', () => {
  test('produces /r/v1/IATA-IATA-... path', () => {
    const url = encodeShareUrl(FIXTURE);
    expect(url).toMatch(/^\/r\/v1\/SFO-NRT-BKK-HKG\?/);
  });

  test('includes op, p, c, rv query params', () => {
    const url = encodeShareUrl(FIXTURE);
    expect(url).toContain('op=AA%2CJL%2CCX'); // comma-encoded
    expect(url).toContain('p=AA%2CAS');
    expect(url).toContain('c=J');
    expect(url).toContain('rv=2026.4');
  });

  test('omits rv when undefined', () => {
    const noRv: RoutingRequest = { ...FIXTURE };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const stripped = { ...noRv } as any;
    delete stripped.rulesVersion;
    const url = encodeShareUrl(stripped);
    expect(url).not.toContain('rv=');
  });
});

describe('parseShareUrl', () => {
  test('round-trips the fixture exactly', () => {
    const encoded = encodeShareUrl(FIXTURE);
    const parsed = parseShareUrl(encoded);
    expect(parsed.ok).toBe(true);
    if (parsed.ok) {
      expect(parsed.request.legs).toEqual(FIXTURE.legs);
      expect(parsed.request.cabin).toBe('business');
      expect(parsed.request.programs).toEqual(['aa-aadvantage', 'as-mileage-plan']);
      expect(parsed.request.rulesVersion).toBe('2026.4');
    }
  });

  test('parses full URL with origin', () => {
    const encoded = encodeShareUrl(FIXTURE);
    const parsed = parseShareUrl(`https://gcmp.example.com${encoded}`);
    expect(parsed.ok).toBe(true);
  });

  test('rejects wrong schema version with typed error', () => {
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

  test('rejects unknown cabin code', () => {
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

  test('parses projection short code (proj=a → azimuthal-equidistant)', () => {
    const parsed = parseShareUrl('/r/v1/SFO-NRT?op=AA&p=AA&c=J&proj=a');
    expect(parsed.ok).toBe(true);
    if (parsed.ok) {
      expect(parsed.request.projection).toBe('azimuthal-equidistant');
    }
  });

  test('parses projection short code (proj=o → orthographic)', () => {
    const parsed = parseShareUrl('/r/v1/SFO-NRT?op=AA&p=AA&c=J&proj=o');
    expect(parsed.ok).toBe(true);
    if (parsed.ok) {
      expect(parsed.request.projection).toBe('orthographic');
    }
  });

  test('rejects unknown projection short code', () => {
    const parsed = parseShareUrl('/r/v1/SFO-NRT?op=AA&p=AA&c=J&proj=z');
    expect(parsed.ok).toBe(false);
    if (!parsed.ok) {
      expect(parsed.kind).toBe('malformed-path');
    }
  });

  test('omits proj from encode when projection is mercator (default)', () => {
    const req = {
      legs: [{ from: 'SFO', to: 'NRT', operatingCarrier: 'AA' }],
      cabin: 'business' as const,
      programs: ['aa-aadvantage' as const],
      projection: 'mercator' as const,
    };
    const encoded = encodeShareUrl(req);
    expect(encoded).not.toContain('proj=');
  });

  test('emits proj from encode when projection is non-default', () => {
    const req = {
      legs: [{ from: 'SFO', to: 'NRT', operatingCarrier: 'AA' }],
      cabin: 'business' as const,
      programs: ['aa-aadvantage' as const],
      projection: 'azimuthal-equidistant' as const,
    };
    const encoded = encodeShareUrl(req);
    expect(encoded).toContain('proj=a');
  });

  test('round-trips projection through encode → parse', () => {
    const req = {
      legs: [{ from: 'SFO', to: 'NRT', operatingCarrier: 'AA' }],
      cabin: 'business' as const,
      programs: ['aa-aadvantage' as const],
      projection: 'orthographic' as const,
    };
    const parsed = parseShareUrl(encodeShareUrl(req));
    expect(parsed.ok).toBe(true);
    if (parsed.ok) {
      expect(parsed.request.projection).toBe('orthographic');
    }
  });
});
