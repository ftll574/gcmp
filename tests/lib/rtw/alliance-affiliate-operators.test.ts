import alliancesRaw from '../../../public/data/alliances/current.json';
import { expect, test } from 'vitest';
import { allianceAffiliateOperators } from '../../../scripts/lib/alliance-affiliate-operators.ts';
import { AllianceCatalogSchema } from '../../../src/lib/schemas/alliance.ts';

test('affiliate mappings are unique and only project onto active alliance brands', () => {
  const alliances = AllianceCatalogSchema.parse(alliancesRaw);
  const active = new Set(alliances.memberships.filter((membership) => membership.status === 'member'
    && (!membership.effectiveFrom || membership.effectiveFrom <= '2026-09-08')
    && (!membership.effectiveTo || membership.effectiveTo >= '2026-09-08'))
    .map((membership) => membership.airline));
  const keys = allianceAffiliateOperators.map((row) => `${row.brand}:${row.operatorIcao}`);
  expect(new Set(keys).size).toBe(keys.length);
  expect(allianceAffiliateOperators.every((row) => active.has(row.brand))).toBe(true);
  expect(allianceAffiliateOperators.every((row) => row.sourceUrl.startsWith('https://'))).toBe(true);
  expect(keys).toEqual(expect.arrayContaining(['BA:CFE', 'IB:ANE', 'QF:QLK', 'AC:JZA', 'MU:CSH', 'AF:HOP', 'KL:KLC', 'FJ:FJA', 'AM:SLI']));
});
