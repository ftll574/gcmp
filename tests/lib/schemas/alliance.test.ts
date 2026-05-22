import { readFileSync } from 'node:fs';
import { describe, expect, test } from 'vitest';
import { AllianceCatalogSchema } from '../../../src/lib/schemas/alliance.ts';

const catalog = AllianceCatalogSchema.parse(
  JSON.parse(readFileSync('public/data/alliances/current.json', 'utf8')),
);

describe('AllianceCatalogSchema', () => {
  test('validates the current alliance catalog', () => {
    expect(catalog.version).toBe('2026.2');
    expect(catalog.memberships.length).toBeGreaterThan(50);
  });

  test('contains current full-member counts for the big three alliances', () => {
    const activeMembers = catalog.memberships.filter((m) => m.status === 'member');

    expect(activeMembers.filter((m) => m.alliance === 'oneworld')).toHaveLength(16);
    expect(activeMembers.filter((m) => m.alliance === 'star')).toHaveLength(26);
    expect(activeMembers.filter((m) => m.alliance === 'skyteam')).toHaveLength(18);
  });

  test('captures recent alliance changes needed for RTW validation', () => {
    expect(catalog.memberships).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ airline: 'HA', alliance: 'oneworld', status: 'member' }),
        expect.objectContaining({ airline: 'WY', alliance: 'oneworld', status: 'member' }),
        expect.objectContaining({ airline: 'AZ', alliance: 'star', status: 'member' }),
        expect.objectContaining({ airline: 'SK', alliance: 'skyteam', status: 'member' }),
        expect.objectContaining({ airline: 'S7', alliance: 'oneworld', status: 'suspended' }),
      ]),
    );
  });
});
