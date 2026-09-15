import { describe, expect, test } from 'vitest';
import {
  buildCandidateEntries,
  designatorFromCallsign,
  quarterMonths,
  type MrAirspaceRow,
} from '../../scripts/lib/mrairspace-core.ts';

const ICAO_TO_IATA = new Map([
  ['EVA', 'BR'],
  ['CAL', 'CI'],
  ['SJX', 'JX'],
  ['CCA', 'CA'],
  ['UAL', 'UA'],
]);

const ICAO_TO_IATA_AIRPORTS = new Map([
  ['RCTP', 'TPE'],
  ['RJTT', 'HND'],
  ['VHHH', 'HKG'],
  ['KSFO', 'SFO'],
  ['KLAX', 'LAX'],
]);

function row(partial: Partial<MrAirspaceRow>): MrAirspaceRow {
  return {
    Airline: 'EVA',
    Callsign: 'EVA008',
    Track_Origin_DateTime_UTC: '2026-05-01 00:00:00',
    Track_Destination_DateTime_UTC: '2026-05-01 01:30:00',
    Track_Origin_ApplicableAirports: 'RCTP',
    Track_Destination_ApplicableAirports: 'RJTT',
    Route_Validation_Based_on_Callsign: '1',
    ...partial,
  };
}

describe('quarterMonths', () => {
  test('maps each quarter to its three months', () => {
    expect(quarterMonths('2026-Q2')).toEqual(['2026-04', '2026-05', '2026-06']);
    expect(quarterMonths('2026-Q4')).toEqual(['2026-10', '2026-11', '2026-12']);
  });
  test('rejects malformed quarters', () => {
    expect(quarterMonths('2026-Q5')).toBeNull();
    expect(quarterMonths('garbage')).toBeNull();
  });
});

describe('designatorFromCallsign', () => {
  test('converts a validated same-airline callsign to an IATA-style designator', () => {
    expect(designatorFromCallsign('EVA', 'EVA008', 'BR')).toBe('BR8');
    expect(designatorFromCallsign('EVA', 'EVA100', 'BR')).toBe('BR100');
  });
  test('does not guess when the ICAO prefix does not match', () => {
    expect(designatorFromCallsign('EVA', 'CX450', 'BR')).toBeNull();
  });
  test('drops non-numeric suffixes', () => {
    expect(designatorFromCallsign('EVA', 'EVAHEAVY', 'BR')).toBeNull();
  });
});

describe('buildCandidateEntries', () => {
  const options = {
    quarter: '2026-Q2',
    airlineIcaoToIata: ICAO_TO_IATA,
    airportIcaoToIata: ICAO_TO_IATA_AIRPORTS,
    quarterMonths: ['2026-04', '2026-05', '2026-06'],
  };

  test('filters rows outside the quarter by ORIGIN month (no drop_duplicates)', () => {
    const rows = [
      row({ Track_Origin_DateTime_UTC: '2026-03-31 23:59:00' }), // Q1 — excluded
      row({ Track_Origin_DateTime_UTC: '2026-04-01 00:00:00' }), // Q2 — included
      row({ Track_Origin_DateTime_UTC: '2026-06-30 23:59:00' }), // Q2 — included
    ];
    const entries = buildCandidateEntries(rows, options);
    expect(entries).toHaveLength(1);
    expect(entries[0]!.observationCount).toBe(2);
    expect(entries[0]!.firstSeenUtc.startsWith('2026-04-01')).toBe(true);
    expect(entries[0]!.lastSeenUtc.startsWith('2026-06-30')).toBe(true);
  });

  test('drops rows with unauthenticated airlines / unresolvable airports', () => {
    const rows = [
      row({ Airline: '' }), // GA / no airline
      row({ Airline: 'EVA', Track_Origin_ApplicableAirports: '-' }), // no origin airport
      row({ Airline: 'ZZZ' }), // unknown ICAO → no IATA
    ];
    expect(buildCandidateEntries(rows, options)).toHaveLength(0);
  });

  test('requires ≥2 observations per route', () => {
    const entries = buildCandidateEntries([row({})], options);
    expect(entries).toHaveLength(0);
  });

  test('accumulates flight numbers across rows and sorts deterministically', () => {
    const rows = [
      row({ Callsign: 'EVA008', Track_Origin_DateTime_UTC: '2026-04-02 00:00:00' }),
      row({ Callsign: 'EVA010', Track_Origin_DateTime_UTC: '2026-04-03 00:00:00' }),
    ];
    const entries = buildCandidateEntries(rows, options);
    expect(entries).toHaveLength(1);
    expect(entries[0]!.flightNumbers).toEqual(['BR10', 'BR8']);
    expect(entries[0]!.observationCount).toBe(2);
  });

  test('handles multi-airport cells by taking the first resolvable IATA', () => {
    const rows = [
      row({ Track_Origin_ApplicableAirports: 'RCTP,RCFG', Track_Destination_ApplicableAirports: 'RJTT,RJAA' }),
      row({ Track_Origin_ApplicableAirports: 'RCTP', Track_Destination_ApplicableAirports: 'RJTT' }),
    ];
    const entries = buildCandidateEntries(rows, options);
    expect(entries).toHaveLength(1);
    expect(entries[0]!.origin).toBe('TPE');
    expect(entries[0]!.destination).toBe('HND');
  });

  test('excludes rows whose enroute callsign validation failed', () => {
    const rows = [
      row({ Callsign: 'EVA008', Route_Validation_Based_on_Callsign: '1' }),
      row({ Callsign: 'EVA008', Route_Validation_Based_on_Callsign: '0' }),
    ];
    const entries = buildCandidateEntries(rows, options);
    expect(entries[0]!.flightNumbers).toEqual(['BR8']); // only the validated row contributes
  });

  test('sorts by carrier then origin then destination', () => {
    // Each route needs ≥2 observations to pass the candidate gate; give
    // every route exactly two rows (different days) and expect the
    // deterministic (carrier, origin, destination) ordering.
    const rows = [
      row({ Airline: 'SJX', Callsign: 'SJX012', Track_Origin_DateTime_UTC: '2026-04-01 00:00:00' }),
      row({ Airline: 'SJX', Callsign: 'SJX013', Track_Origin_DateTime_UTC: '2026-04-02 00:00:00' }),
      row({ Airline: 'EVA', Callsign: 'EVA008', Track_Origin_DateTime_UTC: '2026-04-01 00:00:00' }),
      row({ Airline: 'EVA', Callsign: 'EVA009', Track_Origin_DateTime_UTC: '2026-04-02 00:00:00' }),
      row({ Airline: 'EVA', Callsign: 'EVA018', Track_Origin_DateTime_UTC: '2026-04-01 00:00:00', Track_Destination_ApplicableAirports: 'KSFO' }),
      row({ Airline: 'EVA', Callsign: 'EVA019', Track_Origin_DateTime_UTC: '2026-04-02 00:00:00', Track_Destination_ApplicableAirports: 'KSFO' }),
    ];
    const entries = buildCandidateEntries(rows, options);
    expect(entries.map((e) => e.airline_iata)).toEqual(['BR', 'BR', 'JX']);
    expect(entries.map((e) => `${e.origin}-${e.destination}`)).toEqual(['TPE-HND', 'TPE-SFO', 'TPE-HND']);
  });
});
