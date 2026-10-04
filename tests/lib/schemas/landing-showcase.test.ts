import { readFileSync } from 'node:fs';
import { describe, expect, test } from 'vitest';
import { LandingShowcaseCatalogSchema, LandingShowcaseLegSchema } from '../../../src/lib/schemas/landing-showcase.ts';
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
    expect(Buffer.byteLength(JSON.stringify(landing))).toBeLessThan(24_000);
    expect(landing.showcases).toHaveLength(4);
    expect(landing.airports).toHaveLength(15);
    expect(landing.showcases.reduce((sum, showcase) => sum + showcase.legs.length, 0)).toBe(24);
    expect(landing.stats).toMatchObject({ publishedRoutes: runtime.routes.filter((route) => route.status === 'published').length, allianceMembers: 60, alliances: 3 });
    expect(landing.builtOn).toBe(runtimeMeta.builtOn);
  });

  test('every animated leg retains route evidence and honestly labels its operating uncertainty', () => {
    for (const showcase of landing.showcases) {
      for (const leg of showcase.legs) {
        const route = runtime.routes.find((candidate) =>
          candidate.status === 'published' &&
          candidate.carrier === leg.carrier &&
          candidate.pair[0] === leg.from &&
          candidate.pair[1] === leg.to,
        );
        expect(route, `${leg.carrier} ${leg.from}-${leg.to}`).toBeDefined();
        expect(leg.carrierIdentity).toBe(route?.carrierIdentity ?? 'unknown');
        expect(leg.flightNumberStatus).toBe(route?.carrierIdentity === 'operating' && route.flightNumbers?.includes(leg.flightNumber) ? 'confirmed' : 'candidate');
        expect(leg.sourceUrls.length).toBeGreaterThan(0);
        expect([...(route?.flightNumbers ?? []), ...(route?.flightNumberCandidates ?? [])]).toContain(leg.flightNumber);
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

test('missing identity cannot produce a confirmed showcase flight', () => {
  const leg = { from: 'TPE', to: 'HKG', carrier: 'CX', carrierName: 'Fixture', flightNumber: 'CX1', distanceNm: 440, flightNumberStatus: 'confirmed' };
  expect(LandingShowcaseLegSchema.safeParse(leg).success).toBe(false);
  expect(LandingShowcaseLegSchema.safeParse({ ...leg, carrierIdentity: 'provider-listed' }).success).toBe(false);
  expect(LandingShowcaseLegSchema.safeParse({ ...leg, carrierIdentity: 'operating' }).success).toBe(true);
});
