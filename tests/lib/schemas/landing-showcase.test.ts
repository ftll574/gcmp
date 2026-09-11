import { readFileSync } from 'node:fs';
import { describe, expect, test } from 'vitest';
import { LandingShowcaseCatalogSchema } from '../../../src/lib/schemas/landing-showcase.ts';
import { parseAirportCatalog } from '../../../src/lib/schemas/airports.ts';
import { parseRouteNetworkCatalog } from '../../../src/lib/schemas/route-network.ts';

const landing = LandingShowcaseCatalogSchema.parse(
  JSON.parse(readFileSync('public/data/site/landing-showcases.json', 'utf8')),
);
const airports = parseAirportCatalog(JSON.parse(readFileSync('public/data/airports.json', 'utf8')));
const runtime = parseRouteNetworkCatalog(
  JSON.parse(readFileSync('public/data/route-network/runtime-current.json', 'utf8')),
  new Set(airports.map((airport) => airport.iata)),
);
const runtimeMeta = JSON.parse(
  readFileSync('public/data/route-network/runtime-current.meta.json', 'utf8'),
) as { builtOn?: unknown };

describe('landing showcase catalog', () => {
  test('stays intentionally tiny compared with planner data', () => {
    expect(Buffer.byteLength(JSON.stringify(landing))).toBeLessThan(12_000);
    expect(landing.showcases).toHaveLength(4);
    expect(landing.airports).toHaveLength(15);
    expect(landing.showcases.reduce((sum, showcase) => sum + showcase.legs.length, 0)).toBe(24);
    expect(landing.stats).toMatchObject({ publishedRoutes: 30_099, allianceMembers: 60, alliances: 3 });
    expect(landing.builtOn).toBe(runtimeMeta.builtOn);
  });

  test('every animated leg remains a current operating route with the displayed confirmed designator', () => {
    for (const showcase of landing.showcases) {
      for (const leg of showcase.legs) {
        const route = runtime.routes.find((candidate) =>
          candidate.status === 'published' &&
          candidate.carrier === leg.carrier &&
          candidate.pair[0] === leg.from &&
          candidate.pair[1] === leg.to,
        );
        expect(route, `${leg.carrier} ${leg.from}-${leg.to}`).toBeDefined();
        expect(route?.carrierIdentity).not.toBe('provider-listed');
        expect(route?.flightNumbers).toContain(leg.flightNumber);
      }
    }
  });

  test('covers a Star, oneworld, SkyTeam and Taiwan-focused mixed pattern', () => {
    expect(landing.showcases.map((showcase) => showcase.alliance)).toEqual(['star', 'oneworld', 'skyteam', 'mixed']);
    expect(landing.showcases[0]?.legs[0]).toMatchObject({ from: 'TPE', to: 'NRT', flightNumber: 'BR184' });
    expect(landing.showcases[1]?.legs[0]).toMatchObject({ from: 'TPE', to: 'HKG', flightNumber: 'CX407' });
    expect(landing.showcases[2]?.legs[0]).toMatchObject({ from: 'TPE', to: 'ICN', flightNumber: 'KE2022' });
    expect(landing.showcases[3]?.legs[0]).toMatchObject({ from: 'TPE', to: 'SFO', flightNumber: 'BR8' });
  });
});
