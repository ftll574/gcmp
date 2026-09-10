import { describe, expect, test } from 'vitest';
import { summarizeFlightDataQuality } from '../../../src/lib/rtw/flight-data-quality.ts';
import { ScheduleCatalogSchema } from '../../../src/lib/schemas/flight-schedules.ts';
import { OfficialScheduleCatalogSchema } from '../../../src/lib/schemas/published-schedules.ts';
import { RouteNetworkCatalogSchema } from '../../../src/lib/schemas/route-network.ts';

describe('flight data quality audit', () => {
  test('keeps route, flight-number and fresh dated evidence as separate coverage layers', () => {
    const network = RouteNetworkCatalogSchema.parse({
      version: '2026.3', coverage: 'curated-not-complete',
      sources: [{ id: 'fresh', url: 'https://example.com/fresh', checkedOn: '2026-09-10', note: 'fresh' },
        { id: 'old', url: 'https://example.com/old', checkedOn: '2026-08-01', note: 'old' }],
      routes: [
        { carrier: 'AA', pair: ['AAA', 'BBB'], service: 'nonstop', status: 'published', carrierIdentity: 'operating', sourceIds: ['fresh'], flightNumbers: ['AA1'], flightNumberSourceIds: ['fresh'] },
        { carrier: 'AA', pair: ['AAA', 'CCC'], service: 'nonstop', status: 'published', carrierIdentity: 'provider-listed', sourceIds: ['old'], flightNumberCandidates: ['AA2'], flightNumberCandidateSourceIds: ['old'] },
        { carrier: 'BB', pair: ['BBB', 'CCC'], service: 'nonstop', status: 'published', carrierIdentity: 'operating', sourceIds: ['fresh'] },
      ],
    });
    const schedules = ScheduleCatalogSchema.parse({
      version: '2026.3', lastVerified: '2026-09-10', entries: [
        { carrier: 'AA', pair: ['AAA', 'BBB'], daysOfWeek: [5], status: 'operating', confidence: 'chart-verified', sourceUrls: ['https://example.com/schedule'], effectiveFrom: '2026-09-01', effectiveUntil: '2026-09-30' },
        { carrier: 'BB', pair: ['BBB', 'CCC'], daysOfWeek: [5], status: 'operating', confidence: 'chart-verified', sourceUrls: ['https://example.com/expired'], effectiveUntil: '2026-08-31' },
      ],
    });
    const official = OfficialScheduleCatalogSchema.parse({
      version: 1,
      sources: {
        current: { name: 'Current', url: 'https://example.com/current', kind: 'airline-publication', checkedAt: '2026-09-10T00:00:00.000Z', reviewBy: '2026-09-20T00:00:00.000Z' },
        expired: { name: 'Expired', url: 'https://example.com/expired-official', kind: 'airline-publication', checkedAt: '2026-08-01T00:00:00.000Z', reviewBy: '2026-08-20T00:00:00.000Z' },
      },
      services: [
        { id: 'aa-current', carrier: 'AA', flightNumber: '2', from: 'AAA', to: 'CCC', effectiveFrom: '2026-09-01', effectiveUntil: '2026-09-30', daysOfWeek: [5], addedDates: [], removedDates: [], sourceId: 'current' },
        { id: 'bb-expired', carrier: 'BB', flightNumber: '3', from: 'BBB', to: 'CCC', effectiveFrom: '2026-09-01', effectiveUntil: '2026-09-30', daysOfWeek: [5], addedDates: [], removedDates: [], sourceId: 'expired' },
      ],
      flightNumberReferences: [],
    });

    const report = summarizeFlightDataQuality(network, schedules, official, '2026-09-11');
    expect(report.routeEvidence).toMatchObject({
      activePublishedRoutes: 3, confirmedOperatingRoutes: 2, providerListedOnlyRoutes: 1,
      confirmedFlightNumberRoutes: 1, confirmedOperatingFlightNumberRoutes: 1, candidateOnlyFlightNumberRoutes: 1,
    });
    expect(report.datedEvidence).toMatchObject({ catalogMatchedRoutes: 3, activeDatedScheduleRoutes: 2 });
    expect(report.datedEvidence.activeDatedCoveragePercent).toBeCloseTo(66.667, 3);
    expect(report.freshness).toMatchObject({
      referencedRouteSources: 2, routeSourcesOlderThan30Days: 1,
      officialSourcesFreshForAsOf: 1, officialSourcesExpiredForAsOf: 1,
    });
    expect(report.carriers.find((row) => row.carrier === 'AA')?.activeDatedScheduleRoutes).toBe(2);
    expect(report.carriers.find((row) => row.carrier === 'BB')?.activeDatedScheduleRoutes).toBe(0);
  });
});
