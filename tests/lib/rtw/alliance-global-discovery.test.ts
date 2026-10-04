import { expect, test } from 'vitest';
import allianceRaw from '../../../public/data/alliances/current.json' with { type: 'json' };
import runtimeMetaRaw from '../../../public/data/route-network/runtime-current.meta.json' with { type: 'json' };
import { AllianceCatalogSchema } from '../../../src/lib/schemas/alliance.ts';

test('all 60 active three-alliance members retain route discovery without overstating operating proof', () => {
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
    const routeCount = runtimeMetaRaw.routeCountByCarrier[membership.airline] ?? 0;
    const confirmedOperatingCount = runtimeMetaRaw.confirmedOperatingCountByCarrier[membership.airline] ?? 0;
    expect(routeCount).toBeGreaterThan(0);
    expect(confirmedOperatingCount).toBeGreaterThanOrEqual(0);
    expect(confirmedOperatingCount).toBeLessThanOrEqual(routeCount);
  }
  expect(Object.values(runtimeMetaRaw.confirmedOperatingCountByCarrier).some((count) => count > 0)).toBe(true);
});
