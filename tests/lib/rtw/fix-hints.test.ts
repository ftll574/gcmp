/**
 * Unit tests for violation fix hints v1 (docs/convergence-contract.md §3):
 * exactly five high-frequency fail rules get one textual remedy each;
 * everything else falls back to null so the UI shows the plain rule text.
 */
import { describe, expect, test } from 'vitest';
import {
  fixHintForFinding,
  type FixHintContext,
} from '../../../src/lib/rtw/fix-hints.ts';
import type { RtwFinding } from '../../../src/lib/rtw/validate.ts';

const finding = (
  overrides: Partial<RtwFinding> & Pick<RtwFinding, 'ruleId'>,
): RtwFinding => ({
  severity: 'fail',
  message: 'test',
  ...overrides,
});

const noContext: FixHintContext = {};

describe('fixHintForFinding — coverage boundary', () => {
  test('returns a hint only for the five contracted rules', () => {
    // Contract §3 coverage is closed; this pins it against scope creep.
    // Minimal params per rule so each covered id actually emits a hint.
    const covered: ReadonlyArray<[string, RtwFinding]> = [
      [
        'flight-segments',
        finding({ ruleId: 'flight-segments', messageParams: { count: 12, min: 2, max: 10 } }),
      ],
      [
        'stopovers',
        finding({ ruleId: 'stopovers', messageParams: { count: 7, unknown: 0, min: 0, max: 5 } }),
      ],
      ['max-distance', finding({ ruleId: 'max-distance' })],
      ['airline-eligibility', finding({ ruleId: 'airline-eligibility' })],
      [
        'ocean-crossings',
        finding({ ruleId: 'ocean-crossings', messageParams: { missing: 'Pacific' } }),
      ],
    ];
    for (const [ruleId, f] of covered) {
      expect(fixHintForFinding(f, noContext)?.ruleId).toBe(ruleId);
    }
  });

  test('uncovered fail rules fall back to null', () => {
    expect(
      fixHintForFinding(finding({ ruleId: 'prohibited-ocean-combination' }), noContext),
    ).toBeNull();
    expect(fixHintForFinding(finding({ ruleId: 'direction' }), noContext)).toBeNull();
    expect(fixHintForFinding(finding({ ruleId: 'start-end' }), noContext)).toBeNull();
    expect(
      fixHintForFinding(finding({ ruleId: 'leg-chronology' }), noContext),
    ).toBeNull();
  });

  test('non-fail severities of covered rules return null', () => {
    for (const severity of ['pass', 'warning', 'unknown'] as const) {
      expect(
        fixHintForFinding(
          finding({ ruleId: 'flight-segments', severity }),
          noContext,
        ),
      ).toBeNull();
    }
  });
});

describe('flight-segments remedies', () => {
  test('too many segments → drop count', () => {
    const hint = fixHintForFinding(
      finding({
        ruleId: 'flight-segments',
        messageParams: { count: 12, min: 2, max: 10 },
      }),
      noContext,
    );

    expect(hint?.remedyKey).toBe('rtw.fix.flightSegmentsTooMany');
    expect(hint?.remedyParams).toEqual({ drop: 2 });
  });

  test('too few segments → add count', () => {
    const hint = fixHintForFinding(
      finding({
        ruleId: 'flight-segments',
        messageParams: { count: 1, min: 2, max: 16 },
      }),
      noContext,
    );

    expect(hint?.remedyKey).toBe('rtw.fix.flightSegmentsTooFew');
    expect(hint?.remedyParams).toEqual({ add: 1 });
  });

  test('unlimited max never produces a drop hint', () => {
    const hint = fixHintForFinding(
      finding({
        ruleId: 'flight-segments',
        messageParams: { count: 5, min: 3, max: 'unlimited' },
      }),
      noContext,
    );

    // Not actually reachable as a fail in the engine; with inconsistent
    // params (count above an "unlimited" cap, below no minimum) the hint
    // must stay silent rather than emit a nonsense remedy.
    expect(hint).toBeNull();
  });

  test('missing count param stays silent', () => {
    expect(
      fixHintForFinding(finding({ ruleId: 'flight-segments' }), noContext),
    ).toBeNull();
  });
});

describe('stopover remedies', () => {
  test('too many stopovers → convert count', () => {
    const hint = fixHintForFinding(
      finding({
        ruleId: 'stopovers',
        messageParams: { count: 7, unknown: 0, min: 0, max: 5 },
      }),
      noContext,
    );

    expect(hint?.remedyKey).toBe('rtw.fix.stopoversTooMany');
    expect(hint?.remedyParams).toEqual({ convert: 2 });
  });

  test('too few stopovers → promote count', () => {
    const hint = fixHintForFinding(
      finding({
        ruleId: 'stopovers',
        messageParams: { count: 1, unknown: 0, min: 2, max: 8 },
      }),
      noContext,
    );

    expect(hint?.remedyKey).toBe('rtw.fix.stopoversTooFew');
    expect(hint?.remedyParams).toEqual({ promote: 1 });
  });

  test('missing count param stays silent', () => {
    expect(fixHintForFinding(finding({ ruleId: 'stopovers' }), noContext)).toBeNull();
  });
});

describe('max-distance remedy', () => {
  const fail = finding({
    ruleId: 'max-distance',
    messageParams: { miles: '40,000', max: '35,000' },
  });

  test('with raw numbers the hint names the exact overage', () => {
    const hint = fixHintForFinding(fail, {
      totalDistanceMiles: 40000,
      distanceCapMiles: 35000,
    });

    expect(hint?.remedyKey).toBe('rtw.fix.maxDistanceNumbered');
    expect(hint?.remedyParams).toEqual({ over: '5,000' });
  });

  test('without raw numbers the hint stays honest and generic', () => {
    const hint = fixHintForFinding(fail, noContext);

    expect(hint?.remedyKey).toBe('rtw.fix.maxDistanceGeneric');
    expect(hint?.remedyParams).toBeUndefined();
  });

  test('context below cap still emits the generic remedy for a fail finding', () => {
    // Defensive: a fail finding with inconsistent context must not produce
    // a numbered "trim 0 miles" hint.
    const hint = fixHintForFinding(fail, {
      totalDistanceMiles: 30000,
      distanceCapMiles: 35000,
    });

    expect(hint?.remedyKey).toBe('rtw.fix.maxDistanceGeneric');
  });
});

describe('airline-eligibility remedy', () => {
  test('names the affected legs 1-based', () => {
    const hint = fixHintForFinding(
      finding({
        ruleId: 'airline-eligibility',
        affectedLegIndexes: [1, 4],
      }),
      noContext,
    );

    expect(hint?.remedyKey).toBe('rtw.fix.airlineEligibility');
    expect(hint?.legs).toEqual([2, 5]);
    expect(hint?.remedyParams).toEqual({ legs: '2, 5' });
  });

  test('works without affected leg indexes', () => {
    const hint = fixHintForFinding(
      finding({ ruleId: 'airline-eligibility' }),
      noContext,
    );

    expect(hint?.remedyKey).toBe('rtw.fix.airlineEligibility');
    expect(hint?.legs).toBeUndefined();
    expect(hint?.remedyParams).toBeUndefined();
  });
});

describe('ocean-crossing remedies', () => {
  const cases: ReadonlyArray<{
    readonly name: string;
    readonly params: Record<string, string>;
    readonly key: string;
  }> = [
    { name: 'missing pacific', params: { missing: 'Pacific' }, key: 'rtw.fix.oceanMissingPacific' },
    { name: 'missing atlantic', params: { missing: 'Atlantic' }, key: 'rtw.fix.oceanMissingAtlantic' },
    { name: 'missing both', params: { missing: 'Pacific, Atlantic' }, key: 'rtw.fix.oceanMissingBoth' },
  ];

  for (const { name, params, key } of cases) {
    test(`${name} → ${key}`, () => {
      const hint = fixHintForFinding(
        finding({ ruleId: 'ocean-crossings', messageParams: params }),
        noContext,
      );
      expect(hint?.remedyKey).toBe(key);
    });
  }

  test('empty missing set stays silent', () => {
    expect(
      fixHintForFinding(
        finding({ ruleId: 'ocean-crossings', messageParams: { oceans: '', missing: '' } }),
        noContext,
      ),
    ).toBeNull();
    expect(fixHintForFinding(finding({ ruleId: 'ocean-crossings' }), noContext)).toBeNull();
  });
});
