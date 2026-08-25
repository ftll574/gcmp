import { describe, expect, test } from 'vitest';
import { readFileSync } from 'node:fs';
import { quoteCiLeg, resolveCiZone } from '../../../src/lib/rtw/ci-zones.ts';
import { AwardPricingCatalogSchema } from '../../../src/lib/schemas/award-pricing.ts';
import type { AwardPricingCatalog } from '../../../src/lib/schemas/award-pricing.ts';
import { CiZoneMapSchema } from '../../../src/lib/schemas/ci-zones.ts';
import type { CiZoneMap } from '../../../src/lib/schemas/ci-zones.ts';

// Inline Phase-12 fixtures — the schema + pure resolver ship against
// synthetic data; the real ci-zones.json lands after the research pass.

/** Tiny zone chart: NEA-SEA stored business-only, NEA-EU fully priced. */
const fixtureCatalog: AwardPricingCatalog = AwardPricingCatalogSchema.parse({
  version: '2026.2',
  lastVerified: '2026-08-24',
  products: [
    {
      productId: 'fixture-ci-zone-chart',
      label: 'Fixture CI SkyTeam partner zone chart',
      pricingModel: 'zone-pair',
      confidence: 'published-chart',
      currency: 'miles',
      sourceUrls: ['https://example.com/ci-skyteam-chart'],
      zones: ['NEA', 'SEA', 'EU'],
      zoneMatrix: [
        {
          originRegion: 'NEA',
          destinationRegion: 'SEA',
          prices: { business: 60000 },
        },
        {
          originRegion: 'NEA',
          destinationRegion: 'EU',
          prices: { economy: 110000, premiumEconomy: 120000, business: 160000 },
        },
      ],
    },
  ],
});

const fixtureMap: CiZoneMap = CiZoneMapSchema.parse({
  version: '2026.4',
  lastVerified: '2026-08-24',
  assignments: [
    {
      airport: 'TPE',
      zone: 'NEA',
      confidence: 'chart-verified',
      sourceUrls: ['https://example.com/tpe-neaea'],
    },
    {
      airport: 'HKG',
      zone: 'SEA',
      confidence: 'community-corrected',
      sourceUrls: ['https://example.com/hkg-sea'],
    },
    {
      airport: 'LHR',
      zone: 'EU',
      confidence: 'chart-verified',
      sourceUrls: ['https://example.com/lhr-eu'],
    },
  ],
});

describe('resolveCiZone', () => {
  test('returns zone + confidence on an exact IATA hit (case-sensitive)', () => {
    expect(resolveCiZone(fixtureMap, 'TPE')).toEqual({ zone: 'NEA', confidence: 'chart-verified' });
    expect(resolveCiZone(fixtureMap, 'HKG')).toEqual({
      zone: 'SEA',
      confidence: 'community-corrected',
    });
    // Exact match only — no case folding.
    expect(resolveCiZone(fixtureMap, 'tpe')).toBeNull();
  });

  test('returns null for an unmapped airport', () => {
    expect(resolveCiZone(fixtureMap, 'SIN')).toBeNull();
    expect(resolveCiZone(fixtureMap, '')).toBeNull();
  });
});

describe('quoteCiLeg', () => {
  test('happy path: resolves both endpoints and quotes the undirected cell', () => {
    const quote = quoteCiLeg({
      catalog: fixtureCatalog,
      productId: 'fixture-ci-zone-chart',
      zoneMap: fixtureMap,
      fromAirport: 'TPE',
      toAirport: 'HKG',
      cabin: 'business',
    });
    // Resolved origin/destination regions surface through getZonePairQuote
    // in the canonical STORED direction of the matched cell.
    expect(quote?.originRegion).toBe('NEA');
    expect(quote?.destinationRegion).toBe('SEA');
    expect(quote?.cabin).toBe('business');
    expect(quote?.miles).toBe(60000);
    expect(quote?.prices).toEqual({ business: 60000 });

    const euQuote = quoteCiLeg({
      catalog: fixtureCatalog,
      productId: 'fixture-ci-zone-chart',
      zoneMap: fixtureMap,
      fromAirport: 'TPE',
      toAirport: 'LHR',
      cabin: 'economy',
    });
    expect(euQuote?.miles).toBe(110000);
    expect(euQuote?.prices).toEqual({ economy: 110000, premiumEconomy: 120000, business: 160000 });
  });

  test('null when the FROM airport is unmapped', () => {
    expect(
      quoteCiLeg({
        catalog: fixtureCatalog,
        productId: 'fixture-ci-zone-chart',
        zoneMap: fixtureMap,
        fromAirport: 'SIN',
        toAirport: 'HKG',
        cabin: 'business',
      }),
    ).toBeNull();
  });

  test('null when the TO airport is unmapped', () => {
    expect(
      quoteCiLeg({
        catalog: fixtureCatalog,
        productId: 'fixture-ci-zone-chart',
        zoneMap: fixtureMap,
        fromAirport: 'TPE',
        toAirport: 'LAX',
        cabin: 'business',
      }),
    ).toBeNull();
  });

  test('null when the requested cabin is unpriced in that cell', () => {
    // NEA-SEA pins business only — economy/first stay null, never guessed.
    expect(
      quoteCiLeg({
        catalog: fixtureCatalog,
        productId: 'fixture-ci-zone-chart',
        zoneMap: fixtureMap,
        fromAirport: 'TPE',
        toAirport: 'HKG',
        cabin: 'economy',
      }),
    ).toBeNull();
    expect(
      quoteCiLeg({
        catalog: fixtureCatalog,
        productId: 'fixture-ci-zone-chart',
        zoneMap: fixtureMap,
        fromAirport: 'TPE',
        toAirport: 'HKG',
        cabin: 'first',
      }),
    ).toBeNull();
  });

  test('directed input is irrelevant to lookup: either direction finds the same undirected cell', () => {
    const forward = quoteCiLeg({
      catalog: fixtureCatalog,
      productId: 'fixture-ci-zone-chart',
      zoneMap: fixtureMap,
      fromAirport: 'TPE',
      toAirport: 'HKG',
      cabin: 'business',
    });
    const reverse = quoteCiLeg({
      catalog: fixtureCatalog,
      productId: 'fixture-ci-zone-chart',
      zoneMap: fixtureMap,
      fromAirport: 'HKG',
      toAirport: 'TPE',
      cabin: 'business',
    });
    // Same undirected cell, same price; canonical stored direction reported
    // regardless of query direction.
    expect(reverse?.miles).toBe(forward?.miles);
    expect(reverse?.originRegion).toBe('NEA');
    expect(reverse?.destinationRegion).toBe('SEA');

    // A chart that stores the pair flipped (SEA→NEA) still answers a
    // forward NEA→SEA query — storage orientation is invisible to callers.
    const flippedCatalog: AwardPricingCatalog = AwardPricingCatalogSchema.parse({
      version: '2026.2',
      lastVerified: '2026-08-24',
      products: [
        {
          productId: 'fixture-ci-zone-chart-flipped',
          label: 'Fixture with SEA→NEA storage order',
          pricingModel: 'zone-pair',
          confidence: 'published-chart',
          currency: 'miles',
          sourceUrls: ['https://example.com/ci-skyteam-chart'],
          zones: ['NEA', 'SEA', 'EU'],
          zoneMatrix: [
            { originRegion: 'SEA', destinationRegion: 'NEA', prices: { business: 60000 } },
            {
              originRegion: 'NEA',
              destinationRegion: 'EU',
              prices: { economy: 110000, premiumEconomy: 120000, business: 160000 },
            },
          ],
        },
      ],
    });
    const viaFlipped = quoteCiLeg({
      catalog: flippedCatalog,
      productId: 'fixture-ci-zone-chart-flipped',
      zoneMap: fixtureMap,
      fromAirport: 'TPE',
      toAirport: 'HKG',
      cabin: 'business',
    });
    expect(viaFlipped?.miles).toBe(60000);
    expect(viaFlipped?.originRegion).toBe('SEA');
    expect(viaFlipped?.destinationRegion).toBe('NEA');
  });
});

describe('REAL coverage (public/data/geo/ci-zones.json × schedules catalog)', () => {
  test('every CI schedule-catalog endpoint resolves through the zone map', () => {
    const zoneMap = CiZoneMapSchema.parse(
      JSON.parse(readFileSync('public/data/geo/ci-zones.json', 'utf8')),
    );
    const rawSchedules = JSON.parse(
      readFileSync('public/data/schedules/current.json', 'utf8'),
    ) as { entries: Array<{ carrier: string; pair: string[] }> };

    const ciEndpoints = new Set<string>();
    for (const entry of rawSchedules.entries) {
      if (entry.carrier !== 'CI') continue;
      const from = entry.pair[0];
      const to = entry.pair[1];
      if (from !== undefined) ciEndpoints.add(from);
      if (to !== undefined) ciEndpoints.add(to);
    }
    // §A11/§A12 baseline: CI's pinned network spans 31 stations.
    expect(ciEndpoints.size).toBe(31);

    const unresolved = [...ciEndpoints].filter((airport) => !resolveCiZone(zoneMap, airport));
    expect(unresolved).toEqual([]);
  });
});
