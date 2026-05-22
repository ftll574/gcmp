/**
 * forumPost formatter smoke tests. We don't snapshot byte-exact output
 * (column widths shift as program labels change) — we assert structural
 * invariants: includes route, fare class, totals, share URL, no NaN.
 */

import { describe, expect, test } from 'vitest';
import { formatForumPost } from '../../src/lib/forum-post.ts';
import type { RoutingRequest, RoutingResult } from '../../src/lib/types.ts';

const REQUEST: RoutingRequest = {
  groups: [
    {
      legs: [
        { from: 'SFO', to: 'NRT', operatingCarrier: 'AA', fareClass: 'J' },
        { from: 'NRT', to: 'BKK', operatingCarrier: 'JL', fareClass: 'D' },
      ],
    },
  ],
  cabin: 'business',
  programs: ['aa-aadvantage', 'as-mileage-plan'],
};

const RESULT: RoutingResult = {
  groups: [
    {
      totalDistanceNm: 7432,
      byLeg: [
        {
          leg: { from: 'SFO', to: 'NRT', operatingCarrier: 'AA', fareClass: 'J' },
          distanceNm: 4470,
        },
        {
          leg: { from: 'NRT', to: 'BKK', operatingCarrier: 'JL', fareClass: 'D' },
          distanceNm: 2962,
        },
      ],
      programs: {
        'aa-aadvantage': {
          programId: 'aa-aadvantage',
          label: 'AA AAdvantage',
          confidence: 'chart-verified',
          pqm: 7580,
          rdm: 7580,
          byLeg: [
            { pqm: 4470, rdm: 4470, distanceNm: 4470, notes: [], missingRule: false },
            { pqm: 3110, rdm: 3110, distanceNm: 2962, notes: [], missingRule: false },
          ],
          notes: [],
          rulesVersion: '2026.4',
          lastVerified: '2026-05-21',
          sourceUrl: 'https://aa.com/chart',
        },
        'as-mileage-plan': {
          programId: 'as-mileage-plan',
          label: 'Alaska Mileage Plan',
          confidence: 'chart-verified',
          pqm: 9290,
          rdm: 9290,
          byLeg: [
            { pqm: 5587, rdm: 5587, distanceNm: 4470, notes: [], missingRule: false },
            { pqm: 3703, rdm: 3703, distanceNm: 2962, notes: [], missingRule: false },
          ],
          notes: [],
          rulesVersion: '2026.4',
          lastVerified: '2026-05-21',
          sourceUrl: 'https://alaskaair.com/chart',
        },
      },
      warnings: [],
    },
  ],
  grandTotalDistanceNm: 7432,
  grandTotals: {
    'aa-aadvantage': { pqm: 7580, rdm: 7580 },
    'as-mileage-plan': { pqm: 9290, rdm: 9290 },
  },
  rulesVersionUsed: '2026.4',
};

describe('formatForumPost', () => {
  const out = formatForumPost({
    request: REQUEST,
    result: RESULT,
    shareUrl: 'https://gcmp.app/#/r/v1/SFO-NRT-BKK?op=AA,JL&p=AA,AS&c=J&fc=J,D',
  });

  test('includes the routing chain', () => {
    expect(out).toContain('SFO → NRT → BKK');
  });

  test('includes cabin label', () => {
    expect(out).toContain('Business');
  });

  test('includes the share URL on its own line', () => {
    expect(out.trim().endsWith('https://gcmp.app/#/r/v1/SFO-NRT-BKK?op=AA,JL&p=AA,AS&c=J&fc=J,D')).toBe(true);
  });

  test('includes fare-class letters', () => {
    expect(out).toContain('J');
    expect(out).toContain('D');
  });

  test('includes operating carriers', () => {
    expect(out).toContain('AA');
    expect(out).toContain('JL');
  });

  test('includes per-program label (short form)', () => {
    expect(out).toContain('AA'); // AA AAdvantage → "AA"
    expect(out).toContain('Alaska');
  });

  test('includes the grand total distance', () => {
    expect(out).toContain('7,432');
  });

  test('includes per-program grand totals', () => {
    expect(out).toContain('7,580');
    expect(out).toContain('9,290');
  });

  test('rules version + verification', () => {
    expect(out).toContain('Rules 2026.4');
  });

  test('contains the horizontal rule separator', () => {
    expect(out).toContain('─');
  });

  test('does not contain NaN or undefined', () => {
    expect(out).not.toContain('NaN');
    expect(out).not.toContain('undefined');
  });
});
