import { readFileSync } from 'node:fs';
import { describe, expect, test } from 'vitest';
import {
  estimateAwardPrice,
  getZonePairQuote,
  priceRtwItinerary,
  quoteAwardZone,
} from '../../../src/lib/rtw/award-pricing.ts';
import { AwardPricingCatalogSchema } from '../../../src/lib/schemas/award-pricing.ts';
import type { CabinId, Leg } from '../../../src/lib/types.ts';

const catalog = AwardPricingCatalogSchema.parse(
  JSON.parse(readFileSync('public/data/award-pricing/current.json', 'utf8')),
);

// Inline fixture: same mechanics as the real products, but carrying a
// premiumEconomy price key — the live band-based products don't have one
// yet outside CI (whose Era-2 zone chart prices PE on every cell).
const peFixtureCatalog = AwardPricingCatalogSchema.parse({
  version: '2026.2',
  lastVerified: '2026-08-24',
  products: [
    {
      productId: 'fixture-pe-band',
      label: 'Fixture distance-band product with Premium Economy',
      pricingModel: 'distance-band',
      confidence: 'published-chart',
      currency: 'miles',
      sourceUrls: ['https://example.com/chart'],
      bands: [
        {
          minMiles: 0,
          maxMiles: null,
          prices: { economy: 100000, premiumEconomy: 120000, business: 200000 },
        },
      ],
    },
  ],
});

describe('estimateAwardPrice', () => {
  test('returns EVA fixed business RTW price', () => {
    const estimate = estimateAwardPrice(
      catalog,
      'br-infinity-star-alliance-world-travel-award',
      24000,
      'business',
    );

    expect(estimate?.miles).toBe(325000);
    expect(estimate?.cabin).toBe('business');
    expect(estimate?.confidence).toBe('official-fixed');
  });

  test('returns Cathay distance-band price', () => {
    const estimate = estimateAwardPrice(
      catalog,
      'cx-asia-miles-oneworld-multi-carrier-award',
      19000,
      'business',
    );

    expect(estimate?.band).toEqual({ minMiles: 18001, maxMiles: 20000 });
    expect(estimate?.miles).toBe(230000);
    expect(estimate?.confidence).toBe('reference-recheck');
  });

  test('returns Qantas OWCFR top-bracket business price (pre-Aug-2025 chart era)', () => {
    const estimate = estimateAwardPrice(
      catalog,
      'qantas-oneworld-classic-flight-reward',
      25000,
      'business',
    );

    expect(estimate?.miles).toBe(318000);
    expect(estimate?.band).toEqual({ minMiles: 19201, maxMiles: 35000 });
    // The catalog schema grades products official-fixed | published-chart |
    // reference-recheck; "chart-verified" is calibration-set research
    // vocabulary and rides in this entry's notes instead.
    expect(estimate?.confidence).toBe('reference-recheck');
  });

  test('Qantas partial chart returns null for unpriced cabin and beyond-cap distances', () => {
    const qf = 'qantas-oneworld-classic-flight-reward';
    // Only business is priced in the single verified bracket (19,201-35,000).
    expect(estimateAwardPrice(catalog, qf, 25000, 'economy')).toBeNull();
    expect(estimateAwardPrice(catalog, qf, 25000, 'first')).toBeNull();
    // Nothing is priced past the 35,000-mile cap.
    expect(estimateAwardPrice(catalog, qf, 35500, 'business')).toBeNull();
    expect(estimateAwardPrice(catalog, qf, 35500, 'economy')).toBeNull();
  });

  test('returns null for premium economy when product has no price', () => {
    const estimate = estimateAwardPrice(
      catalog,
      'cx-asia-miles-oneworld-multi-carrier-award',
      19000,
      'premium-economy',
    );

    expect(estimate).toBeNull();
  });

  test('prices premium economy once the chart actually carries a PE price (A8 schema extension)', () => {
    const estimate = estimateAwardPrice(peFixtureCatalog, 'fixture-pe-band', 21000, 'premium-economy');

    expect(estimate?.cabin).toBe('premium-economy');
    expect(estimate?.miles).toBe(120000);
  });
});

describe('priceRtwItinerary', () => {
  // Inline fixture catalog — mixed-cabin mechanics only; real products are
  // pinned by tests above and by the calibration suite.
  const fixtureCatalog = AwardPricingCatalogSchema.parse({
    version: '2026.2',
    lastVerified: '2026-05-23',
    products: [
      {
        productId: 'fixture-rtw',
        label: 'Fixture RTW product',
        pricingModel: 'distance-band',
        confidence: 'official-fixed',
        currency: 'miles',
        sourceUrls: ['https://example.com/chart'],
        bands: [
          { minMiles: 0, maxMiles: null, prices: { economy: 100000, business: 200000, first: 400000 } },
        ],
      },
    ],
  });

  const leg = (cabin?: CabinId): Leg =>
    cabin === undefined
      ? { from: 'TPE', to: 'NRT', operatingCarrier: 'BR' }
      : { from: 'TPE', to: 'NRT', operatingCarrier: 'BR', cabin };

  test('prices a mixed itinerary at the highest booked cabin (any-F-sector → First)', () => {
    const legs: Leg[] = [leg('economy'), leg('first'), leg(undefined)];

    const estimate = priceRtwItinerary(fixtureCatalog, 'fixture-rtw', 21000, legs, 'business');

    expect(estimate?.cabin).toBe('first');
    expect(estimate?.miles).toBe(400000);
  });

  test('falls back to the routing cabin when no leg books higher', () => {
    const legs: Leg[] = [leg('economy'), leg(undefined), leg('economy')];

    const estimate = priceRtwItinerary(fixtureCatalog, 'fixture-rtw', 21000, legs, 'business');

    expect(estimate?.cabin).toBe('business');
    expect(estimate?.miles).toBe(200000);
  });

  test('premium-economy highest cabin stays unpriced (null, not a guess)', () => {
    const legs: Leg[] = [leg('economy'), leg('premium-economy')];

    const estimate = priceRtwItinerary(fixtureCatalog, 'fixture-rtw', 21000, legs, 'economy');

    expect(estimate).toBeNull();
  });

  test('premium-economy highest cabin prices through a chart that carries PE (A8)', () => {
    const legs: Leg[] = [leg('economy'), leg('premium-economy')];

    const estimate = priceRtwItinerary(peFixtureCatalog, 'fixture-pe-band', 21000, legs, 'economy');

    expect(estimate?.cabin).toBe('premium-economy');
    expect(estimate?.miles).toBe(120000);
  });
});

describe('quoteAwardZone', () => {
  test('quotes every cabin of the EVA fixed RTW award with its band bounds', () => {
    const quote = quoteAwardZone(catalog, 'br-infinity-star-alliance-world-travel-award', 24000);

    expect(quote?.label).toBe('EVA Infinity MileageLands Star Alliance World Travel Award');
    expect(quote?.confidence).toBe('official-fixed');
    // Single open-ended fixed-rtw band in public/data/award-pricing/current.json.
    expect(quote?.band).toEqual({ minMiles: 0, maxMiles: null });
    expect(quote?.prices).toEqual({ economy: 180000, business: 325000, first: 480000 });
  });

  test('quotes the Cathay zone at 19000 miles with live catalog prices', () => {
    const quote = quoteAwardZone(catalog, 'cx-asia-miles-oneworld-multi-carrier-award', 19000);

    expect(quote?.band).toEqual({ minMiles: 18001, maxMiles: 20000 });
    expect(quote?.confidence).toBe('reference-recheck');
    // Values transcribed from the live catalog JSON — asserted so any chart
    // drift fails loudly here instead of silently in the UI.
    expect(quote?.prices.economy).toBe(115000);
    expect(quote?.prices.business).toBe(230000);
    expect(quote?.prices.first).toBe(330000);
  });

  test('honest partial chart: ANA archived quote pins business only', () => {
    const quote = quoteAwardZone(catalog, 'ana-star-alliance-rtw-award', 21000);

    expect(quote?.band).toEqual({ minMiles: 20001, maxMiles: 22000 });
    // Archived chart is business-only; unpriced cabins are omitted keys,
    // never explicit undefined placeholders.
    expect(quote?.prices).toEqual({ business: 125000 });
    expect(Object.keys(quote?.prices ?? {})).toEqual(['business']);
    expect(quote?.prices.economy).toBeUndefined();
    expect(quote?.prices.first).toBeUndefined();
  });

  test('quotes the Qantas single verified band with business-only price keys', () => {
    const quote = quoteAwardZone(catalog, 'qantas-oneworld-classic-flight-reward', 25000);

    expect(quote?.label).toBe('Qantas oneworld Classic Flight Reward');
    expect(quote?.band).toEqual({ minMiles: 19201, maxMiles: 35000 });
    // Business-only verified bracket; unpriced cabins stay absent keys.
    expect(quote?.prices).toEqual({ business: 318000 });
    expect(Object.keys(quote?.prices ?? {})).toEqual(['business']);
  });

  test('includes premiumEconomy in the price record when the chart carries it (A8)', () => {
    const quote = quoteAwardZone(peFixtureCatalog, 'fixture-pe-band', 21000);

    expect(quote?.prices).toEqual({ economy: 100000, premiumEconomy: 120000, business: 200000 });
  });

  test('returns null for an unknown productId', () => {
    expect(quoteAwardZone(catalog, 'no-such-product', 21000)).toBeNull();
  });

  test('returns null outside the covered distance range', () => {
    const cx = 'cx-asia-miles-oneworld-multi-carrier-award';
    // Lowest CX band starts at minMiles 0 — nothing quotes below it.
    expect(quoteAwardZone(catalog, cx, -1)).toBeNull();
    // Highest covered CX band ends at maxMiles 50,000.
    expect(quoteAwardZone(catalog, cx, 50001)).toBeNull();
  });
});

describe('zone-pair pricing (china-airlines-skyteam-partner-award, docs/calibration-set.md §A8)', () => {
  const CI = 'china-airlines-skyteam-partner-award';

  test('distance-based functions return null for a zone-pair product (behavior preserved)', () => {
    // Zone charts price region pairs, never total distance: the distance
    // path must not silently fabricate a band for them.
    expect(estimateAwardPrice(catalog, CI, 9000, 'business')).toBeNull();
    expect(priceRtwItinerary(catalog, CI, 9000, [{ from: 'TPE', to: 'LHR', operatingCarrier: 'CI', cabin: 'business' }], 'business')).toBeNull();
    expect(quoteAwardZone(catalog, CI, 9000)).toBeNull();
  });

  test('getZonePairQuote pins the §A8 sample cells (Era-2 chart, RT miles)', () => {
    const neaEu = getZonePairQuote(catalog, CI, 'NEA', 'EU', 'business');
    expect(neaEu?.miles).toBe(160000);
    expect(neaEu?.cabin).toBe('business');
    expect(neaEu?.originRegion).toBe('NEA');
    expect(neaEu?.destinationRegion).toBe('EU');
    expect(neaEu?.confidence).toBe('published-chart');
    expect(neaEu?.prices).toEqual({ economy: 110000, premiumEconomy: 120000, business: 160000 });

    expect(getZonePairQuote(catalog, CI, 'NEA', 'SWP', 'economy')?.miles).toBe(110000);

    const swpSwp = getZonePairQuote(catalog, CI, 'SWP', 'SWP', 'economy');
    expect(swpSwp?.miles).toBe(35000);
    expect(swpSwp?.prices).toEqual({ economy: 35000, premiumEconomy: 45000, business: 60000 });
  });

  test('getZonePairQuote matches either direction (unordered upper-triangle chart)', () => {
    const forward = getZonePairQuote(catalog, CI, 'EU', 'NEA', 'business');
    expect(forward?.miles).toBe(160000);
    // Canonical stored direction is reported regardless of query direction.
    expect(forward?.originRegion).toBe('NEA');
    expect(forward?.destinationRegion).toBe('EU');
  });

  test('getZonePairQuote returns null on misses and unpriced cabins', () => {
    // Unknown region abbreviations are misses, not guesses.
    expect(getZonePairQuote(catalog, CI, 'TPE', 'EU', 'business')).toBeNull();
    expect(getZonePairQuote(catalog, CI, 'XX', 'YY', 'economy')).toBeNull();
    // Unknown productId / non-zone-pair product.
    expect(getZonePairQuote(catalog, 'no-such-product', 'NEA', 'EU', 'business')).toBeNull();
    expect(
      getZonePairQuote(catalog, 'qantas-oneworld-classic-flight-reward', 'NEA', 'EU', 'business'),
    ).toBeNull();
    // Era-2 discontinued First Class — unpriced cabin stays an omitted key,
    // surfaced as null rather than a guessed number.
    expect(getZonePairQuote(catalog, CI, 'NEA', 'EU', 'first')).toBeNull();
  });
});
