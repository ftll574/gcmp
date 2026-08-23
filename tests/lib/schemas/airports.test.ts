import { readFileSync } from 'node:fs';
import { describe, expect, test } from 'vitest';
import {
  AirportCatalogSchema,
  AirportSchema,
  parseAirportCatalog,
} from '../../../src/lib/schemas/airports.ts';

const catalog = AirportCatalogSchema.parse(
  JSON.parse(readFileSync('public/data/airports.json', 'utf8')),
);

/** Valid row factory — each malformed case mutates exactly one field. */
function validRow(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    iata: 'TPE',
    icao: 'RCTP',
    name: 'Taiwan Taoyuan International Airport',
    city: 'Taoyuan',
    country: 'TW',
    lat: 25.0777,
    lon: 121.2328,
    ...overrides,
  };
}

describe('AirportCatalogSchema', () => {
  test('validates the real airports.json catalog', () => {
    expect(catalog.length).toBeGreaterThan(4000);
    const tpe = catalog.find((a) => a.iata === 'TPE');
    expect(tpe?.country).toBe('TW');
  });

  test('real rows pin the measured edge cases the schema was derived from', () => {
    // Digit-bearing icao survives ^[A-Z0-9]{4}$ — loosened from [A-Z]{4}
    // precisely because these exist in OurAirports-derived data.
    const oca = catalog.find((a) => a.iata === 'OCA');
    expect(oca?.icao).toBe('07FA');
    // Empty municipality is legal — 121 real rows ship city: ''.
    const axr = catalog.find((a) => a.iata === 'AXR');
    expect(axr?.city).toBe('');
    // Optional icao is a true absence, not an empty string.
    const noIcao = catalog.filter((a) => a.icao === undefined);
    expect(noIcao.length).toBeGreaterThan(0);
    expect(catalog.every((a) => a.icao !== '')).toBe(true);
    // Spot-checks per task spec: known airports resolve to expected countries.
    const vvo = catalog.find((a) => a.iata === 'VVO');
    expect(vvo?.country).toBe('RU');
    expect(vvo?.icao).toBe('UHWW');
    // WFR ships with OurAirports' literal "[Duplicate] Wolf's Fang Runway"
    // name (Antarctica strip) — free-text names tolerate it; only the
    // country is pinned here so upstream cleanup doesn't wedge this suite.
    const wfr = catalog.find((a) => a.iata === 'WFR');
    expect(wfr?.country).toBe('AQ');
  });

  test('iata must be 3 uppercase letters (no digits, no other lengths)', () => {
    expect(() => AirportSchema.parse(validRow({ iata: 'tpe' }))).toThrow();
    expect(() => AirportSchema.parse(validRow({ iata: 'TP' }))).toThrow();
    expect(() => AirportSchema.parse(validRow({ iata: 'TPEX' }))).toThrow();
    expect(() => AirportSchema.parse(validRow({ iata: 'TP3' }))).toThrow();
  });

  test('icao is optional but strict when present', () => {
    const absent = { ...validRow() };
    delete absent.icao;
    expect(() => AirportSchema.parse(absent)).not.toThrow();
    // Explicit undefined behaves like absence (zod optional semantics).
    expect(() => AirportSchema.parse(validRow({ icao: undefined }))).not.toThrow();
    // Digits are legal inside icao (e.g. "07FA").
    expect(() => AirportSchema.parse(validRow({ icao: '07FA' }))).not.toThrow();
    expect(() => AirportSchema.parse(validRow({ icao: null }))).toThrow();
    expect(() => AirportSchema.parse(validRow({ icao: '' }))).toThrow();
    expect(() => AirportSchema.parse(validRow({ icao: 'KLA' }))).toThrow();
    expect(() => AirportSchema.parse(validRow({ icao: 'RCTPX' }))).toThrow();
  });

  test('name must be non-empty; city MAY be empty', () => {
    expect(() => AirportSchema.parse(validRow({ name: '' }))).toThrow();
    expect(() => AirportSchema.parse(validRow({ city: '' }))).not.toThrow();
  });

  test('country must be ISO 3166-1 alpha-2', () => {
    expect(() => AirportSchema.parse(validRow({ country: 'USA' }))).toThrow();
    expect(() => AirportSchema.parse(validRow({ country: 'tw' }))).toThrow();
    expect(() => AirportSchema.parse(validRow({ country: '' }))).toThrow();
  });

  test('coordinates must be numeric and within WGS-84 bounds', () => {
    expect(() => AirportSchema.parse(validRow({ lat: 90.5 }))).toThrow();
    expect(() => AirportSchema.parse(validRow({ lon: -180.5 }))).toThrow();
    expect(() => AirportSchema.parse(validRow({ lat: '25.08' }))).toThrow();
    expect(() => AirportSchema.parse(validRow({ lat: -90, lon: 180 }))).not.toThrow();
  });

  test('duplicate iata anywhere in the catalog fails (index is last-wins)', () => {
    expect(() =>
      AirportCatalogSchema.parse([validRow(), validRow({ icao: undefined })]),
    ).toThrow(/Duplicate airport iata/);
    // Distinct iatas with shared everything else stay fine.
    expect(() =>
      AirportCatalogSchema.parse([validRow(), validRow({ iata: 'BKK', icao: undefined })]),
    ).not.toThrow();
  });

  test('unknown keys are stripped, not fatal (house convention)', () => {
    const parsed = AirportSchema.parse(validRow({ elevation: 42 }));
    expect(parsed).not.toHaveProperty('elevation');
  });

  test('parseAirportCatalog returns shared Airport[] shape', () => {
    const rows = parseAirportCatalog([
      validRow(),
      { ...validRow(), iata: 'BBB', icao: 'BBBB' },
    ]);
    expect(rows).toHaveLength(2);
    expect(rows[1]?.icao).toBe('BBBB');
    const noIcao = parseAirportCatalog([{ ...validRow(), icao: undefined }]);
    expect(noIcao[0]?.icao).toBeUndefined();
  });
});
