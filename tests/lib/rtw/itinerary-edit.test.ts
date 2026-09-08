import { describe, expect, test } from 'vitest';
import { clearLegField, reindexLegs } from '../../../src/lib/rtw/itinerary-edit.ts';
import type { FlightLeg, Leg } from '../../../src/lib/types.ts';

const full: FlightLeg = Object.freeze({
  from: 'TPE', to: 'NRT', operatingCarrier: 'BR', fareClass: 'J', cabin: 'business',
  stopover: true, departsOn: '2026-11-02', flightNumber: '189', manual: true,
});

describe('single-field clearing', () => {
  test.each(['fareClass', 'cabin', 'stopover', 'departsOn', 'flightNumber', 'manual'] as const)(
    'clears only %s without mutating any other field', (key) => {
      const cleared = clearLegField(full, key);
      expect(Object.hasOwn(cleared, key)).toBe(false);
      expect({ ...cleared, [key]: full[key] }).toEqual(full);
      expect(full.departsOn).toBe('2026-11-02');
    },
  );
  test('clearing an already absent field is harmless', () => {
    const plain: Leg = { from: 'A', to: 'B', operatingCarrier: 'BR' };
    expect(clearLegField(plain, 'departsOn')).toEqual(plain);
  });
});

describe('airport occurrence identity', () => {
  const legs: Leg[] = [
    { ...full, from: 'A', to: 'B', departsOn: '2026-11-02' },
    { ...full, from: 'B', to: 'A', departsOn: '2026-11-04' },
    { ...full, from: 'A', to: 'B', operatingCarrier: 'UA', departsOn: '2026-11-06' },
    { ...full, from: 'B', to: 'C', operatingCarrier: 'NH', departsOn: '2026-11-08' },
  ];
  test('no edit preserves all leg objects', () => {
    const next = reindexLegs(legs, [0, 1, 2, 3, 4], 'BR');
    expect(next).toEqual(legs);
    next.forEach((leg, index) => expect(leg).toBe(legs[index]));
  });
  test('deleting earlier airports preserves the correct repeated A-B occurrence', () => {
    const next = reindexLegs(legs, [2, 3, 4], 'BR');
    expect(next).toEqual([legs[2], legs[3]]);
    expect(next[0]).toBe(legs[2]);
  });
  test('a deleted stop creates a fresh connection without stealing metadata', () => {
    expect(reindexLegs(legs, [0, 3, 4], 'BR')).toEqual([
      { from: 'A', to: 'B', operatingCarrier: 'BR' }, legs[3],
    ]);
  });
  test('moving an intact pair preserves its metadata, not reversed/new connections', () => {
    expect(reindexLegs(legs, [2, 3, 0, 1, 4], 'BR')).toEqual([
      legs[2], { from: 'B', to: 'A', operatingCarrier: 'BR' }, legs[0],
      { from: 'B', to: 'C', operatingCarrier: 'BR' },
    ]);
  });
  test('zero/one airport produces no legs', () => {
    expect(reindexLegs([], [], 'BR')).toEqual([]);
    expect(reindexLegs(legs, [2], 'BR')).toEqual([]);
    expect(reindexLegs(legs, [], 'BR')).toEqual([]);
  });
  test.each([[0, 0], [-1, 1], [0, 5], [0, 1.5]])('rejects invalid order %j', (...indexes) => {
    expect(() => reindexLegs(legs, indexes, 'BR')).toThrow(RangeError);
  });
});
