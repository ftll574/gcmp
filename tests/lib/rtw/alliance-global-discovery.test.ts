import { expect, test } from 'vitest';
import allianceRaw from '../../../public/data/alliances/current.json' with { type: 'json' };
import runtimeMetaRaw from '../../../public/data/route-network/runtime-current.meta.json' with { type: 'json' };
import { AllianceCatalogSchema } from '../../../src/lib/schemas/alliance.ts';

test('all 60 active three-alliance members retain discovery and confirmed-operating route evidence', () => {
  const catalog = AllianceCatalogSchema.parse(allianceRaw);
  const current = catalog.memberships.filter((membership) => membership.status === 'member');
  const counts = new Map<string, number>();
  for (const membership of current) {
    counts.set(membership.alliance, (counts.get(membership.alliance) ?? 0) + 1);
  }
  expect([...counts.entries()].sort(([a], [b]) => a.localeCompare(b))).toEqual([
    ['oneworld', 16],
    ['skyteam', 18],
    ['star', 26],
  ]);
  expect(current).toHaveLength(60);
  for (const membership of current) {
    expect(runtimeMetaRaw.routeCountByCarrier[membership.airline] ?? 0).toBeGreaterThan(0);
    expect(runtimeMetaRaw.confirmedOperatingCountByCarrier[membership.airline] ?? 0).toBeGreaterThan(0);
  }
});
