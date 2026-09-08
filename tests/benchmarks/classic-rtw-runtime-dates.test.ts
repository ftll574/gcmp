import { readFileSync } from 'node:fs';
import { describe, expect, test } from 'vitest';
import { officialScheduleCatalog } from '../../src/lib/official-schedule-catalog.ts';
import { queryOfficialSchedules } from '../../src/lib/rtw/official-schedules.ts';

interface BenchmarkFlight {
  readonly date: string;
  readonly carrier: string;
  readonly flightNumber: string;
  readonly from: string;
  readonly to: string;
  readonly departureTime: string;
  readonly arrivalTime: string;
  readonly arrivalDate: string;
}

const benchmark = JSON.parse(
  readFileSync('tests/fixtures/classic-rtw-dated-eva-2026-11.json', 'utf8'),
) as { flights: BenchmarkFlight[] };

const NOW = Date.parse('2026-09-09T00:00:00Z');

describe('classic RTW dated runtime catalog', () => {
  test('all eight benchmark flights are queryable from the product official-schedule fallback', () => {
    for (const flight of benchmark.flights) {
      const response = queryOfficialSchedules(officialScheduleCatalog, {
        from: flight.from,
        to: flight.to,
        start: flight.date,
        end: flight.date,
      }, NOW);
      const published = response.days[0]?.published ?? [];
      expect(published, `${flight.carrier}${flight.flightNumber} ${flight.from}-${flight.to}`).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            carrier: flight.carrier,
            flightNumber: flight.flightNumber,
            date: flight.date,
            departureTime: flight.departureTime,
            arrivalTime: flight.arrivalTime,
            arrivalDate: flight.arrivalDate,
          }),
        ]),
      );
    }
  });

  test('the runtime overlay is date-bounded rather than inventing adjacent-day service', () => {
    const flight = benchmark.flights[0]!;
    const response = queryOfficialSchedules(officialScheduleCatalog, {
      from: flight.from,
      to: flight.to,
      start: '2026-11-01',
      end: '2026-11-03',
    }, NOW);
    expect(response.days.find((day) => day.date === '2026-11-02')?.published?.some(
      (item) => item.carrier === 'BR' && item.flightNumber === '198',
    )).toBe(true);
    expect(response.days.find((day) => day.date === '2026-11-01')?.published?.some(
      (item) => item.carrier === 'BR' && item.flightNumber === '198',
    ) ?? false).toBe(false);
    expect(response.days.find((day) => day.date === '2026-11-03')?.published?.some(
      (item) => item.carrier === 'BR' && item.flightNumber === '198',
    ) ?? false).toBe(false);
  });
});
