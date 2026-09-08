import { readFileSync } from 'node:fs';
import { describe, expect, test } from 'vitest';
import { findSeasonalItinerary, seasonalItineraryLegs } from '../../../src/lib/rtw/seasonal-itinerary.ts';
import { SeasonalRtwTemplateSchema } from '../../../src/lib/schemas/rtw-seasonal.ts';

const template = SeasonalRtwTemplateSchema.parse(JSON.parse(
  readFileSync('public/data/rtw-seasonal/eva-star-w26.json', 'utf8'),
));

function identities(start: string): string[] {
  const result = findSeasonalItinerary(template, start);
  expect(result.ok).toBe(true);
  if (!result.ok) return [];
  return result.flights.map((flight) => `${flight.date} ${flight.carrier}${flight.flightNumber}`);
}

describe('seasonal RTW itinerary solver', () => {
  test('finds a conservative November variant from the benchmark start date', () => {
    expect(identities('2026-11-02')).toEqual([
      '2026-11-02 BR198',
      '2026-11-04 NH6',
      '2026-11-06 UA2743',
      '2026-11-08 UA14',
      '2026-11-11 LH901',
      '2026-11-13 LH780',
      '2026-11-16 TG404',
      '2026-11-18 BR202',
    ]);
  });

  test('finds a different valid December itinerary and can switch flight number', () => {
    expect(identities('2026-12-05')).toEqual([
      '2026-12-05 BR198',
      '2026-12-07 NH6',
      '2026-12-09 UA2303',
      '2026-12-13 UA14',
      '2026-12-16 LH901',
      '2026-12-18 LH780',
      '2026-12-21 TG404',
      '2026-12-23 BR202',
    ]);
  });

  test('converts a found schedule into planner legs without inventing cabin or manual provenance', () => {
    const result = findSeasonalItinerary(template, '2026-12-05');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const legs = seasonalItineraryLegs(result);
    expect(legs).toHaveLength(8);
    expect(legs[0]).toEqual({
      from: 'TPE', to: 'NRT', operatingCarrier: 'BR', flightNumber: '198', departsOn: '2026-12-05', stopover: true,
    });
    expect(legs.at(-1)?.stopover).toBe(false);
    expect(legs.some((leg) => 'cabin' in leg || 'manual' in leg)).toBe(false);
  });

  test('uses Lufthansa fallback later in winter and respects BR202 weekdays', () => {
    const result = findSeasonalItinerary(template, '2027-02-20');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.flights.some((flight) => flight.flightNumber === '915')).toBe(true);
    const last = result.flights.at(-1)!;
    expect(last.carrier).toBe('BR');
    expect(last.flightNumber).toBe('202');
    expect([1, 3, 4, 6]).toContain(((new Date(`${last.date}T00:00:00Z`).getUTCDay() + 6) % 7) + 1);
    for (let index = 0; index < result.flights.length - 1; index++) {
      const current = result.flights[index]!;
      const next = result.flights[index + 1]!;
      const gapDays = Math.round((Date.parse(`${next.date}T00:00:00Z`) - Date.parse(`${current.arrivalDate}T00:00:00Z`)) / 86400000);
      expect(gapDays).toBeGreaterThanOrEqual(2);
    }
  });

  test('fails honestly when the remaining seasonal window cannot fit the trip', () => {
    expect(findSeasonalItinerary(template, '2027-03-20')).toMatchObject({
      ok: false,
      reason: 'no-flight',
      requestedStartDate: '2027-03-20',
    });
  });

  test('rejects invalid and out-of-window start dates', () => {
    expect(findSeasonalItinerary(template, '2026-02-30')).toEqual({
      ok: false, reason: 'invalid-start-date', requestedStartDate: '2026-02-30',
    });
    expect(findSeasonalItinerary(template, '2026-10-31')).toEqual({
      ok: false, reason: 'outside-search-window', requestedStartDate: '2026-10-31',
    });
  });

  test('schema rejects broken source/pattern references and broken chains', () => {
    const raw = JSON.parse(readFileSync('public/data/rtw-seasonal/eva-star-w26.json', 'utf8'));
    const badSource = structuredClone(raw);
    badSource.patterns[0].sourceIds = ['missing'];
    expect(SeasonalRtwTemplateSchema.safeParse(badSource).success).toBe(false);

    const badPattern = structuredClone(raw);
    badPattern.segments[0].patternIds = ['missing'];
    expect(SeasonalRtwTemplateSchema.safeParse(badPattern).success).toBe(false);

    const badChain = structuredClone(raw);
    badChain.segments[1].from = 'HND';
    expect(SeasonalRtwTemplateSchema.safeParse(badChain).success).toBe(false);
  });
});
